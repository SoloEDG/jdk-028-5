import { computed, ref } from "vue";
import type { CircuitDocument } from "@/shared/types";
import type { Notice } from "@/shared/commands";
import { decodeDocument } from "@/features/workspace/lib/codec";
import { analyzeSide } from "../lib/analyze";
import { runProof } from "../lib/engine";
import {
  MAX_INPUTS,
  suggestMappings,
  validateMapping,
} from "../lib/mapping";
import type {
  CircuitSideInfo,
  InputMapping,
  OutputMapping,
  ProofProgress,
  ProofResult,
  ProofSnapshot,
  ProofStatus,
} from "../lib/types";

export function useProof(
  document: () => CircuitDocument,
  notify: (notice: Notice) => void,
) {
  const open = ref(false);
  const status = ref<ProofStatus>("idle");
  const progress = ref<ProofProgress | null>(null);
  const result = ref<ProofResult | null>(null);
  const importError = ref<string | null>(null);
  const rightDocument = ref<CircuitDocument | null>(null);

  const left = computed<CircuitSideInfo | null>(() => {
    try {
      return analyzeSide(document());
    } catch {
      return null;
    }
  });
  const right = computed<CircuitSideInfo | null>(() => {
    if (!rightDocument.value) return null;
    try {
      return analyzeSide(rightDocument.value);
    } catch {
      return null;
    }
  });

  const inputMapping = ref<InputMapping>({});
  const outputMapping = ref<OutputMapping>({});
  let runSeq = 0;
  let cancelToken = 0;

  const leftInputOrder = computed(() =>
    (left.value?.inputs ?? []).map((node) => node.id),
  );

  const validation = computed(() => {
    if (!left.value)
      return {
        ok: false,
        errors: ["当前工作台电路无法求值（可能存在反馈环），请先在工作台修复。"],
      };
    if (!right.value)
      return { ok: false, errors: ["请先导入用于比较的另一份电路。"] };
    return validateMapping(
      left.value,
      right.value,
      inputMapping.value,
      outputMapping.value,
    );
  });

  /** 当前电路自上次建立映射/证明以来是否已被改动。 */
  const leftChanged = computed(() => {
    if (!result.value || !left.value) return false;
    return (
      result.value.snapshot.leftFingerprint !== left.value.fingerprint ||
      result.value.snapshot.leftName !== document().name
    );
  });
  const rightChanged = computed(() => {
    if (!result.value || !right.value) return false;
    return (
      result.value.snapshot.rightFingerprint !== right.value.fingerprint ||
      result.value.snapshot.rightName !== (rightDocument.value?.name ?? "")
    );
  });
  const resultStale = computed(
    () => leftChanged.value || rightChanged.value || mappingChanged.value,
  );
  const mappingChanged = computed(() => {
    if (!result.value) return false;
    const snap = result.value.snapshot;
    return (
      JSON.stringify(snap.inputMapping) !==
        JSON.stringify(inputMapping.value) ||
      JSON.stringify(snap.outputMapping) !==
        JSON.stringify(outputMapping.value)
    );
  });

  function resetMappings() {
    if (left.value && right.value) {
      const suggested = suggestMappings(left.value, right.value);
      inputMapping.value = suggested.inputMapping;
      outputMapping.value = suggested.outputMapping;
    } else {
      inputMapping.value = {};
      outputMapping.value = {};
    }
  }

  function openWorkbench() {
    open.value = true;
    status.value = "idle";
    importError.value = null;
    // 每次打开都以当前电路重新建立分析，旧结果的新鲜度由指纹判断。
    if (
      left.value &&
      right.value &&
      Object.keys(inputMapping.value).length === 0
    )
      resetMappings();
  }

  function closeWorkbench() {
    if (status.value === "running") cancel();
    open.value = false;
  }

  function importRight(text: string) {
    importError.value = null;
    try {
      const doc = decodeDocument(text);
      if (doc === document())
        throw new Error("不能把当前电路与自身比较，请选择另一份文件");
      rightDocument.value = doc;
      resetMappings();
      status.value = "idle";
      result.value = null;
      notify({ tone: "success", message: "对比电路已导入，请确认端口对应关系" });
    } catch (error) {
      importError.value = error instanceof Error
        ? error.message
        : "文件无法读取";
      notify({ tone: "error", message: `导入对比电路失败：${importError.value}` });
    }
  }

  function setInput(leftId: string, rightId: string) {
    if (rightId) inputMapping.value[leftId] = rightId;
    else delete inputMapping.value[leftId];
  }
  function setOutput(leftId: string, rightId: string) {
    if (rightId) outputMapping.value[leftId] = rightId;
    else delete outputMapping.value[leftId];
  }

  function buildSnapshot(runId: number): ProofSnapshot {
    return {
      runId,
      leftName: document().name,
      rightName: rightDocument.value!.name,
      leftFingerprint: left.value!.fingerprint,
      rightFingerprint: right.value!.fingerprint,
      inputMapping: JSON.parse(JSON.stringify(inputMapping.value)),
      outputMapping: JSON.parse(JSON.stringify(outputMapping.value)),
      inputCount: leftInputOrder.value.length,
      outputCount: Object.keys(outputMapping.value).length,
      totalCombinations: 2 ** leftInputOrder.value.length,
    };
  }

  async function start() {
    if (!left.value || !right.value || !rightDocument.value) return;
    const check = validateMapping(
      left.value,
      right.value,
      inputMapping.value,
      outputMapping.value,
    );
    if (!check.ok) {
      notify({ tone: "error", message: check.errors[0] });
      return;
    }
    if (leftInputOrder.value.length > MAX_INPUTS) {
      notify({ tone: "error", message: `证明台最多支持 ${MAX_INPUTS} 个输入` });
      return;
    }

    runSeq += 1;
    const runId = runSeq;
    cancelToken = 0;
    const snapshot = buildSnapshot(runId);
    status.value = "running";
    result.value = null;
    progress.value = {
      runId,
      done: 0,
      total: snapshot.totalCombinations,
    };

    // 对启动时刻的两份电路做快照，证明全程绑定它们，
    // 期间工作台的任何编辑都不会污染本次证明，也不会覆盖结果。
    const leftSnapshot: CircuitDocument = JSON.parse(
      JSON.stringify(document()),
    );
    const rightSnapshot: CircuitDocument = JSON.parse(
      JSON.stringify(rightDocument.value),
    );

    try {
      const proofResult = await runProof({
        snapshot,
        left: leftSnapshot,
        right: rightSnapshot,
        leftInputOrder: leftInputOrder.value,
        inputMapping: snapshot.inputMapping,
        outputMapping: snapshot.outputMapping,
        isCanceled: () => cancelToken === runId,
        onProgress: (next) => {
          if (next.runId === runId) progress.value = next;
        },
      });
      if (cancelToken === runId) {
        status.value = "canceled";
        result.value = { ...proofResult, canceled: true };
        notify({ tone: "info", message: "证明已取消，已完成与未完成严格区分" });
      } else {
        status.value = "done";
        result.value = proofResult;
        notify({ tone: "success", message: verdictMessage(proofResult.verdict) });
      }
    } catch (error) {
      status.value = "idle";
      result.value = null;
      notify({
        tone: "error",
        message: `证明无法运行：${error instanceof Error ? error.message : "电路含环或无法求值"}`,
      });
    }
  }

  function cancel() {
    if (status.value !== "running") return;
    cancelToken = runSeq;
  }

  return {
    open,
    status,
    progress,
    result,
    rightDocument,
    left,
    right,
    leftInputOrder,
    inputMapping,
    outputMapping,
    validation,
    importError,
    leftChanged,
    rightChanged,
    resultStale,
    mappingChanged,
    openWorkbench,
    closeWorkbench,
    importRight,
    resetMappings,
    setInput,
    setOutput,
    start,
    cancel,
  };
}

export function verdictMessage(verdict: ProofResult["verdict"]): string {
  switch (verdict) {
    case "equivalent":
      return "证明完成：全部输入组合下输出一致，两份电路严格等价";
    case "counterexample":
      return "证明完成：找到确定反例，两份电路不等价";
    case "undetermined":
      return "证明完成：存在悬空未知，无法对全部输入下等价结论";
  }
}
