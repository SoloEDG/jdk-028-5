<script setup lang="ts">
import type { ProofResult } from "../lib/types";
import PathTrace from "./PathTrace.vue";
defineProps<{
  result: ProofResult;
  stale: boolean;
  leftChanged: boolean;
  rightChanged: boolean;
  mappingChanged: boolean;
}>();
defineEmits<{ rerun: [] }>();
const verdictMeta = {
  equivalent: { icon: "✓", title: "完整等价", cls: "equivalent" },
  counterexample: { icon: "!", title: "确定反例", cls: "counterexample" },
  undetermined: { icon: "?", title: "无法证明（悬空未定）", cls: "undetermined" },
} as const;
</script>
<template>
  <section class="proof-result" :class="verdictMeta[result.verdict].cls">
    <header class="result-banner">
      <span class="verdict-icon">{{ verdictMeta[result.verdict].icon }}</span>
      <div>
        <h3>{{ verdictMeta[result.verdict].title }}</h3>
        <p>
          已穷举 {{ result.checkedCombinations }} /
          {{ result.totalCombinations }} 个输入组合
          <template v-if="result.canceled">
            · <b class="text-canceled">用户取消，结论不完整</b>
          </template>
        </p>
      </div>
    </header>

    <div v-if="stale" class="stale-warning" role="alert">
      本结果绑定的电路或端口映射已变化：
      <ul>
        <li v-if="leftChanged">左侧（当前工作台）电路在证明后被编辑</li>
        <li v-if="rightChanged">右侧（导入）电路在证明后被替换</li>
        <li v-if="mappingChanged">端口映射已修改，旧映射不再解释当前图</li>
      </ul>
      旧结果仅供对照，重新运行才能对当前两份电路下结论。
      <button class="primary" @click="$emit('rerun')">重新证明</button>
    </div>

    <div class="binding-box">
      <b>结果绑定</b>
      <div class="binding-line">
        <span>左：{{ result.snapshot.leftName }}</span>
        <code>{{ result.snapshot.leftFingerprint }}</code>
      </div>
      <div class="binding-line">
        <span>右：{{ result.snapshot.rightName }}</span>
        <code>{{ result.snapshot.rightFingerprint }}</code>
      </div>
      <small>
        {{ result.snapshot.inputCount }} 输入 ·
        {{ result.snapshot.outputCount }} 输出 ·
        {{ result.totalCombinations }} 组合 · 运行 #{{ result.snapshot.runId }}
      </small>
    </div>

    <template v-if="result.verdict === 'counterexample'">
      <div class="replay-box">
        <h4>可重放输入组合</h4>
        <div class="replay-vector">
          <span v-for="item in result.replayVector" :key="item.leftId">
            {{ item.label }} = <b>{{ item.value }}</b>
          </span>
        </div>
      </div>
      <div
        v-for="diff in result.differences"
        :key="diff.leftOutputId"
        class="difference-block"
      >
        <h4>
          输出「{{ diff.outputLabel }}」取值不同：
          <span class="signal-1">{{ diff.leftValue }}</span>
          ≠
          <span class="signal-0">{{ diff.rightValue }}</span>
        </h4>
        <div class="trace-grid">
          <PathTrace title="左侧信号路径" :trace="diff.leftTrace" side-class="left" />
          <PathTrace
            title="右侧信号路径"
            :trace="diff.rightTrace"
            side-class="right"
          />
        </div>
      </div>
    </template>

    <template v-else-if="result.verdict === 'undetermined'">
      <div class="replay-box">
        <h4>首个无法确定的输入组合</h4>
        <div v-if="result.replayVector.length" class="replay-vector">
          <span v-for="item in result.replayVector" :key="item.leftId">
            {{ item.label }} = <b>{{ item.value }}</b>
          </span>
        </div>
        <p v-else class="muted-note">已检查的组合均出现悬空。</p>
      </div>
      <table class="floating-table">
        <thead>
          <tr><th>输出</th><th>左侧</th><th>右侧</th></tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in result.floating" :key="index">
            <td>{{ item.outputLabel }}</td>
            <td :class="`signal-${item.leftValue}`">
              {{ item.leftValue === "X" ? "X 悬空" : item.leftValue }}
            </td>
            <td :class="`signal-${item.rightValue}`">
              {{ item.rightValue === "X" ? "X 悬空" : item.rightValue }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="muted-note">
        未发现确定的 0/1 反例，但至少一条支路悬空（断开或未驱动），
        因此不能宣称等价。接通悬空支路后重新证明即可。
      </p>
    </template>

    <template v-else>
      <p class="equivalent-note">
        全部 {{ result.totalCombinations }} 个输入组合下，每一对映射输出的
        0/1 取值都完全一致。断开支路与未接入输出的多余内部门不影响该结论。
      </p>
    </template>
  </section>
</template>
