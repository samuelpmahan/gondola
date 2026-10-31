import { mountLifecycleApp } from "../../../runtime/runtime.mjs";
import { gobiCompiled } from "../../../builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs";
import * as generatedEncoder from "../../../builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/encoder.mjs";

const component = gobiCompiled.appIR.components[0];
const update = gobiCompiled.symbols[component.update];
const effectTypeId = gobiCompiled.appIR.symbols.find((symbol) => symbol.id === component.update).signature.results[1];
const encoderCalls = [];
const encoder = {
  gobiEncodeState(value, typeId) {
    if (typeId === effectTypeId) encoderCalls.push({ typeId, isArray: Array.isArray(value) });
    return generatedEncoder.gobiEncodeState(value, typeId);
  },
};

const symbols = Object.create(null);
for (const key of Reflect.ownKeys(gobiCompiled.symbols)) {
  const descriptor = Object.getOwnPropertyDescriptor(gobiCompiled.symbols, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) continue;
  const value = key === component.update ? (state, message) => {
    const result = update(state, message);
    if (message.Name !== "requestParent" || Array.isArray(result[1])) return result;
    const slice = result[1];
    const backing = Object.getOwnPropertyDescriptor(slice, "backing").value;
    const offset = Object.getOwnPropertyDescriptor(slice, "offset").value;
    const length = Object.getOwnPropertyDescriptor(slice, "length").value;
    return [result[0], backing.slice(offset, offset + length)];
  } : descriptor.value;
  Object.defineProperty(symbols, key, { ...descriptor, value });
}

const renderer = {
  update(view, callbacks) { this.view = view; this.callbacks = callbacks; },
  viewRecord() {
    return { tree: { kind: "element", tag: "main", key: "probe", attrs: [], on: [], kids: [], text: "" }, bindings: [] };
  },
  domSnapshot() { return { normalization: "outerHTML-v1", html: "<main></main>", controls: [] }; },
  unmount() { this.view = null; },
};

const { runtime, effects } = mountLifecycleApp({
  module: { ...gobiCompiled, symbols },
  componentId: component.id,
  appId: "typed-array-probe",
  encoder,
  renderer,
});
const result = runtime.dispatch(
  { path: "probe", event: "click", value: "requestParent" },
  { Name: "requestParent", Arg: "" },
);
const report = {
  result,
  updateEffectTypeId: effectTypeId,
  encoderCalls,
  pending: effects.pending().map(({ token, effect }) => ({ token, effect })),
};
runtime.unmount();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
