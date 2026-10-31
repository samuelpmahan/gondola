const TRACE_SCHEMA = "gobi.trace/v1";
const COMPILED_SCHEMA = "gobi.compiled-module/v1";
const APP_SCHEMA = "gobi.app-ir/v1";
const HOST_SCRIPT_SCHEMA = "gobi.host-script/v1";
const GO_STRUCT_MARKER = "__goStructValue";
const ASYNC_FUNCTION_PROTOTYPE = Object.getPrototypeOf(async function () {});
const ASYNC_GENERATOR_FUNCTION_PROTOTYPE = Object.getPrototypeOf(async function* () {});
const NATIVE_PROMISE_PROTOTYPE = Promise.prototype;
const NATIVE_PROMISE_THEN = Promise.prototype.then;
const SUPPORTED_EFFECT_KINDS = new Set(["fixture.request"]);
const SUPPORTED_CAPABILITIES = new Set([
  "view.node",
  "binding.value",
  "binding.checked",
  "effect.request-reply",
  "effect.cancel",
  "numeric.safe-integer",
  "numeric.float64",
]);
const SUPPORTED_HOST_EFFECT_CAPABILITIES = new Set(["effect.request-reply", "effect.cancel"]);
const SUPPORTED_VIEW_CAPABILITIES = new Set(["view.node", "binding.value", "binding.checked"]);
const LEGACY_HOST_CAPABILITIES = Object.freeze(["effect.request-reply"]);

export class RuntimeFailure extends Error {
  constructor(stage, message, cause = undefined) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RuntimeFailure";
    this.stage = stage;
    this.causeName = cause?.name ?? null;
  }
}

export class HostScriptFailure extends Error {
  constructor(message) {
    super(message);
    this.name = "HostScriptFailure";
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} must contain exactly: ${wanted.join(", ")}`);
  }
}

function ownDataRecord(value, expected, label, { prototype = "plain" } = {}) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} has unsupported symbol properties`);
  }
  const wanted = expected.slice().sort();
  const actual = keys.slice().sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} must contain exactly: ${wanted.join(", ")}`);
  }
  if (prototype === "plain") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(`${label} must have a plain object prototype`);
    }
  }
  const result = Object.create(null);
  for (const key of wanted) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        !descriptor.enumerable || !descriptor.writable || !descriptor.configurable ||
        Object.prototype.hasOwnProperty.call(descriptor, "get") ||
        Object.prototype.hasOwnProperty.call(descriptor, "set")) {
      throw new TypeError(`${label}.${key} must be an enumerable own data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function goStructDataRecord(value, fields, label) {
  const result = ownDataRecord(value, [...fields, GO_STRUCT_MARKER], label, { prototype: "deferred" });
  if (result[GO_STRUCT_MARKER] !== true) {
    throw new TypeError(`${label} must have the GoScript struct marker`);
  }
  const proto = Object.getPrototypeOf(value);
  if (!isRecord(proto) || Object.getPrototypeOf(proto) !== Object.prototype) {
    throw new TypeError(`${label} has an unknown GoScript struct prototype`);
  }
  const protoKeys = Reflect.ownKeys(proto).sort();
  const expectedProtoKeys = ["__goscriptAssign", "clone", "constructor"];
  if (protoKeys.length !== expectedProtoKeys.length ||
      protoKeys.some((key, index) => key !== expectedProtoKeys[index])) {
    throw new TypeError(`${label} has an unknown GoScript struct prototype`);
  }
  for (const key of expectedProtoKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        typeof descriptor.value !== "function" || descriptor.enumerable ||
        !descriptor.writable || !descriptor.configurable) {
      throw new TypeError(`${label} has an invalid GoScript struct prototype`);
    }
  }
  const constructor = Object.getOwnPropertyDescriptor(proto, "constructor").value;
  const constructorPrototype = Object.getOwnPropertyDescriptor(constructor, "prototype");
  if (!constructorPrototype || constructorPrototype.value !== proto) {
    throw new TypeError(`${label} has an unknown GoScript struct constructor`);
  }
  return result;
}

function cloneJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("trace JSON cannot contain non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!isRecord(value)) throw new TypeError("trace JSON contains an unsupported value");
  const clone = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) throw new TypeError(`trace JSON field ${key} is undefined`);
    clone[key] = cloneJson(child);
  }
  return clone;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function requireString(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function readDataProperty(value, key, label) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch (cause) {
    throw new TypeError(`${label} could not be inspected`, { cause });
  }
  if (!descriptor) return { found: false, value: undefined };
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value") ||
      Object.prototype.hasOwnProperty.call(descriptor, "get") ||
      Object.prototype.hasOwnProperty.call(descriptor, "set")) {
    throw new TypeError(`${label} must be an own data property`);
  }
  return { found: true, value: descriptor.value };
}

function readCapabilityValues(value, supported, label) {
  let length;
  let keys;
  try {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
        !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
      throw new TypeError(`${label} has an invalid length`);
    }
    length = lengthDescriptor.value;
    keys = Reflect.ownKeys(value);
  } catch (cause) {
    if (cause instanceof TypeError && cause.message.startsWith(`${label} `)) throw cause;
    throw new TypeError(`${label} could not be inspected`, { cause });
  }

  if (keys.length !== length + 1 || !keys.includes("length") ||
      Array.from({ length }, (_, index) => String(index)).some((key) => !keys.includes(key))) {
    throw new TypeError(`${label} must be dense and contain no extra properties`);
  }

  const values = [];
  for (let index = 0; index < length; index += 1) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    } catch (cause) {
      throw new TypeError(`${label}[${index}] could not be inspected`, { cause });
    }
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        !descriptor.enumerable || Object.prototype.hasOwnProperty.call(descriptor, "get") ||
        Object.prototype.hasOwnProperty.call(descriptor, "set")) {
      throw new TypeError(`${label}[${index}] must be an own data property`);
    }
    const capability = descriptor.value;
    if (typeof capability !== "string" || !supported.has(capability)) {
      throw new TypeError(`${label} contains an unsupported capability`);
    }
    values.push(capability);
  }
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${label} must not contain duplicates`);
  }
  return Object.freeze(values);
}

function mountOption(options, key, defaultValue) {
  const property = readDataProperty(options, key, `mount options.${key}`);
  return property.found ? property.value : defaultValue;
}

function validateAction(action) {
  const fields = ownDataRecord(action, ["path", "event", "value"], "Action");
  requireString(fields.path, "Action.path");
  requireString(fields.event, "Action.event");
  requireString(fields.value, "Action.value");
  return { path: fields.path, event: fields.event, value: fields.value };
}

function validateGoMessage(message, label = "Message") {
  const fields = isRecord(message) && Reflect.ownKeys(message).includes(GO_STRUCT_MARKER)
    ? goStructDataRecord(message, ["Name", "Arg"], label)
    : ownDataRecord(message, ["Name", "Arg"], label);
  requireString(fields.Name, `${label}.Name`);
  requireString(fields.Arg, `${label}.Arg`);
  return { Name: fields.Name, Arg: fields.Arg };
}

function messageRecord(message) {
  return message === null ? null : { name: message.Name, arg: message.Arg };
}

function validateTraceMessage(message) {
  const fields = ownDataRecord(message, ["name", "arg"], "MessageValue");
  requireString(fields.name, "MessageValue.name");
  requireString(fields.arg, "MessageValue.arg");
  return { name: fields.name, arg: fields.arg };
}

function validateEffectValue(effect) {
  const fields = ownDataRecord(effect, ["kind", "name", "arg", "reply"], "EffectValue");
  const result = {
    kind: requireString(fields.kind, "EffectValue.kind"),
    name: requireString(fields.name, "EffectValue.name"),
    arg: requireString(fields.arg, "EffectValue.arg"),
    reply: requireString(fields.reply, "EffectValue.reply"),
  };
  validateSupportedEffect(result, "EffectValue");
  return result;
}

function validateSupportedEffect(effect, label) {
  if (!SUPPORTED_EFFECT_KINDS.has(effect.kind)) {
    throw new HostScriptFailure(`unsupported effect kind ${JSON.stringify(effect.kind)}`);
  }
  if (effect.name !== "lookup" || effect.reply !== "complete") {
    throw new HostScriptFailure(`${label} must use fixture.request lookup/complete`);
  }
}

function validateEffectRequest(request) {
  const fields = ownDataRecord(request, ["dispatchId", "effectIndex", "effect"], "EffectRequest");
  requireString(fields.dispatchId, "EffectRequest.dispatchId");
  if (!Number.isSafeInteger(fields.effectIndex) || fields.effectIndex < 0) {
    throw new TypeError("EffectRequest.effectIndex must be a nonnegative safe integer");
  }
  return {
    dispatchId: fields.dispatchId,
    effectIndex: fields.effectIndex,
    effect: validateEffectValue(fields.effect),
  };
}

function validateHostScript(script) {
  exactKeys(script, ["schema", "steps"], "HostScript");
  if (script.schema !== HOST_SCRIPT_SCHEMA) throw new TypeError(`HostScript.schema must be ${HOST_SCRIPT_SCHEMA}`);
  if (!Array.isArray(script.steps)) throw new TypeError("HostScript.steps must be an array");
  return {
    schema: HOST_SCRIPT_SCHEMA,
    steps: script.steps.map((step, index) => {
      exactKeys(step, ["request", "completion"], `HostScript.steps[${index}]`);
      const request = validateEffectRequest(step.request);
      let completion = null;
      if (step.completion !== null) completion = validateTraceMessage(step.completion);
      if ((request.effect.reply === "") !== (completion === null)) {
        throw new TypeError(
          `HostScript.steps[${index}] must use completion:null exactly for fire-and-forget effects`,
        );
      }
      if (completion !== null && completion.name !== request.effect.reply) {
        throw new TypeError(`HostScript.steps[${index}].completion.name must match Effect.reply`);
      }
      return { request, completion };
    }),
  };
}

/**
 * An ordered, no-I/O effect host. Requests must exactly match HostScript order.
 * Replies are released only when the driver calls deliverNext(), after the
 * runtime has committed the requesting transition and its view.
 */
export function createDeterministicEffectHost(hostScript, { onRequest, onCompletion } = {}) {
  const script = validateHostScript(hostScript);
  const requested = [];
  const delivered = [];
  const pending = [];
  let nextStep = 0;

  return {
    request(requestValue, deliver) {
      const request = validateEffectRequest(requestValue);
      if (typeof deliver !== "function") throw new TypeError("effect delivery callback must be a function");
      if (nextStep >= script.steps.length) {
        throw new HostScriptFailure("extra effect request: HostScript has no expected request");
      }
      const expected = script.steps[nextStep];
      if (canonicalJson(request) !== canonicalJson(expected.request)) {
        throw new HostScriptFailure(
          `effect request mismatch at step ${nextStep}: expected ${canonicalJson(expected.request)}, got ${canonicalJson(request)}`,
        );
      }
      nextStep += 1;
      requested.push(cloneJson(request));
      onRequest?.(cloneJson(request));
      if (expected.completion !== null) {
        pending.push({ request, completion: expected.completion, deliver, delivered: false });
      }
    },

    deliver(requestKey) {
      exactKeys(requestKey, ["dispatchId", "effectIndex"], "EffectCorrelation");
      requireString(requestKey.dispatchId, "EffectCorrelation.dispatchId");
      if (!Number.isSafeInteger(requestKey.effectIndex) || requestKey.effectIndex < 0) {
        throw new TypeError("EffectCorrelation.effectIndex must be a nonnegative safe integer");
      }
      const item = pending.find((candidate) =>
        candidate.request.dispatchId === requestKey.dispatchId
          && candidate.request.effectIndex === requestKey.effectIndex);
      if (!item || item.delivered) throw new HostScriptFailure("unknown, extra, or duplicate effect completion");
      const next = pending.find((candidate) => !candidate.delivered);
      if (next !== item) throw new HostScriptFailure("reordered effect completion rejected by HostScript");
      item.delivered = true;
      const completion = {
        dispatchId: item.request.dispatchId,
        effectIndex: item.request.effectIndex,
        message: cloneJson(item.completion),
      };
      delivered.push(cloneJson(completion));
      onCompletion?.(cloneJson(completion));
      item.deliver(cloneJson(completion));
      return true;
    },

    deliverNext() {
      const next = pending.find((candidate) => !candidate.delivered);
      if (!next) return false;
      return this.deliver({
        dispatchId: next.request.dispatchId,
        effectIndex: next.request.effectIndex,
      });
    },

    assertDone() {
      if (nextStep !== script.steps.length) {
        throw new HostScriptFailure(`missing effect request at HostScript step ${nextStep}`);
      }
      const undelivered = pending.find((candidate) => !candidate.delivered);
      if (undelivered) {
        throw new HostScriptFailure(
          `expected completion was not delivered for ${undelivered.request.dispatchId}/${undelivered.request.effectIndex}`,
        );
      }
      return true;
    },

    requests() {
      return cloneJson(requested);
    },

    completions() {
      return cloneJson(delivered);
    },
  };
}

function getComponent(compiled, componentId) {
  if (!isRecord(compiled) || compiled.schema !== COMPILED_SCHEMA) {
    throw new TypeError(`compiled module schema must be ${COMPILED_SCHEMA}`);
  }
  const appIR = compiled.appIR;
  if (!isRecord(appIR) || appIR.schema !== APP_SCHEMA || !Array.isArray(appIR.components)) {
    throw new TypeError(`compiled.appIR must use ${APP_SCHEMA}`);
  }
  if (!isRecord(compiled.symbols)) throw new TypeError("compiled.symbols must be a symbol registry");
  const component = appIR.components.find((candidate) => candidate?.id === componentId);
  if (!component) throw new TypeError(`compiled component ${JSON.stringify(componentId)} does not exist`);
  for (const role of ["stateType", "messageType", "init", "update", "view"]) {
    requireString(component[role], `component.${role}`);
  }
  const symbols = {};
  for (const role of ["init", "update", "view"]) {
    const descriptor = Object.getOwnPropertyDescriptor(compiled.symbols, component[role]);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || typeof descriptor.value !== "function") {
      throw new TypeError(`compiled symbol ${JSON.stringify(component[role])} for ${role} is not callable`);
    }
    symbols[role] = descriptor.value;
  }
  const capabilityProperty = readDataProperty(component, "capabilities", "component.capabilities");
  if (!capabilityProperty.found) throw new TypeError("component.capabilities must be a supported capability array");
  const capabilities = readCapabilityValues(capabilityProperty.value, SUPPORTED_CAPABILITIES, "component.capabilities");
  let effectResultTypeId = null;
  if (Array.isArray(appIR.symbols)) {
    const updateMetadata = appIR.symbols.find((candidate) => candidate?.id === component.update);
    const results = updateMetadata?.signature?.results;
    if (Array.isArray(results) && results.length === 2 && typeof results[1] === "string") {
      effectResultTypeId = results[1];
    }
  }
  return { component, capabilities, symbols, appIR, effectResultTypeId };
}

function requireHostCapabilities(componentCapabilities, hostCapabilities) {
  const requirements = componentCapabilities.filter((capability) => SUPPORTED_HOST_EFFECT_CAPABILITIES.has(capability));
  const missing = requirements.filter((capability) => !hostCapabilities.includes(capability));
  if (missing.length !== 0) {
    throw new TypeError(`hostCapabilities is missing required component effect capability ${missing.join(", ")}`);
  }
}

function requireRendererCapabilities(renderer, componentCapabilities) {
  const property = readDataProperty(renderer, "viewCapabilities", "renderer.viewCapabilities");
  if (!property.found) {
    if (componentCapabilities.includes("effect.cancel")) {
      throw new TypeError("renderer must declare viewCapabilities for a component requiring effect.cancel");
    }
    return null;
  }
  const viewCapabilities = readCapabilityValues(property.value, SUPPORTED_VIEW_CAPABILITIES, "renderer.viewCapabilities");
  const required = componentCapabilities.filter((capability) => SUPPORTED_VIEW_CAPABILITIES.has(capability));
  const missing = required.filter((capability) => !viewCapabilities.includes(capability));
  if (missing.length !== 0) {
    throw new TypeError(`renderer.viewCapabilities is missing required component view capability ${missing.join(", ")}`);
  }
  return viewCapabilities;
}

function effectSliceMetadata(appIR, effectResultTypeId) {
  if (typeof effectResultTypeId !== "string" || effectResultTypeId.length === 0) {
    throw new TypeError("GoScript effect slices require the compiled Update signature's second result type");
  }
  if (!Array.isArray(appIR.types)) throw new TypeError("compiled.appIR.types is required to encode GoScript effect slices");
  const sliceType = appIR.types.find((type) => type?.id === effectResultTypeId);
  if (!isRecord(sliceType) || sliceType.kind !== "slice" || typeof sliceType.elemType !== "string") {
    throw new TypeError(`Update result ${JSON.stringify(effectResultTypeId)} is not a declared slice type`);
  }
  const elementType = appIR.types.find((type) => type?.id === sliceType.elemType);
  if (!isRecord(elementType) || elementType.kind !== "struct" || !Array.isArray(elementType.fields)) {
    throw new TypeError(`Update effect element ${JSON.stringify(sliceType.elemType)} is not a declared struct type`);
  }
  const fieldNames = ["Kind", "Name", "Arg", "Reply"];
  if (elementType.fields.length !== fieldNames.length || elementType.fields.some((field, index) =>
    !isRecord(field) || field.name !== fieldNames[index] || field.type !== "string")) {
    throw new TypeError("compiled Update effect element must declare exactly string Kind, Name, Arg, and Reply fields");
  }
  return { typeId: effectResultTypeId, elementTypeId: sliceType.elemType, fieldNames };
}

function requireEncoder(encoder) {
  if (!isRecord(encoder) || typeof encoder.gobiEncodeState !== "function") {
    throw new TypeError("encoder must export gobiEncodeState");
  }
  return encoder;
}

function rendererMethod(renderer, key) {
  let owner = renderer;
  while (owner !== null) {
    const property = readDataProperty(owner, key, `renderer.${key}`);
    if (property.found) return property.value;
    try {
      owner = Object.getPrototypeOf(owner);
    } catch (cause) {
      throw new TypeError(`renderer.${key} could not be inspected`, { cause });
    }
  }
  return undefined;
}

function rendererCoreMethods(renderer) {
  if (!isRecord(renderer)) {
    throw new TypeError("renderer must provide update, viewRecord, domSnapshot, and unmount");
  }
  const methods = {
    renderer,
    update: rendererMethod(renderer, "update"),
    viewRecord: rendererMethod(renderer, "viewRecord"),
    domSnapshot: rendererMethod(renderer, "domSnapshot"),
    unmount: rendererMethod(renderer, "unmount"),
  };
  if ([methods.update, methods.viewRecord, methods.domSnapshot, methods.unmount].some((method) => typeof method !== "function")) {
    throw new TypeError("renderer must provide update, viewRecord, domSnapshot, and unmount");
  }
  return methods;
}

function rendererReplacementMethods(renderer) {
  const core = rendererCoreMethods(renderer);
  const checked = core.renderer;
  const { update, viewRecord: readView, domSnapshot: readDOM, unmount } = core;
  const focusState = rendererMethod(checked, "focusState");
  const restoreFocus = rendererMethod(checked, "restoreFocus");
  if ((typeof focusState === "function") !== (typeof restoreFocus === "function")) {
    throw new TypeError("renderer focus support must provide both focusState() and restoreFocus(state)");
  }
  const methods = [update, readView, readDOM, unmount];
  if (typeof focusState === "function") methods.push(focusState, restoreFocus);
  for (const method of methods) {
    const methodPrototype = Object.getPrototypeOf(method);
    if (methodPrototype === ASYNC_FUNCTION_PROTOTYPE || methodPrototype === ASYNC_GENERATOR_FUNCTION_PROTOTYPE) {
      throw new TypeError("renderer replacement methods must complete synchronously");
    }
  }
  return { renderer: checked, update, viewRecord: readView, domSnapshot: readDOM, unmount, focusState, restoreFocus };
}

function valueSnapshot(encoder, state, stateType) {
  const value = encoder.gobiEncodeState(state, stateType);
  if (!isRecord(value) || value.typeId !== stateType || typeof value.kind !== "string") {
    throw new TypeError("gobiEncodeState returned a malformed Value for the component state type");
  }
  return cloneJson(value);
}

function viewSnapshot(renderer, readView = renderer.viewRecord) {
  const view = readView.call(renderer);
  noThenable(view, "renderer.viewRecord()");
  exactKeys(view, ["tree", "bindings"], "ViewRecord");
  if (!isRecord(view.tree) || !Array.isArray(view.bindings)) {
    throw new TypeError("renderer.viewRecord() must return {tree,bindings[]} ");
  }
  return cloneJson(view);
}

function domSnapshot(renderer, readDOM = renderer.domSnapshot) {
  const dom = readDOM.call(renderer);
  noThenable(dom, "renderer.domSnapshot()");
  exactKeys(dom, ["normalization", "html", "controls"], "DOMSnapshot");
  if (dom.normalization !== "outerHTML-v1" || typeof dom.html !== "string" || !Array.isArray(dom.controls)) {
    throw new TypeError("renderer.domSnapshot() must return {normalization:'outerHTML-v1',html,controls[]}");
  }
  const controls = dom.controls.map((control, index) => {
    exactKeys(control, ["path", "key", "tag", "type", "value", "checked", "disabled"], `DOMSnapshot.controls[${index}]`);
    for (const field of ["path", "key", "tag", "type", "value"]) requireString(control[field], `DOMSnapshot.controls[${index}].${field}`);
    if (typeof control.checked !== "boolean" || typeof control.disabled !== "boolean") {
      throw new TypeError(`DOMSnapshot.controls[${index}] checked and disabled must be booleans`);
    }
    return cloneJson(control);
  });
  return { normalization: dom.normalization, html: dom.html, controls };
}

function focusStateSnapshot(value) {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new TypeError("renderer.focusState() must return null or a valid focus record");
  }
  let focus;
  try {
    focus = ownDataRecord(
      value,
      ["identity", "selectionStart", "selectionEnd", "selectionDirection"],
      "renderer focus record",
    );
  } catch (error) {
    throw new TypeError(`renderer.focusState() must return null or a valid focus record: ${error.message}`);
  }
  if (typeof focus.identity !== "string"
      || !Number.isSafeInteger(focus.selectionStart) || focus.selectionStart < 0
      || !Number.isSafeInteger(focus.selectionEnd) || focus.selectionEnd < focus.selectionStart
      || typeof focus.selectionDirection !== "string") {
    throw new TypeError("renderer.focusState() must return null or a valid focus record");
  }
  return {
    identity: focus.identity,
    selectionStart: focus.selectionStart,
    selectionEnd: focus.selectionEnd,
    selectionDirection: focus.selectionDirection,
  };
}

function observeNativePromiseRejection(value) {
  if (value === null || typeof value !== "object") return false;
  try {
    // The intrinsic brand check does not read or invoke a thenable's `then` method.
    // For a Promise, the rejection handler fulfills this sink; the original Promise remains rejected.
    NATIVE_PROMISE_THEN.call(value, undefined, () => undefined);
    return true;
  } catch {
    // Non-Promises (including thenables) fail the intrinsic brand check.
    return false;
  }
}

function noThenable(value, label) {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    if (observeNativePromiseRejection(value)) {
      throw new TypeError(`${label} must complete synchronously`);
    }
    if (typeof value.then === "function") {
      throw new TypeError(`${label} must complete synchronously`);
    }
  }
}

function denseDataArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
      !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    throw new TypeError(`${label} has an invalid length`);
  }
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 ||
      keys.some((key, index) => key !== (index === length ? "length" : String(index)))) {
    throw new TypeError(`${label} must be dense and contain no extra properties`);
  }
  const values = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        !descriptor.enumerable || !descriptor.writable || !descriptor.configurable ||
        Object.prototype.hasOwnProperty.call(descriptor, "get") ||
        Object.prototype.hasOwnProperty.call(descriptor, "set")) {
      throw new TypeError(`${label}[${index}] must be an own data property`);
    }
    values.push(descriptor.value);
  }
  return values;
}

function readEncodedStringValue(value, label) {
  const fields = ownDataRecord(value, ["typeId", "kind", "string"], label);
  if (fields.typeId !== "string" || fields.kind !== "string" || typeof fields.string !== "string") {
    throw new TypeError(`${label} must be an encoded string Value`);
  }
  return fields.string;
}

function readEncodedEffectSlice(value, metadata) {
  const fields = ownDataRecord(value, ["typeId", "kind", "isNil", "items"], "gobiEncodeState(Update effects)");
  if (fields.typeId !== metadata.typeId || fields.kind !== "slice" || typeof fields.isNil !== "boolean") {
    throw new TypeError("gobiEncodeState returned a Value with the wrong Update effect slice type");
  }
  const items = denseDataArray(fields.items, "encoded Update effect items");
  if (fields.isNil && items.length !== 0) {
    throw new TypeError("encoded nil Update effect slice must have no items");
  }
  return items.map((item, index) => {
    const itemFields = ownDataRecord(item, ["typeId", "kind", "fields"], `encoded Update effect[${index}]`);
    if (itemFields.typeId !== metadata.elementTypeId || itemFields.kind !== "struct") {
      throw new TypeError(`encoded Update effect[${index}] has the wrong struct type`);
    }
    const encodedFields = denseDataArray(itemFields.fields, `encoded Update effect[${index}].fields`);
    if (encodedFields.length !== metadata.fieldNames.length) {
      throw new TypeError(`encoded Update effect[${index}] has the wrong field count`);
    }
    const extracted = {};
    for (let fieldIndex = 0; fieldIndex < metadata.fieldNames.length; fieldIndex += 1) {
      const expectedName = metadata.fieldNames[fieldIndex];
      const encodedField = ownDataRecord(
        encodedFields[fieldIndex],
        ["name", "value"],
        `encoded Update effect[${index}].fields[${fieldIndex}]`,
      );
      if (encodedField.name !== expectedName) {
        throw new TypeError(`encoded Update effect[${index}] field ${fieldIndex} must be ${expectedName}`);
      }
      extracted[expectedName] = readEncodedStringValue(
        encodedField.value,
        `encoded Update effect[${index}].${expectedName}`,
      );
    }
    return {
      kind: extracted.Kind,
      name: extracted.Name,
      arg: extracted.Arg,
      reply: extracted.Reply,
    };
  });
}

function validateEffectByPolicy(effect, effectPolicy) {
  if (effectPolicy === null) {
    validateSupportedEffect(effect, "gobi.Effect");
    return;
  }
  // The caller owns a closed, synchronous policy for an additional effect ABI.
  // It receives a copy so it cannot rewrite the request that is traced/queued.
  const policyInput = Object.freeze({ ...effect });
  const policyResult = effectPolicy(policyInput, "gobi.Effect");
  noThenable(policyResult, "effectPolicy(effect)");
  if (policyResult !== undefined) {
    throw new TypeError("effectPolicy must validate by returning undefined");
  }
}

function normalizeEffects(effects, dispatchId, capabilities, hostCapabilities, effectPolicy, encoder, appIR, effectResultTypeId) {
  if (effects === null || effects === undefined) return [];
  let effectValues;
  const hasDeclaredEffectSlice = typeof effectResultTypeId === "string"
    && Array.isArray(appIR?.types)
    && appIR.types.some((type) => type?.id === effectResultTypeId);
  if (Array.isArray(effects) && !hasDeclaredEffectSlice) {
    const rawItems = denseDataArray(effects, "Update effects");
    if (rawItems.length > 0 && !capabilities.includes("effect.request-reply")) {
      throw new TypeError("component emitted effects without effect.request-reply capability");
    }
    effectValues = rawItems.map((rawEffect) => {
      const fields = goStructDataRecord(rawEffect, ["Kind", "Name", "Arg", "Reply"], "gobi.Effect");
      return {
        kind: requireString(fields.Kind, "gobi.Effect.Kind"),
        name: requireString(fields.Name, "gobi.Effect.Name"),
        arg: requireString(fields.Arg, "gobi.Effect.Arg"),
        reply: requireString(fields.Reply, "gobi.Effect.Reply"),
      };
    });
  } else {
    const metadata = effectSliceMetadata(appIR, effectResultTypeId);
    const encoded = encoder.gobiEncodeState(effects, metadata.typeId);
    noThenable(encoded, "gobiEncodeState(Update effects)");
    effectValues = readEncodedEffectSlice(encoded, metadata);
    if (effectValues.length > 0 && !capabilities.includes("effect.request-reply")) {
      throw new TypeError("component emitted effects without effect.request-reply capability");
    }
  }
  return effectValues.map((effect, effectIndex) => {
    if (effect.kind === "lifecycle.cancel") {
      if (!capabilities.includes("effect.cancel")) {
        throw new TypeError("component emitted lifecycle.cancel without effect.cancel capability");
      }
      if (!hostCapabilities.includes("effect.cancel")) {
        throw new TypeError("host did not declare effect.cancel support");
      }
    }
    validateEffectByPolicy(effect, effectPolicy);
    return { dispatchId, effectIndex, effect };
  });
}

function keyFor(request) {
  return `${request.dispatchId}/${request.effectIndex}`;
}

function validateEffectCorrelation(correlation) {
  const fields = ownDataRecord(correlation, ["dispatchId", "effectIndex"], "EffectCorrelation");
  requireString(fields.dispatchId, "EffectCorrelation.dispatchId");
  if (!Number.isSafeInteger(fields.effectIndex) || fields.effectIndex < 0) {
    throw new TypeError("EffectCorrelation.effectIndex must be a nonnegative safe integer");
  }
  return { dispatchId: fields.dispatchId, effectIndex: fields.effectIndex };
}

function validateCompletion(completion) {
  const fields = ownDataRecord(completion, ["dispatchId", "effectIndex", "message"], "EffectCompletion");
  requireString(fields.dispatchId, "EffectCompletion.dispatchId");
  if (!Number.isSafeInteger(fields.effectIndex) || fields.effectIndex < 0) {
    throw new TypeError("EffectCompletion.effectIndex must be a nonnegative safe integer");
  }
  return {
    dispatchId: fields.dispatchId,
    effectIndex: fields.effectIndex,
    message: validateTraceMessage(fields.message),
  };
}

function completionValidationErrorMessage(error) {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) {
    return "invalid effect completion";
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "message");
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") &&
        typeof descriptor.value === "string") {
      return descriptor.value;
    }
  } catch { /* thrown values from Proxy traps are untrusted too */ }
  return "invalid effect completion";
}

/**
 * Mounts actual emitted Go Init/Update/View symbols behind an imperative
 * synchronous renderer. This is a model host, not an application reducer.
 */
export function mountCompiledApp(options) {
  if (!isRecord(options)) throw new TypeError("mount options must be an object");
  const compiled = mountOption(options, "module", undefined);
  const componentId = mountOption(options, "componentId", undefined);
  const appId = mountOption(options, "appId", componentId);
  const encoder = mountOption(options, "encoder", undefined);
  const renderer = mountOption(options, "renderer", undefined);
  const effectHost = mountOption(options, "effectHost", null);
  const effectPolicy = mountOption(options, "effectPolicy", null);
  const onTick = mountOption(options, "onTick", null);
  const onFailure = mountOption(options, "onFailure", null);
  const rawHostCapabilities = mountOption(options, "hostCapabilities", undefined);
  const hostCapabilities = rawHostCapabilities === undefined
    ? LEGACY_HOST_CAPABILITIES
    : readCapabilityValues(rawHostCapabilities, SUPPORTED_HOST_EFFECT_CAPABILITIES, "hostCapabilities");

  requireString(componentId, "componentId");
  requireString(appId, "appId");
  if (onTick !== null && typeof onTick !== "function") throw new TypeError("onTick must be a function or null");
  if (onFailure !== null && typeof onFailure !== "function") throw new TypeError("onFailure must be a function or null");
  if (effectPolicy !== null && typeof effectPolicy !== "function") {
    throw new TypeError("effectPolicy must be a synchronous validator function or null");
  }

  const { component, capabilities, symbols, appIR, effectResultTypeId } = getComponent(compiled, componentId);
  requireHostCapabilities(capabilities, hostCapabilities);
  const stateEncoder = requireEncoder(encoder);
  if (!isRecord(renderer)) throw new TypeError("renderer must provide update, viewRecord, domSnapshot, and unmount");
  requireRendererCapabilities(renderer, capabilities);
  rendererCoreMethods(renderer);
  let viewRenderer = renderer;
  if (effectHost !== null && typeof effectHost.request !== "function") {
    throw new TypeError("effectHost must provide request(request, deliver) or be null");
  }
  let state;
  let initialized = false;
  let disposed = false;
  let halted = false;
  let busy = false;
  let draining = false;
  let admittingCompletion = false;
  let recordingDeferredAction = false;
  let replacingRenderer = false;
  let admittingRendererCandidate = false;
  let replacementCompletionQueued = false;
  let rendererUnavailable = false;
  let updateSequence = 0n;
  const ticks = [];
  const pendingEffects = new Map();
  const effectCancellations = [];
  const deferred = [];
  let rendererGeneration = 1;
  let nextRendererGeneration = 2;
  let rendererReplacementAttempt = 0;
  const rendererReplacements = [];
  const fencedRendererCallbacks = [];
  let rendererLease = { generation: rendererGeneration, status: "active" };
  let lastRawView = null;
  let lastLogicalView = null;
  let lastFailure = null;

  const trace = { schema: TRACE_SCHEMA, appId, ticks };

  function reportFailure(stage, error) {
    const failure = {
      stage,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.name : "Error",
    };
    lastFailure = failure;
    halted = true;
    cancelHeldReplacementCompletions();
    try { onFailure?.(cloneJson(failure)); } catch { /* observers cannot mask the primary failure */ }
    return failure;
  }

  function nextDispatchId() {
    updateSequence += 1n;
    return `dispatch-${String(updateSequence).padStart(4, "0")}`;
  }

  function readState() {
    return valueSnapshot(stateEncoder, state, component.stateType);
  }

  function cancelHeldReplacementCompletions() {
    for (let index = deferred.length - 1; index >= 0; index -= 1) {
      const item = deferred[index];
      if (item.kind !== "completion" || item.heldByReplacement !== true) continue;
      const pending = pendingEffects.get(keyFor(item.completion));
      if (pending && !pending.completed) pending.queued = false;
      deferred.splice(index, 1);
    }
    replacementCompletionQueued = false;
  }

  function scheduleReplacementCompletionDrain() {
    queueMicrotask(() => {
      if (disposed || halted) {
        cancelHeldReplacementCompletions();
        return;
      }
      if (!busy) drainDeferred(true);
    });
  }

  function runtimeSnapshot() {
    if (!initialized) throw new RuntimeFailure("snapshot", "runtime has not initialized");
    if (rendererUnavailable) {
      throw new RuntimeFailure("snapshot", "renderer state is unavailable after a failed replacement");
    }
    return {
      state: readState(),
      view: disposed ? cloneJson(lastLogicalView) : viewSnapshot(viewRenderer, rendererMethod(viewRenderer, "viewRecord")),
      dom: domSnapshot(viewRenderer, rendererMethod(viewRenderer, "domSnapshot")),
    };
  }

  function rendererDiagnostics() {
    return cloneJson({
      currentGeneration: rendererLease.status === "active" ? rendererGeneration : null,
      replacements: rendererReplacements,
      fencedCallbacks: fencedRendererCallbacks,
    });
  }

  function effectDiagnostics() {
    const pending = [];
    for (const record of pendingEffects.values()) {
      if (record.completed) continue;
      pending.push({
        dispatchId: record.request.dispatchId,
        effectIndex: record.request.effectIndex,
        queued: record.queued,
      });
    }
    return cloneJson({ pending, cancellations: effectCancellations });
  }

  function cancelEffect(correlationInput) {
    if (admittingRendererCandidate) {
      return { accepted: false, cancelled: false, retryable: true, error: "effect cancellation rejected during renderer candidate admission" };
    }
    let correlation;
    try {
      correlation = validateEffectCorrelation(correlationInput);
    } catch (error) {
      return { accepted: false, cancelled: false, error: error.message };
    }
    const key = keyFor(correlation);
    const pending = pendingEffects.get(key);
    if (!pending || pending.completed) {
      const result = { ...correlation, outcome: "rejected", reason: "unknown or completed effect" };
      effectCancellations.push(result);
      return { accepted: false, cancelled: false, error: result.reason };
    }

    pendingEffects.delete(key);
    for (let index = deferred.length - 1; index >= 0; index -= 1) {
      const item = deferred[index];
      if (item.kind !== "completion" || keyFor(item.completion) !== key) continue;
      deferred.splice(index, 1);
    }
    pending.queued = false;
    replacementCompletionQueued = deferred.some((item) =>
      item.kind === "completion" && item.heldByReplacement === true);
    effectCancellations.push({ ...correlation, outcome: "cancelled" });
    return { accepted: true, cancelled: true, dispatchId: correlation.dispatchId, effectIndex: correlation.effectIndex };
  }

  function recordTick({ action, message, dispatchId, requestedEffects = [], completedEffects = [] }) {
    const tick = {
      index: ticks.length,
      action: action === null ? null : validateAction(action),
      message: message === null ? null : messageRecord(message),
      dispatchId,
      state: readState(),
      requestedEffects: cloneJson(requestedEffects),
      completedEffects: cloneJson(completedEffects),
      view: disposed || rendererUnavailable ? cloneJson(lastLogicalView) : viewSnapshot(viewRenderer, rendererMethod(viewRenderer, "viewRecord")),
      dom: rendererUnavailable ? null : domSnapshot(viewRenderer, rendererMethod(viewRenderer, "domSnapshot")),
    };
    ticks.push(tick);
    try { onTick?.(cloneJson(tick)); } catch (error) {
      reportFailure("trace", error);
    }
    return tick;
  }

  function rendererCallbacks(lease) {
    function fencedCallback(kind, renderEpoch = null) {
      if (lease.status === "retired" || lease.status === "failed") {
        fencedRendererCallbacks.push({
          generation: lease.generation,
          kind,
          renderEpoch: Number.isSafeInteger(renderEpoch) ? renderEpoch : null,
        });
        return {
          accepted: false,
          dispatchId: null,
          stale: true,
          error: "renderer callback fenced after replacement",
        };
      }
      if (lease.status !== "active" && lease.status !== "unmounted") {
        return {
          accepted: false,
          dispatchId: null,
          stale: true,
          error: "renderer callback fenced during replacement",
        };
      }
      return null;
    }
    return {
      dispatch(action, message) {
        const fenced = fencedCallback("dispatch");
        if (fenced !== null) return fenced;
        if (lease.status === "unmounted") return runtime.recordStaleAction(action);
        return runtime.dispatch(action, message);
      },
      onStaleAction(action, renderEpoch) {
        const fenced = fencedCallback("stale", renderEpoch);
        if (fenced !== null) return fenced;
        return runtime.recordStaleAction(action, renderEpoch);
      },
    };
  }

  function renderView(view) {
    const result = rendererMethod(viewRenderer, "update").call(viewRenderer, view, rendererCallbacks(rendererLease));
    noThenable(result, "renderer.update(view)");
    lastRawView = view;
    lastLogicalView = viewSnapshot(viewRenderer, rendererMethod(viewRenderer, "viewRecord"));
  }

  function init() {
    busy = true;
    let initialState;
    try {
      initialState = symbols.init();
      state = initialState;
      const initialView = symbols.view(initialState);
      renderView(initialView);
      initialized = true;
      recordTick({
        action: null,
        message: null,
        dispatchId: null,
        requestedEffects: [],
        completedEffects: [],
      });
    } catch (error) {
      reportFailure("init", error);
      throw new RuntimeFailure("init", error instanceof Error ? error.message : String(error), error);
    } finally {
      busy = false;
    }
    drainDeferred();
  }

  function queueEffectRequests(requests) {
    if (requests.length === 0) return null;
    if (effectHost === null) {
      throw new HostScriptFailure("Update emitted effects but no deterministic effect host was provided");
    }
    for (const request of requests) {
      if (request.effect.reply !== "") {
        pendingEffects.set(keyFor(request), { request: cloneJson(request), queued: false, completed: false });
      }
      const result = effectHost.request(cloneJson(request), (completion) => runtime.complete(completion));
      noThenable(result, "effectHost.request(request)");
    }
    return null;
  }

  function updateAndCommit({ action, message, completion = null }) {
    const dispatchId = nextDispatchId();
    let tickRecorded = false;
    let result;
    let candidateState;
    let rawEffects;
    try {
      result = symbols.update(state, message);
      if (!Array.isArray(result) || result.length !== 2) {
        throw new TypeError("compiled Update must return [nextState,effects]");
      }
      [candidateState, rawEffects] = result;
      const requests = normalizeEffects(
        rawEffects,
        dispatchId,
        capabilities,
        hostCapabilities,
        effectPolicy,
        stateEncoder,
        appIR,
        effectResultTypeId,
      );
      const candidateView = symbols.view(candidateState);
      state = candidateState;
      renderView(candidateView);
      const completedEffects = completion === null ? [] : [{
        dispatchId: completion.dispatchId,
        effectIndex: completion.effectIndex,
        message: cloneJson(completion.message),
      }];
      recordTick({
        action,
        message,
        dispatchId,
        requestedEffects: requests,
        completedEffects,
      });
      tickRecorded = true;
      if (halted) return { accepted: false, dispatchId, error: lastFailure.message, failure: cloneJson(lastFailure) };
      try {
        queueEffectRequests(requests);
      } catch (error) {
        const failure = reportFailure("effect-host", error);
        return { accepted: false, dispatchId, error: failure.message, failure: cloneJson(failure) };
      }
      return { accepted: true, dispatchId };
    } catch (error) {
      if (initialized && !tickRecorded) {
        try {
          recordTick({
            action,
            message,
            dispatchId,
            requestedEffects: [],
            completedEffects: completion === null ? [] : [{
              dispatchId: completion.dispatchId,
              effectIndex: completion.effectIndex,
              message: cloneJson(completion.message),
            }],
          });
        } catch { /* keep original transition failure */ }
      }
      const failure = reportFailure("update", error);
      return { accepted: false, dispatchId, error: failure.message, failure: cloneJson(failure) };
    }
  }

  function runBusy(work) {
    busy = true;
    try {
      return work();
    } finally {
      busy = false;
    }
  }

  function appendSuppressedAction(action) {
    try {
      return recordTick({
        action,
        message: null,
        dispatchId: null,
        requestedEffects: [],
        completedEffects: [],
      });
    } catch (error) {
      reportFailure("suppressed-action", error);
      return null;
    }
  }

  function appendSuppressedInput(actionInput) {
    return runBusy(() => {
      recordingDeferredAction = true;
      try {
        return appendSuppressedAction(validateAction(actionInput));
      } catch (error) {
        reportFailure("suppressed-action", error);
        return null;
      } finally {
        recordingDeferredAction = false;
      }
    });
  }

  function appendDeferred(item) {
    deferred.push(item);
  }

  function drainDeferred(includeHeldReplacementCompletions = false) {
    if (busy || draining) return;
    draining = true;
    try {
      while (deferred.length > 0 && !busy) {
        if (deferred[0].kind === "completion"
            && deferred[0].heldByReplacement === true
            && !includeHeldReplacementCompletions) break;
        const item = deferred.shift();
        if (item.kind === "completion") {
          runBusy(() => processCheckedCompletion(item.completion, true));
        } else if (item.kind === "stale" || item.kind === "suppressed") {
          appendSuppressedInput(item.actionInput);
        } else if (item.kind === "unmount") {
          runBusy(() => performUnmount());
        }
      }
    } finally {
      draining = false;
    }
  }

  function completionStatus(completion, fromQueue = false) {
    const key = keyFor(completion);
    const pending = pendingEffects.get(key);
    if (!pending) return { error: "unknown or extra effect completion" };
    if (pending.completed || (pending.queued && !fromQueue)) return { error: "effect completion already delivered" };
    if (pending.request.effect.reply !== completion.message.name) {
      return { error: "effect completion message does not match the declared reply" };
    }
      if (disposed || halted) return { error: "runtime is disposed or halted" };
    return { key, pending };
  }

  function processCheckedCompletion(completion, fromQueue = false) {
    const status = completionStatus(completion, fromQueue);
    if (status.error) return { accepted: false, error: status.error };
    const { pending } = status;
    pending.queued = false;
    pending.completed = true;
    const goMessage = { Name: completion.message.name, Arg: completion.message.arg };
    return updateAndCommit({
      action: null,
      message: goMessage,
      completion,
    });
  }

  function dispatch(actionInput, messageInput) {
    if (admittingRendererCandidate) {
      return { accepted: false, dispatchId: null, error: "dispatch rejected during renderer candidate admission" };
    }
    if (replacingRenderer) {
      return { accepted: false, dispatchId: null, error: "dispatch rejected during renderer replacement" };
    }
    if (busy) {
      if (admittingCompletion) {
        return { accepted: false, dispatchId: null, error: "reentrant dispatch rejected during completion admission" };
      }
      if (!recordingDeferredAction) deferred.push({ kind: "suppressed", actionInput });
      return { accepted: false, dispatchId: null, error: "reentrant dispatch rejected" };
    }
    busy = true;
    let action;
    let message = null;
    let result;
    try {
      action = validateAction(actionInput);
    } catch (error) {
      const failure = reportFailure("dispatch-input", error);
      result = { accepted: false, error: failure.message, failure: cloneJson(failure) };
    }
    if (action && messageInput !== null && messageInput !== undefined) {
      try {
        message = validateGoMessage(messageInput);
      } catch (error) {
        const failure = reportFailure("dispatch-input", error);
        result = { accepted: false, error: failure.message, failure: cloneJson(failure) };
      }
    }
    if (result === undefined && (disposed || halted || message === null)) {
      appendSuppressedAction(action);
      result = { accepted: !disposed && !halted, dispatchId: null, error: disposed ? "runtime is unmounted" : halted ? "runtime is halted" : null };
    }
    if (result === undefined) result = updateAndCommit({ action, message });
    busy = false;
    drainDeferred();
    return result;
  }

  function recordStaleAction(actionInput, renderEpoch = null) {
    if (admittingRendererCandidate) {
      return { accepted: false, dispatchId: null, stale: true, error: "stale action rejected during renderer candidate admission" };
    }
    if (replacingRenderer) {
      return { accepted: false, dispatchId: null, stale: true, error: "stale action rejected during renderer replacement" };
    }
    if (busy) {
      if (admittingCompletion) {
        return { accepted: false, dispatchId: null, stale: true, error: "reentrant stale action rejected during completion admission" };
      }
      if (!recordingDeferredAction) deferred.push({ kind: "stale", actionInput, renderEpoch });
      return { accepted: true, dispatchId: null, stale: true, queued: true };
    }
    busy = true;
    let result;
    try {
      const action = validateAction(actionInput);
      appendSuppressedAction(action);
      result = { accepted: true, dispatchId: null, stale: true, renderEpoch };
    } catch (error) {
      const failure = reportFailure("stale-action-input", error);
      result = { accepted: false, error: failure.message, failure: cloneJson(failure) };
    } finally {
      busy = false;
    }
    drainDeferred();
    return result;
  }

  function performUnmount() {
    if (disposed) return false;
    disposed = true;
    rendererLease.status = "unmounted";
    cancelHeldReplacementCompletions();
    try {
      const result = rendererMethod(viewRenderer, "unmount").call(viewRenderer);
      noThenable(result, "renderer.unmount()");
    } catch (error) {
      reportFailure("unmount", error);
      return false;
    }
    return true;
  }

  function unmount() {
    if (admittingRendererCandidate) return false;
    if (replacingRenderer) return false;
    if (busy) {
      if (admittingCompletion) return false;
      appendDeferred({ kind: "unmount" });
      return false;
    }
    const result = runBusy(() => performUnmount());
    drainDeferred();
    return result;
  }

  function replaceRenderer(nextRenderer) {
    const attempt = ++rendererReplacementAttempt;
    const fromGeneration = rendererLease.generation;
    if (busy || admittingRendererCandidate) {
      rendererReplacements.push({
        attempt,
        fromGeneration,
        toGeneration: null,
        outcome: "rejected",
        phase: "reentrant",
        oldUnmounted: false,
        focusCaptured: false,
        focusRestored: false,
      });
      throw new TypeError("reentrant renderer replacement rejected");
    }
    if (disposed || halted || !initialized) {
      rendererReplacements.push({
        attempt,
        fromGeneration,
        toGeneration: null,
        outcome: "rejected",
        phase: "runtime-state",
        oldUnmounted: false,
        focusCaptured: false,
        focusRestored: false,
      });
      throw new TypeError(disposed ? "runtime is unmounted" : halted ? "runtime is halted" : "runtime has not initialized");
    }

    const oldRenderer = viewRenderer;
    const oldLease = rendererLease;
    let nextMethods;
    let oldMethods;
    admittingRendererCandidate = true;
    try {
      if (!isRecord(nextRenderer)) throw new TypeError("renderer must provide update, viewRecord, domSnapshot, and unmount");
      requireRendererCapabilities(nextRenderer, capabilities);
      nextMethods = rendererReplacementMethods(nextRenderer);
      if (nextMethods.renderer === oldRenderer) {
        throw new TypeError("cannot replace a renderer with itself");
      }
      oldMethods = rendererReplacementMethods(oldRenderer);
    } catch (error) {
      rendererReplacements.push({
        attempt,
        fromGeneration,
        toGeneration: null,
        outcome: "rejected",
        phase: "admission",
        oldUnmounted: false,
        focusCaptured: false,
        focusRestored: false,
      });
      throw error;
    } finally {
      admittingRendererCandidate = false;
    }

    busy = true;
    replacingRenderer = true;
    const oldLeaseStatus = oldLease.status;
    oldLease.status = "transitioning";
    let nextLease = null;
    let nextGeneration = null;
    let phase = "admission";
    let oldUnmountAttempted = false;
    let oldUnmounted = false;
    let focusCaptured = false;
    let focusRestored = false;
    let resultSnapshot = null;
    let failureToThrow = null;

    try {
      nextGeneration = nextRendererGeneration++;
      nextLease = { generation: nextGeneration, status: "preparing" };

      let focus = null;
      const focusSupported = typeof oldMethods.focusState === "function"
        && typeof nextMethods.restoreFocus === "function";
      if (focusSupported) {
        phase = "focus-capture";
        const capturedFocus = oldMethods.focusState.call(oldRenderer);
        noThenable(capturedFocus, "renderer.focusState()");
        focus = focusStateSnapshot(capturedFocus);
        focusCaptured = focus !== null;
      }

      phase = "old-unmount";
      oldUnmountAttempted = true;
      const oldUnmountResult = oldMethods.unmount.call(oldMethods.renderer);
      noThenable(oldUnmountResult, "renderer.unmount()");
      oldUnmounted = true;
      oldLease.status = "retired";
      rendererUnavailable = true;

      phase = "new-commit";
      const updateResult = nextMethods.update.call(nextMethods.renderer, lastRawView, rendererCallbacks(nextLease));
      noThenable(updateResult, "renderer.update(view)");
      if (focusSupported && focusCaptured) {
        phase = "focus-restore";
        const restoreResult = nextMethods.restoreFocus.call(nextMethods.renderer, focus);
        noThenable(restoreResult, "renderer.restoreFocus(state)");
        if (restoreResult === false) {
          throw new TypeError("new renderer could not restore the captured focus state");
        }
        if (restoreResult !== true) {
          throw new TypeError("renderer.restoreFocus(state) must return a boolean");
        }
        focusRestored = true;
      }

      phase = "new-snapshot";
      const nextView = viewSnapshot(nextMethods.renderer, nextMethods.viewRecord);
      const nextDOM = domSnapshot(nextMethods.renderer, nextMethods.domSnapshot);
      const nextState = readState();
      resultSnapshot = { state: nextState, view: nextView, dom: nextDOM };

      nextLease.status = "active";
      viewRenderer = nextMethods.renderer;
      rendererLease = nextLease;
      rendererGeneration = nextGeneration;
      lastLogicalView = nextView;
      rendererUnavailable = false;
      rendererReplacements.push({
        attempt,
        fromGeneration,
        toGeneration: nextGeneration,
        outcome: "committed",
        phase: "complete",
        oldUnmounted: true,
        focusCaptured,
        focusRestored,
      });
    } catch (error) {
      if (!oldUnmountAttempted) {
        oldLease.status = oldLeaseStatus;
        cancelHeldReplacementCompletions();
        rendererReplacements.push({
          attempt,
          fromGeneration,
          toGeneration: nextGeneration,
          outcome: "rejected",
          phase,
          oldUnmounted: false,
          focusCaptured,
          focusRestored: false,
        });
        failureToThrow = error;
      } else {
        oldLease.status = oldUnmounted ? "retired" : "failed";
        if (nextLease) nextLease.status = "failed";
        rendererUnavailable = true;
        const failure = reportFailure("renderer-replacement", error);
        rendererReplacements.push({
          attempt,
          fromGeneration,
          toGeneration: nextGeneration,
          outcome: "failed",
          phase,
          oldUnmounted,
          focusCaptured,
          focusRestored,
        });
        failureToThrow = new RuntimeFailure("renderer-replacement", failure.message, error);
      }
    } finally {
      replacingRenderer = false;
      busy = false;
      if (replacementCompletionQueued) {
        replacementCompletionQueued = false;
        scheduleReplacementCompletionDrain();
      } else {
        drainDeferred();
      }
    }

    if (failureToThrow !== null) throw failureToThrow;
    return resultSnapshot;
  }

  const runtime = {
    dispatch,
    complete(completion) {
      if (admittingRendererCandidate) {
        return { accepted: false, retryable: true, error: "completion rejected during renderer candidate admission" };
      }
      if (admittingCompletion) {
        return { accepted: false, error: "reentrant completion rejected during completion admission" };
      }
      const alreadyBusy = busy;
      if (!alreadyBusy) busy = true;
      admittingCompletion = true;
      let checked;
      try {
        checked = validateCompletion(completion);
      } catch (error) {
        const message = completionValidationErrorMessage(error);
        admittingCompletion = false;
        if (!alreadyBusy) {
          busy = false;
          drainDeferred();
        }
        return { accepted: false, error: message };
      }
      admittingCompletion = false;
      if (alreadyBusy) {
        const status = completionStatus(checked);
        if (status.error) {
          return { accepted: false, error: status.error };
        }
        const { pending } = status;
        pending.queued = true;
        if (replacingRenderer) replacementCompletionQueued = true;
        appendDeferred({
          kind: "completion",
          completion: checked,
          heldByReplacement: replacingRenderer,
        });
        return { accepted: true, queued: true, dispatchId: null };
      }
      const result = processCheckedCompletion(checked);
      busy = false;
      drainDeferred();
      return result;
    },
    recordStaleAction,
    trace() {
      return cloneJson(trace);
    },
    snapshot: runtimeSnapshot,
    replaceRenderer,
    rendererDiagnostics,
    effectDiagnostics,
    cancelEffect,
    isAdmittingRendererCandidate() {
      return admittingRendererCandidate;
    },
    unmount,
    failure() {
      return lastFailure === null ? null : cloneJson(lastFailure);
    },
    isUnmounted() {
      return disposed;
    },
  };

  init();
  return runtime;
}

export { SUPPORTED_EFFECT_KINDS };

