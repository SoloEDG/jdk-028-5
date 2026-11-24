<script setup lang="ts">
import { computed, ref } from "vue";
import type { useProof } from "../model/useProof";
import ProofResultPanel from "./ProofResultPanel.vue";
import { MAX_INPUTS } from "../lib/mapping";
const props = defineProps<{ proof: ReturnType<typeof useProof> }>();
const fileInput = ref<HTMLInputElement | null>(null);
const p = props.proof;
async function upload(event: Event) {
  const el = event.target as HTMLInputElement;
  const file = el.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) {
    p.importError.value = "文件超过 2 MB";
    el.value = "";
    return;
  }
  try {
    p.importRight(await file.text());
  } catch {
    p.importError.value = "文件读取失败";
  }
  el.value = "";
}
const progressPercent = computed(() => {
  if (!p.progress.value || p.progress.value.total === 0) return 0;
  return Math.round((p.progress.value.done / p.progress.value.total) * 100);
});
const running = computed(() => p.status.value === "running");
</script>
<template>
  <div v-if="p.open.value" class="proof-overlay" @click.self="p.closeWorkbench()">
    <div
      class="proof-modal"
      role="dialog"
      aria-modal="true"
      aria-label="电路等价证明台"
    >
      <header class="proof-header">
        <div>
          <h2>电路等价证明台</h2>
          <small>EQUIVALENCE PROOF · 穷举全部输入，拒绝抽样结论</small>
        </div>
        <button class="close-x" :disabled="running" @click="p.closeWorkbench()">
          ✕
        </button>
      </header>

      <div class="proof-body">
        <div class="sides-grid">
          <section class="side-column">
            <div class="side-heading">
              <b>左侧 · 当前工作台</b>
              <code v-if="p.left.value">{{ p.left.value.fingerprint }}</code>
            </div>
            <div class="side-name">{{ p.left.value?.document.name ?? "—" }}</div>
            <div class="side-meta">
              输入 {{ p.left.value?.inputs.length ?? 0 }} · 输出
              {{ p.left.value?.outputs.length ?? 0 }} · 多余内部门
              {{ p.left.value?.danglingGates.length ?? 0 }}
            </div>
            <p
              v-if="p.left.value && p.left.value.danglingGates.length"
              class="dangling-note"
            >
              检测到 {{ p.left.value.danglingGates.length }}
              个未接入输出的内部门，证明时忽略，不据此判不等价。
            </p>
          </section>

          <section class="side-column right-side">
            <div class="side-heading">
              <b>右侧 · 导入电路</b>
              <code v-if="p.right.value">{{ p.right.value.fingerprint }}</code>
            </div>
            <div class="side-name">
              {{ p.rightDocument.value?.name ?? "尚未导入" }}
            </div>
            <div v-if="p.right.value" class="side-meta">
              输入 {{ p.right.value.inputs.length }} · 输出
              {{ p.right.value.outputs.length }} · 多余内部门
              {{ p.right.value.danglingGates.length }}
            </div>
            <button class="import-btn" @click="fileInput?.click()">
              导入对比电路 JSON
            </button>
            <input
              ref="fileInput"
              type="file"
              accept=".json,application/json"
              hidden
              @change="upload"
            />
            <p v-if="p.importError.value" class="inline-error">
              {{ p.importError.value }}
            </p>
            <p
              v-if="p.right.value && p.right.value.danglingGates.length"
              class="dangling-note"
            >
              检测到 {{ p.right.value.danglingGates.length }}
              个未接入输出的内部门，证明时忽略，不据此判不等价。
            </p>
          </section>
        </div>

        <section class="mapping-section">
          <h3>
            端口对应
            <small
              >最多 {{ MAX_INPUTS }}
              个输入，允许两边编号/命名/结构完全不同</small
            >
          </h3>
          <div v-if="!p.right.value" class="mapping-empty">
            先导入右侧电路，再手动确认输入与输出的对应关系。
          </div>
          <div v-else class="mapping-grid">
            <div class="mapping-group">
              <h4>输入对应</h4>
              <div
                v-for="leftNode in p.left.value?.inputs ?? []"
                :key="leftNode.id"
                class="mapping-row"
              >
                <span class="mapping-left" :title="leftNode.id">
                  {{ leftNode.label }} <small>{{ leftNode.kind }}</small>
                </span>
                <span class="mapping-arrow">→</span>
                <select
                  :value="p.inputMapping.value[leftNode.id] ?? ''"
                  :disabled="running"
                  @change="
                    p.setInput(
                      leftNode.id,
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option value="" disabled>选择右侧输入</option>
                  <option
                    v-for="rightNode in p.right.value?.inputs ?? []"
                    :key="rightNode.id"
                    :value="rightNode.id"
                  >
                    {{ rightNode.label }}（{{ rightNode.id }}）
                  </option>
                </select>
              </div>
            </div>
            <div class="mapping-group">
              <h4>输出对应</h4>
              <div
                v-for="leftNode in p.left.value?.outputs ?? []"
                :key="leftNode.id"
                class="mapping-row"
              >
                <span class="mapping-left" :title="leftNode.id">
                  {{ leftNode.label }} <small>{{ leftNode.kind }}</small>
                </span>
                <span class="mapping-arrow">→</span>
                <select
                  :value="p.outputMapping.value[leftNode.id] ?? ''"
                  :disabled="running"
                  @change="
                    p.setOutput(
                      leftNode.id,
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option value="" disabled>选择右侧输出</option>
                  <option
                    v-for="rightNode in p.right.value?.outputs ?? []"
                    :key="rightNode.id"
                    :value="rightNode.id"
                  >
                    {{ rightNode.label }}（{{ rightNode.id }}）
                  </option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section class="control-section">
          <ul v-if="!p.validation.value.ok" class="validation-errors">
            <li v-for="(error, index) in p.validation.value.errors" :key="index">
              {{ error }}
            </li>
          </ul>
          <div class="control-row">
            <button
              class="primary"
              :disabled="!p.validation.value.ok || running"
              @click="p.start()"
            >
              {{ running ? "证明进行中…" : "开始穷举证明" }}
            </button>
            <button :disabled="!running" @click="p.cancel()">取消证明</button>
            <span v-if="running" class="run-hint">
              证明在后台分片运行，期间可继续编辑工作台
            </span>
          </div>
          <div
            v-if="running || p.status.value === 'canceled'"
            class="progress-track"
          >
            <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
            <span>
              {{ p.progress.value?.done ?? 0 }} /
              {{ p.progress.value?.total ?? 0 }} 组合（{{ progressPercent }}%）
            </span>
          </div>
        </section>

        <ProofResultPanel
          v-if="p.result.value"
          :result="p.result.value"
          :stale="p.resultStale.value"
          :left-changed="p.leftChanged.value"
          :right-changed="p.rightChanged.value"
          :mapping-changed="p.mappingChanged.value"
          @rerun="p.start()"
        />
      </div>
    </div>
  </div>
</template>
