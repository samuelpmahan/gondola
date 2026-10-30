const TRACE_SCHEMA = "gobi.trace/v1";
const COMPILED_SCHEMA = "gobi.compiled-module/v1";
const APP_SCHEMA = "gobi.app-ir/v1";
const HOST_SCRIPT_SCHEMA = "gobi.host-script/v1";
const GO_STRUCT_MARKER = "__goStructValue";
const SUPPORTED_EFFECT_KINDS = new Set(["fixture.request"]);
const SUPPORTED_CAPABILITIES = new Set([
  "view.node",
  "binding.value",
  "binding.checked",
  "effect.request-reply",
  "numeric.safe-integer",
  "numeric.float64",
]);

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
  if (!Array.isArray(component.capabilities)
      || component.capabilities.some((capability) => typeof capability !== "string" || !SUPPORTED_CAPABILITIES.has(capability))) {
    throw new TypeError("component.capabilities must be a supported capability array");
  }
  return { component, symbols };
}

function requireEncoder(encoder) {
  if (!isRecord(encoder) || typeof encoder.gobiEncodeState !== "function") {
    throw new TypeError("encoder must export gobiEncodeState");
  }
  return encoder;
}

function requireRenderer(renderer) {
  if (!isRecord(renderer)
      || typeof renderer.update !== "function"
      || typeof renderer.viewRecord !== "function"
      || typeof renderer.domSnapshot !== "function"
      || typeof renderer.unmount !== "function") {
    throw new TypeError("renderer must provide update, viewRecord, domSnapshot, and unmount");
  }
  return renderer;
}

function valueSnapshot(encoder, state, stateType) {
  const value = encoder.gobiEncodeState(state, stateType);
  if (!isRecord(value) || value.typeId !== stateType || typeof value.kind !== "string") {
    throw new TypeError("gobiEncodeState returned a malformed Value for the component state type");
  }
  return cloneJson(value);
}

function viewSnapshot(renderer) {
  const view = renderer.viewRecord();
  exactKeys(view, ["tree", "bindings"], "ViewRecord");
  if (!isRecord(view.tree) || !Array.isArray(view.bindings)) {
    throw new TypeError("renderer.viewRecord() must return {tree,bindings[]} ");
  }
  return cloneJson(view);
}

function domSnapshot(renderer) {
  const dom = renderer.domSnapshot();
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

function noThenable(value, label) {
  if (value !== null && (typeof value === "object" || typeof value === "function")
      && typeof value.then === "function") {
    throw new TypeError(`${label} must complete synchronously`);
  }
}

function normalizeEffects(effects, dispatchId, capabilities) {
  if (effects === null || effects === undefined) return [];
  if (!Array.isArray(effects)) throw new TypeError("Update effects must be an array or null");
  if (effects.length > 0 && !capabilities.includes("effect.request-reply")) {
    throw new TypeError("component emitted effects without effect.request-reply capability");
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(effects, "length");
  if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
      !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    throw new TypeError("Update effects has an invalid length");
  }
  const effectCount = lengthDescriptor.value;
  const effectKeys = Reflect.ownKeys(effects);
  if (effectKeys.length !== effectCount + 1 || effectKeys.some((key, index) => key !== (index === effectCount ? "length" : String(index)))) {
    throw new TypeError("Update effects must be a dense array without extra properties");
  }
  const result = [];
  for (let effectIndex = 0; effectIndex < effectCount; effectIndex += 1) {
    const element = Object.getOwnPropertyDescriptor(effects, String(effectIndex));
    if (!element || !Object.prototype.hasOwnProperty.call(element, "value") || !element.enumerable ||
        !element.writable || !element.configurable) {
      throw new TypeError(`Update effects[${effectIndex}] must be an own data property`);
    }
    const rawEffect = element.value;
    const fields = goStructDataRecord(rawEffect, ["Kind", "Name", "Arg", "Reply"], "gobi.Effect");
    const effect = {
      kind: requireString(fields.Kind, "gobi.Effect.Kind"),
      name: requireString(fields.Name, "gobi.Effect.Name"),
      arg: requireString(fields.Arg, "gobi.Effect.Arg"),
      reply: requireString(fields.Reply, "gobi.Effect.Reply"),
    };
    validateSupportedEffect(effect, "gobi.Effect");
    result.push({ dispatchId, effectIndex, effect });
  }
  return result;
}

function keyFor(request) {
  return `${request.dispatchId}/${request.effectIndex}`;
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
export function mountCompiledApp({
  module: compiled,
  componentId,
  appId = componentId,
  encoder,
  renderer,
  effectHost = null,
  onTick = null,
  onFailure = null,
}) {
  requireString(componentId, "componentId");
  requireString(appId, "appId");
  if (onTick !== null && typeof onTick !== "function") throw new TypeError("onTick must be a function or null");
  if (onFailure !== null && typeof onFailure !== "function") throw new TypeError("onFailure must be a function or null");

  const { component, symbols } = getComponent(compiled, componentId);
  const stateEncoder = requireEncoder(encoder);
  const viewRenderer = requireRenderer(renderer);
  if (effectHost !== null && typeof effectHost.request !== "function") {
    throw new TypeError("effectHost must provide request(request, deliver) or be null");
  }
  const capabilities = component.capabilities;
  let state;
  let initialized = false;
  let disposed = false;
  let halted = false;
  let busy = false;
  let draining = false;
  let admittingCompletion = false;
  let recordingDeferredAction = false;
  let updateSequence = 0n;
  const ticks = [];
  const pendingEffects = new Map();
  const deferred = [];
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

  function recordTick({ action, message, dispatchId, requestedEffects = [], completedEffects = [] }) {
    const tick = {
      index: ticks.length,
      action: action === null ? null : validateAction(action),
      message: message === null ? null : messageRecord(message),
      dispatchId,
      state: readState(),
      requestedEffects: cloneJson(requestedEffects),
      completedEffects: cloneJson(completedEffects),
      view: disposed ? cloneJson(lastLogicalView) : viewSnapshot(viewRenderer),
      dom: domSnapshot(viewRenderer),
    };
    ticks.push(tick);
    try { onTick?.(cloneJson(tick)); } catch (error) {
      reportFailure("trace", error);
    }
    return tick;
  }

  function rendererCallbacks() {
    return {
      dispatch(action, message) {
        return runtime.dispatch(action, message);
      },
      onStaleAction(action, renderEpoch) {
        return runtime.recordStaleAction(action, renderEpoch);
      },
    };
  }

  function renderView(view) {
    const result = viewRenderer.update(view, rendererCallbacks());
    noThenable(result, "renderer.update(view)");
    lastLogicalView = viewSnapshot(viewRenderer);
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
      const requests = normalizeEffects(rawEffects, dispatchId, capabilities);
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

  function drainDeferred() {
    if (busy || draining) return;
    draining = true;
    try {
      while (deferred.length > 0 && !busy) {
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
    try {
      viewRenderer.unmount();
    } catch (error) {
      reportFailure("unmount", error);
      return false;
    }
    return true;
  }

  function unmount() {
    if (busy) {
      if (admittingCompletion) return false;
      appendDeferred({ kind: "unmount" });
      return false;
    }
    const result = runBusy(() => performUnmount());
    drainDeferred();
    return result;
  }

  const runtime = {
    dispatch,
    complete(completion) {
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
        appendDeferred({ kind: "completion", completion: checked });
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
    snapshot() {
      if (!initialized) throw new RuntimeFailure("snapshot", "runtime has not initialized");
      return {
        state: readState(),
        view: disposed ? cloneJson(lastLogicalView) : viewSnapshot(viewRenderer),
        dom: domSnapshot(viewRenderer),
      };
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

