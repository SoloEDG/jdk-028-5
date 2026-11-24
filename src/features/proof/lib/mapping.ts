import type { GateNode } from "@/shared/types";
import type {
  CircuitSideInfo,
  InputMapping,
  OutputMapping,
} from "./types";

export const MAX_INPUTS = 24;

export interface MappingValidation {
  ok: boolean;
  errors: string[];
}

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

/** 校验输入/输出映射：数量一致、双向唯一、数量不超过 24、无悬空引用。 */
export function validateMapping(
  left: CircuitSideInfo,
  right: CircuitSideInfo,
  inputMapping: InputMapping,
  outputMapping: OutputMapping,
): MappingValidation {
  const errors: string[] = [];
  const leftInputIds = left.inputs.map((node) => node.id);
  const rightInputIds = right.inputs.map((node) => node.id);
  const leftOutputIds = left.outputs.map((node) => node.id);
  const rightOutputIds = right.outputs.map((node) => node.id);

  if (leftInputIds.length === 0 || rightInputIds.length === 0)
    errors.push("两边电路都至少需要一个输入元件。");
  if (leftOutputIds.length === 0 || rightOutputIds.length === 0)
    errors.push("两边电路都至少需要一个输出元件。");
  if (leftInputIds.length > MAX_INPUTS || rightInputIds.length > MAX_INPUTS)
    errors.push(`证明台最多支持 ${MAX_INPUTS} 个输入。`);
  if (leftInputIds.length !== rightInputIds.length)
    errors.push(
      `输入数量不一致：左侧 ${leftInputIds.length} 个，右侧 ${rightInputIds.length} 个。`,
    );
  if (leftOutputIds.length !== rightOutputIds.length)
    errors.push(
      `输出数量不一致：左侧 ${leftOutputIds.length} 个，右侧 ${rightOutputIds.length} 个。`,
    );

  const mappedLeftInputs = Object.keys(inputMapping);
  const mappedRightInputs = Object.values(inputMapping);
  const mappedLeftOutputs = Object.keys(outputMapping);
  const mappedRightOutputs = Object.values(outputMapping);

  if (
    mappedLeftInputs.length !== leftInputIds.length ||
    !mappedLeftInputs.every((id) => leftInputIds.includes(id))
  )
    errors.push("存在未对应或已失效的输入。");
  if (
    mappedRightInputs.length !== rightInputIds.length ||
    !mappedRightInputs.every((id) => rightInputIds.includes(id))
  )
    errors.push("存在未对应或已失效的输入。");
  if (!unique(mappedRightInputs)) errors.push("右侧输入被重复对应。");

  if (
    mappedLeftOutputs.length !== leftOutputIds.length ||
    !mappedLeftOutputs.every((id) => leftOutputIds.includes(id))
  )
    errors.push("存在未对应或已失效的输出。");
  if (
    mappedRightOutputs.length !== rightOutputIds.length ||
    !mappedRightOutputs.every((id) => rightOutputIds.includes(id))
  )
    errors.push("存在未对应或已失效的输出。");
  if (!unique(mappedRightOutputs)) errors.push("右侧输出被重复对应。");

  return { ok: errors.length === 0, errors };
}

function labelOf(node: GateNode): string {
  return node.label.trim().toLowerCase();
}

/** 按标签优先、位置次序兜底，生成一份初始映射建议。 */
export function suggestMappings(left: CircuitSideInfo, right: CircuitSideInfo) {
  const inputMapping: InputMapping = {};
  const outputMapping: OutputMapping = {};
  const usedRightInputs = new Set<string>();
  const usedRightOutputs = new Set<string>();

  for (const leftNode of left.inputs) {
    const match = right.inputs.find(
      (node) =>
        !usedRightInputs.has(node.id) &&
        labelOf(node) === labelOf(leftNode),
    );
    if (match) {
      inputMapping[leftNode.id] = match.id;
      usedRightInputs.add(match.id);
    }
  }
  left.inputs.forEach((leftNode, index) => {
    if (inputMapping[leftNode.id]) return;
    const fallback = right.inputs.find(
      (node) => !usedRightInputs.has(node.id),
    );
    if (fallback) {
      inputMapping[leftNode.id] = fallback.id;
      usedRightInputs.add(fallback.id);
    } else if (right.inputs[index]) {
      inputMapping[leftNode.id] = right.inputs[index].id;
    }
  });

  for (const leftNode of left.outputs) {
    const match = right.outputs.find(
      (node) =>
        !usedRightOutputs.has(node.id) &&
        labelOf(node) === labelOf(leftNode),
    );
    if (match) {
      outputMapping[leftNode.id] = match.id;
      usedRightOutputs.add(match.id);
    }
  }
  left.outputs.forEach((leftNode, index) => {
    if (outputMapping[leftNode.id]) return;
    const fallback = right.outputs.find(
      (node) => !usedRightOutputs.has(node.id),
    );
    if (fallback) {
      outputMapping[leftNode.id] = fallback.id;
      usedRightOutputs.add(fallback.id);
    } else if (right.outputs[index]) {
      outputMapping[leftNode.id] = right.outputs[index].id;
    }
  });

  return { inputMapping, outputMapping };
}
