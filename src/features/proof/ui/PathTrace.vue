<script setup lang="ts">
import type { OutputTrace } from "../lib/types";
defineProps<{
  title: string;
  trace: OutputTrace;
  sideClass: "left" | "right";
}>();
function signalText(value: OutputTrace["value"]): string {
  return value === "X" ? "X（悬空）" : String(value);
}
</script>
<template>
  <div class="trace-card" :class="sideClass">
    <div class="trace-head">
      <b>{{ title }}</b>
      <span class="trace-value" :class="`signal-${trace.value}`">
        {{ signalText(trace.value) }}
      </span>
    </div>
    <ol class="trace-path">
      <li v-for="(hop, index) in trace.hops" :key="hop.nodeId + index">
        <span class="hop-index">{{ index + 1 }}</span>
        <span class="hop-kind">{{ hop.kind }}</span>
        <span class="hop-label">{{ hop.label }}</span>
        <span class="hop-pins">
          入 [{{ hop.inValues.map((v) => (v === "X" ? "X" : v)).join(", ") || "—"
          }}]
          → 出 <b :class="`signal-${hop.outValue}`">{{
            hop.outValue === "X" ? "X" : hop.outValue
          }}</b>
        </span>
      </li>
      <li v-if="trace.hops.length === 0" class="trace-empty">
        该输出未连接任何逻辑门（直接悬空）
      </li>
    </ol>
  </div>
</template>
