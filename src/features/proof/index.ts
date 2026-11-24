export { useProof } from "./model/useProof";
export { default as ProofModal } from "./ui/ProofModal.vue";
export { runProof } from "./lib/engine";
export { analyzeSide, fingerprint } from "./lib/analyze";
export {
  validateMapping,
  suggestMappings,
  MAX_INPUTS,
} from "./lib/mapping";
export type {
  ProofResult,
  ProofVerdict,
  ProofStatus,
  ProofSnapshot,
  OutputDifference,
  OutputTrace,
  PathHop,
} from "./lib/types";
