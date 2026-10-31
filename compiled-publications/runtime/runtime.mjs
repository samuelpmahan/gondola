import {
  COMPILED_CHILDREN_HOST_CAPABILITIES,
  createCompiledChildrenEffectDriver,
  mountCompiledChildrenApp,
  validateCompiledChildrenEffect,
} from "../../compiled-children/runtime/runtime.mjs";

// Publications keep the existing request/cancel capability boundary. The
// generated Go module owns typed inputs, snapshots, and queued delivery.
export const COMPILED_PUBLICATIONS_HOST_CAPABILITIES = COMPILED_CHILDREN_HOST_CAPABILITIES;
export const validateCompiledPublicationsEffect = validateCompiledChildrenEffect;
export const createCompiledPublicationsEffectDriver = createCompiledChildrenEffectDriver;

/** Mount the compiled publications app with the shared GoScript host runtime. */
export function mountCompiledPublicationsApp(options) {
  return mountCompiledChildrenApp(options);
}
