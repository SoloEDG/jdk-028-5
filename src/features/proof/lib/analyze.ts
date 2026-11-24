import type { CircuitDocument, GateNode } from "@/shared/types";
import { topologicalOrder } from "@/features/circuit";
import type { CircuitSideInfo } from "./types";

/**
 * 电路指纹：对参与比较的结构做规范化哈希。
 * 只包含元件类型、连线关系，与元件编号、命名、坐标无关，
 * 因此两份“编号命名结构不同但拓扑同构”的电路不会因为表面差异而失效；
 * 而任何真实的结构改动都会改变指纹，用来把证明结果绑定到当时的电路。
 */
export function fingerprint(document: CircuitDocument): string {
  const kindIndex = new Map<string, number>();
  const canonicalNodes = [...document.nodes]
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      incoming: document.wires
        .filter((wire) => wire.to.nodeId === node.id)
        .map((wire) => ({
          port: wire.to.port,
          from: wire.from.nodeId,
          fromPort: wire.from.port,
        }))
        .sort((a, b) => a.port - b.port),
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      return JSON.stringify(a.incoming).localeCompare(
        JSON.stringify(b.incoming),
      );
    });
  canonicalNodes.forEach((node, index) => kindIndex.set(node.id, index));
  const payload = {
    name: undefined,
    nodes: canonicalNodes.map((node) => ({
      kind: node.kind,
      incoming: node.incoming.map((wire) => ({
        port: wire.port,
        from: kindIndex.get(wire.from),
        fromPort: wire.fromPort,
      })),
    })),
  };
  let hash = 2166136261;
  const text = JSON.stringify(payload);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}-${document.nodes.length}n${document.wires.length}w`;
}

/** 找到无法从任何 OUTPUT 节点回溯到的内部门（悬空/多余门）。 */
export function findDanglingGates(document: CircuitDocument): GateNode[] {
  const outputs = document.nodes.filter((node) => node.kind === "OUTPUT");
  const reachable = new Set<string>();
  const stack = outputs.map((node) => node.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const wire of document.wires)
      if (wire.to.nodeId === id) stack.push(wire.from.nodeId);
  }
  return document.nodes.filter(
    (node) =>
      node.kind !== "INPUT" &&
      node.kind !== "OUTPUT" &&
      !reachable.has(node.id),
  );
}

export function analyzeSide(document: CircuitDocument): CircuitSideInfo {
  // 触发一次拓扑校验：含环的组合电路直接由调用方捕获错误。
  topologicalOrder(document);
  return {
    document,
    inputs: document.nodes.filter((node) => node.kind === "INPUT"),
    outputs: document.nodes.filter((node) => node.kind === "OUTPUT"),
    danglingGates: findDanglingGates(document),
    fingerprint: fingerprint(document),
  };
}
