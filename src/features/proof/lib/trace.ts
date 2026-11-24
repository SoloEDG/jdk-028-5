import type { CircuitDocument, GateNode, Signal } from "@/shared/types";
import { getSpec } from "@/features/catalog";
import { topologicalOrder } from "@/features/circuit";
import { gateValue } from "@/features/simulation/lib/logic";
import type { OutputTrace, PathHop } from "./types";

interface Evaluated {
  order: string[];
  values: Record<string, Signal>;
  pins: Record<string, Signal[]>;
  nodes: Map<string, GateNode>;
  incoming: Map<string, { wire: { from: { nodeId: string } }; port: number }[]>;
}

/** 与仿真台一致的求值，同时保留每个元件的输入端口电平，供路径回溯。 */
export function evaluateCircuit(
  document: CircuitDocument,
  overrides: Record<string, 0 | 1>,
): Evaluated {
  const order = topologicalOrder(document);
  const values: Record<string, Signal> = Object.create(null);
  const pins: Record<string, Signal[]> = Object.create(null);
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const incoming = new Map(
    document.nodes.map((node) => [
      node.id,
      document.wires
        .filter((wire) => wire.to.nodeId === node.id)
        .map((wire) => ({ wire, port: wire.to.port })),
    ]),
  );
  for (const id of order) {
    const node = nodes.get(id)!;
    pins[id] = Array.from(
      { length: getSpec(node.kind).inputs },
      (_, port) => {
        const link = incoming.get(id)!.find((item) => item.port === port);
        return link ? (values[link.wire.from.nodeId] ?? "X") : "X";
      },
    );
    values[id] =
      node.kind === "INPUT"
        ? (Object.hasOwn(overrides, id) ? overrides[id] : node.value)
        : gateValue(node.kind, pins[id]);
  }
  return { order, values, pins, nodes, incoming };
}

/** 从某个输出节点回溯，给出输入到输出方向上经过的全部元件跳。 */
export function traceOutput(
  evaluated: Evaluated,
  outputId: string,
): OutputTrace {
  const ancestors = new Set<string>();
  const stack = [outputId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    for (const link of evaluated.incoming.get(id) ?? [])
      stack.push(link.wire.from.nodeId);
  }
  const hops: PathHop[] = [];
  for (const id of evaluated.order) {
    if (!ancestors.has(id)) continue;
    const node = evaluated.nodes.get(id)!;
    if (node.kind === "INPUT") continue;
    hops.push({
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      inValues: evaluated.pins[id] ?? [],
      outValue: evaluated.values[id] ?? "X",
    });
  }
  const output = evaluated.nodes.get(outputId)!;
  return {
    outputId,
    outputLabel: output.label,
    value: evaluated.values[outputId] ?? "X",
    hops,
  };
}
