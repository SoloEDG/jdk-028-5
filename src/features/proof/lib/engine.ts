import type { CircuitDocument } from "@/shared/types";
import { evaluateCircuit, traceOutput } from "./trace";
import type {
  InputMapping,
  OutputDifference,
  OutputMapping,
  OutputTrace,
  ProofProgress,
  ProofResult,
  ProofSnapshot,
  ProofVerdict,
} from "./types";

export interface RunProofParams {
  snapshot: ProofSnapshot;
  left: CircuitDocument;
  right: CircuitDocument;
  /** 左侧输入 id 的规范顺序，组合位从高到低按此排列。 */
  leftInputOrder: string[];
  inputMapping: InputMapping;
  outputMapping: OutputMapping;
  isCanceled: () => boolean;
  onProgress: (progress: ProofProgress) => void;
}

const YIELD_EVERY = 2048;

function bothDeterminedDiffer(l: unknown, r: unknown): boolean {
  return (
    (l === 0 || l === 1) &&
    (r === 0 || r === 1) &&
    (l as number) !== (r as number)
  );
}

function hasUnknown(value: unknown): boolean {
  return value === "X" || value === undefined;
}

/**
 * 穷举证明：遍历全部 2^n 个输入组合（n ≤ 24），逐组比较映射后的输出。
 * 不做抽样；断开的支路和多余内部门不参与输出比较，不会因此判为不等价。
 * 每个组合都对两侧独立求值，反例可直接重放，并附带两边信号路径。
 */
export async function runProof(
  params: RunProofParams,
): Promise<ProofResult> {
  const {
    snapshot,
    left,
    right,
    leftInputOrder,
    inputMapping,
    outputMapping,
    isCanceled,
    onProgress,
  } = params;

  const n = leftInputOrder.length;
  const total = 2 ** n;
  const outputPairs = Object.entries(outputMapping);
  let checked = 0;
  let sawFloating = false;
  let floating: ProofResult["floating"] = [];
  let firstFloatReplay: Record<string, 0 | 1> = {};
  let firstFloatVector: ProofResult["replayVector"] = [];

  const buildReplay = (
    mask: number,
  ): {
    overridesLeft: Record<string, 0 | 1>;
    overridesRight: Record<string, 0 | 1>;
    vector: ProofResult["replayVector"];
  } => {
    const overridesLeft: Record<string, 0 | 1> = {};
    const overridesRight: Record<string, 0 | 1> = {};
    const vector: ProofResult["replayVector"] = [];
    leftInputOrder.forEach((leftId, index) => {
      const bit = ((mask >> (n - 1 - index)) & 1) as 0 | 1;
      const rightId = inputMapping[leftId];
      overridesLeft[leftId] = bit;
      overridesRight[rightId] = bit;
      const node = left.nodes.find((item) => item.id === leftId);
      vector.push({ leftId, rightId, label: node?.label ?? leftId, value: bit });
    });
    return { overridesLeft, overridesRight, vector };
  };

  for (let mask = 0; mask < total; mask++) {
    if ((mask & (YIELD_EVERY - 1)) === 0) {
      // 让出主线程，使工作台在证明期间仍可编辑，并及时响应取消。
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (isCanceled()) {
        return finish("undetermined", true);
      }
      onProgress({ runId: snapshot.runId, done: mask, total });
    }

    const { overridesLeft, overridesRight, vector } = buildReplay(mask);
    const evalLeft = evaluateCircuit(left, overridesLeft);
    const evalRight = evaluateCircuit(right, overridesRight);

    let comboCounterexample: OutputDifference[] = [];
    let comboFloating: ProofResult["floating"] = [];

    for (const [leftOutputId, rightOutputId] of outputPairs) {
      const l = evalLeft.values[leftOutputId];
      const r = evalRight.values[rightOutputId];
      const leftNode = left.nodes.find((item) => item.id === leftOutputId);
      const label = leftNode?.label ?? leftOutputId;

      if (bothDeterminedDiffer(l, r)) {
        const leftTrace: OutputTrace = traceOutput(evalLeft, leftOutputId);
        const rightTrace: OutputTrace = traceOutput(evalRight, rightOutputId);
        comboCounterexample.push({
          leftOutputId,
          rightOutputId,
          outputLabel: label,
          leftValue: l as 0 | 1,
          rightValue: r as 0 | 1,
          leftTrace,
          rightTrace,
        });
      } else if (hasUnknown(l) || hasUnknown(r)) {
        comboFloating.push({
          outputLabel: label,
          leftValue: (l ?? "X") as OutputDifference["leftValue"],
          rightValue: (r ?? "X") as OutputDifference["rightValue"],
        });
      }
    }

    checked = mask + 1;

    if (comboCounterexample.length > 0) {
      onProgress({ runId: snapshot.runId, done: checked, total });
      return {
        verdict: "counterexample",
        snapshot,
        checkedCombinations: checked,
        totalCombinations: total,
        replayInputs: overridesLeft,
        replayVector: vector,
        differences: comboCounterexample,
        floating: [],
        canceled: false,
        finishedAt: Date.now(),
      };
    }

    if (comboFloating.length > 0 && !sawFloating) {
      sawFloating = true;
      floating = comboFloating;
      firstFloatReplay = overridesLeft;
      firstFloatVector = vector;
    }
  }

  function finish(verdict: ProofVerdict, canceled: boolean): ProofResult {
    const undetermined = verdict !== "equivalent";
    return {
      verdict,
      snapshot,
      checkedCombinations: checked,
      totalCombinations: total,
      replayInputs: undetermined ? firstFloatReplay : {},
      replayVector: undetermined ? firstFloatVector : [],
      differences: [],
      floating: undetermined ? floating : [],
      canceled,
      finishedAt: Date.now(),
    };
  }

  onProgress({ runId: snapshot.runId, done: total, total });
  const verdict: ProofVerdict = sawFloating ? "undetermined" : "equivalent";
  return finish(verdict, false);
}
