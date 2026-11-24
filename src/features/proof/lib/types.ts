import type { CircuitDocument, GateNode, Signal } from "@/shared/types";

/** 一侧电路在证明台中的角色。 */
export type ProofSide = "A" | "B";

/** 输入端口映射：左边输入节点 id -> 右边输入节点 id。 */
export type InputMapping = Record<string, string>;
/** 输出端口映射：左边输出节点 id -> 右边输出节点 id。 */
export type OutputMapping = Record<string, string>;

/** 证明结论三态：确定反例 / 悬空未定 / 完整等价。 */
export type ProofVerdict =
  | "counterexample"
  | "undetermined"
  | "equivalent";

/** 证明运行状态：待配置 / 运行中（可取消）/ 已结束。 */
export type ProofStatus = "idle" | "running" | "done" | "canceled";

/** 信号路径上的一跳：经过某元件，记录其各输入端口电平和输出电平。 */
export interface PathHop {
  nodeId: string;
  label: string;
  kind: GateNode["kind"];
  inValues: Signal[];
  outValue: Signal;
}

export interface OutputTrace {
  outputId: string;
  outputLabel: string;
  value: Signal;
  hops: PathHop[];
}

export interface OutputDifference {
  leftOutputId: string;
  rightOutputId: string;
  outputLabel: string;
  leftValue: Signal;
  rightValue: Signal;
  leftTrace: OutputTrace;
  rightTrace: OutputTrace;
}

export interface ProofSnapshot {
  /** 单调自增的实验编号，每次启动证明时递增。 */
  runId: number;
  leftName: string;
  rightName: string;
  leftFingerprint: string;
  rightFingerprint: string;
  inputMapping: InputMapping;
  outputMapping: OutputMapping;
  inputCount: number;
  outputCount: number;
  totalCombinations: number;
}

export interface ProofResult {
  verdict: ProofVerdict;
  snapshot: ProofSnapshot;
  checkedCombinations: number;
  totalCombinations: number;
  /** 可重放的输入组合：输入节点 id -> 0/1（仅含已映射输入）。 */
  replayInputs: Record<string, 0 | 1>;
  /** 按映射顺序排列的输入取值，便于直接复现。 */
  replayVector: { leftId: string; rightId: string; label: string; value: 0 | 1 }[];
  differences: OutputDifference[];
  /** 悬空（X）出现在哪个输出、哪一侧。 */
  floating: {
    outputLabel: string;
    leftValue: Signal;
    rightValue: Signal;
  }[];
  canceled: boolean;
  finishedAt: number;
}

export interface ProofProgress {
  runId: number;
  done: number;
  total: number;
}

/** 待比较电路的静态描述。 */
export interface CircuitSideInfo {
  document: CircuitDocument;
  inputs: GateNode[];
  outputs: GateNode[];
  /** 不参与任何输出通路的内部门（多余门），仅用于提示。 */
  danglingGates: GateNode[];
  fingerprint: string;
}
