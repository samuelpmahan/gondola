import { bindCompiledComponent } from "../../compiled-frontend/frontend/react/bindings.mjs";
import { assertInputRecord, assertPublicationRecord, closedEffectDescriptors, validateModuleEffectsPair } from "../build/abi-admission.mjs";

const SNAPSHOT_SCHEMA = "gobi.module-effects-snapshot/v1";
const TRACE_SCHEMA = "gobi.module-effects-trace/v1";
const PARENT_BRIDGE_KEYS = ["output", "receive"];
const CHILD_BRIDGE_KEYS = ["input", "publication"];
const KEYED_HELPER_KEYS = ["children", "receiveKeyed", "isCurrent"];
const EFFECT_FIELDS = ["kind", "name", "arg", "reply"];
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const TOKEN_PATTERN = /^([ab]):g([1-9][0-9]*):r([1-9][0-9]*)$/;
export const COMPILED_MODULE_EFFECTS_HOST_CAPABILITIES = Object.freeze([
  "effect.request-reply",
  "effect.cancel",
]);

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function exactRecord(value, keys, label) {
  if (!record(value)) throw new TypeError(`${label} must be an object`);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) throw new TypeError(`${label} has symbol properties`);
  const expected = [...keys].sort();
  const sorted = [...actual].sort();
  if (sorted.length !== expected.length || sorted.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} must contain exactly ${expected.join(", ")}`);
  }
  const result = {};
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || "get" in descriptor || "set" in descriptor) {
      throw new TypeError(`${label}.${key} must be an own data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function cloneJSON(value, path = "value") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => cloneJSON(item, `${path}[${index}]`));
  if (!record(value)) throw new TypeError(`${path} contains an unsupported value`);
  const copy = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined || "get" in descriptor || "set" in descriptor) {
      throw new TypeError(`${path}.${key} is not a JSON data property`);
    }
    copy[key] = cloneJSON(descriptor.value, `${path}.${key}`);
  }
  return copy;
}

function noThenable(value, label) {
  if (value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function") {
    throw new TypeError(`${label} must complete synchronously`);
  }
  return value;
}

function required(value, key, label) {
  if (value === null || value === undefined || !Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is missing`);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value") || "get" in descriptor || "set" in descriptor) {
    throw new TypeError(`${label}.${key} must be an own data property`);
  }
  return descriptor.value;
}

function sliceValues(value, label) {
  if (value === null) return [];
  if (Array.isArray(value)) return value.slice();
  if (!record(value)) throw new TypeError(`${label} must be an array or GoScript slice`);
  const backing = required(value, "backing", label);
  const offset = required(value, "offset", label);
  const length = required(value, "length", label);
  const capacity = required(value, "capacity", label);
  if (!Array.isArray(backing) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || !Number.isSafeInteger(capacity) ||
      offset < 0 || length < 0 || capacity < length || offset + capacity > backing.length) throw new TypeError(`${label} has invalid GoScript slice bounds`);
  return backing.slice(offset, offset + length);
}

function valueToJSON(value, path = "state") {
  if (!record(value) || typeof value.typeId !== "string" || typeof value.kind !== "string") throw new TypeError(`${path} is not an encoded Go Value`);
  switch (value.kind) {
    case "bool": return required(value, "bool", path);
    case "string": return required(value, "string", path);
    case "int":
    case "uint": {
      const n = Number(required(value, "integer", path));
      if (!Number.isSafeInteger(n)) throw new TypeError(`${path} integer is outside the safe JSON range`);
      return n;
    }
    case "float64": {
      const bits = required(value, "float64Bits", path);
      if (typeof bits !== "string" || !/^[0-9a-f]{16}$/.test(bits)) throw new TypeError(`${path} has invalid float64 bits`);
      const bytes = new ArrayBuffer(8);
      const view = new DataView(bytes);
      view.setBigUint64(0, BigInt(`0x${bits}`), false);
      const n = view.getFloat64(0, false);
      if (!Number.isFinite(n)) throw new TypeError(`${path} has a non-finite float`);
      return n;
    }
    case "struct": {
      const fields = required(value, "fields", path);
      if (!Array.isArray(fields)) throw new TypeError(`${path}.fields must be an array`);
      const result = {};
      for (const field of fields) {
        const item = exactRecord(field, ["name", "value"], `${path}.field`);
        if (typeof item.name !== "string" || Object.hasOwn(result, item.name)) throw new TypeError(`${path} has duplicate state fields`);
        result[item.name] = valueToJSON(item.value, `${path}.${item.name}`);
      }
      return result;
    }
    case "slice":
    case "array": {
      const items = required(value, "items", path);
      if (!Array.isArray(items)) throw new TypeError(`${path}.items must be an array`);
      if (value.kind === "slice" && required(value, "isNil", path)) return null;
      return items.map((item, index) => valueToJSON(item, `${path}[${index}]`));
    }
    default: throw new TypeError(`${path} has unsupported encoded kind ${value.kind}`);
  }
}

function inputSide(side, label, expectedBridges, needsKeyed) {
  if (!record(side)) throw new TypeError(`${label} module side must be an object`);
  const requiredKeys = ["module", "bridges", "encoder", "descriptor", "descriptorBytes", "artifactBytes", "componentId"];
  if (needsKeyed) requiredKeys.push("keyed", "keyedSidecar");
  for (const key of requiredKeys) if (!Object.hasOwn(side, key)) throw new TypeError(`${label}.${key} is required`);
  const module = exactRecord(side.module, ["schema", "appIR", "symbols"], `${label}.module`);
  if (module.schema !== "gobi.compiled-module/v1" || !record(module.symbols)) throw new TypeError(`${label}.module is not a compiled Gobi module`);
  if (typeof side.componentId !== "string" || side.componentId === "") throw new TypeError(`${label}.componentId must be non-empty`);
  if (!record(side.encoder) || typeof side.encoder.gobiEncodeState !== "function") throw new TypeError(`${label}.encoder must expose gobiEncodeState`);
  if (!(side.descriptorBytes instanceof Uint8Array) || side.descriptorBytes.byteLength === 0) throw new TypeError(`${label}.descriptorBytes must contain module-abi.json bytes`);
  if (!(side.artifactBytes instanceof Map) && !record(side.artifactBytes)) throw new TypeError(`${label}.artifactBytes must be a Map or object`);
  const bridges = exactRecord(side.bridges, expectedBridges, `${label}.bridges`);
  for (const [key, fn] of Object.entries(bridges)) if (typeof fn !== "function") throw new TypeError(`${label}.bridges.${key} must be callable`);
  let keyed;
  if (needsKeyed) {
    keyed = exactRecord(side.keyed, KEYED_HELPER_KEYS, "parent.keyed");
    for (const [key, fn] of Object.entries(keyed)) if (typeof fn !== "function") throw new TypeError(`parent.keyed.${key} must be callable`);
    if (!record(side.keyedSidecar) || !(side.keyedSidecar.bytes instanceof Uint8Array)) throw new TypeError("parent.keyedSidecar is invalid");
  }
  return { ...side, module, bridges, keyed };
}

function componentEntry(side, label) {
  const bound = bindCompiledComponent(side.module, side.componentId);
  if (bound.compiled.appIR.components.length !== 1) throw new TypeError(`${label} must contain exactly one compiled component`);
  return bound;
}

function decodeChildren(value) {
  const rows = sliceValues(value, "parent.Children");
  if (rows.length > 2) throw new TypeError("keyed module effects profile exceeds two child keys");
  const result = rows.map((row, index) => {
    const item = exactRecord(row, ["key", "generation"], `parent.Children[${index}]`);
    if ((item.key !== "a" && item.key !== "b") || !Number.isSafeInteger(item.generation) || item.generation < 1 || item.generation > MAX_SAFE) {
      throw new TypeError(`parent.Children[${index}] has invalid key or generation`);
    }
    return { key: item.key, generation: item.generation };
  });
  if (new Set(result.map((row) => row.key)).size !== result.length) throw new TypeError("parent.Children contains duplicate keys");
  return result;
}

function actionRecord(action) {
  const result = exactRecord(action, ["path", "event", "value"], "Action");
  if (![result.path, result.event, result.value].every((value) => typeof value === "string")) throw new TypeError("Action fields must be strings");
  if (result.path !== "" && !/^(0|[1-9][0-9]*)(\/(0|[1-9][0-9]*))*$/.test(result.path)) throw new TypeError("Action.path is not canonical");
  return result;
}

function normalizePath(path) { return path === "" ? [] : path.split("/").map(Number); }

function viewParts(raw, label) {
  if (!record(raw)) throw new TypeError(`${label}.View returned a non-object`);
  const hasTree = Object.hasOwn(raw, "Tree");
  const hasBindings = Object.hasOwn(raw, "Bindings");
  if (hasTree !== hasBindings) throw new TypeError(`${label}.View must provide Tree and Bindings together`);
  return { raw, tree: hasTree ? required(raw, "Tree", `${label}.View`) : raw,
    bindings: hasBindings ? sliceValues(required(raw, "Bindings", `${label}.View`), `${label}.View.Bindings`) : [] };
}

function resolveMessage(view, action) {
  let node = view.tree;
  for (const index of normalizePath(action.path)) {
    node = sliceValues(required(node, "Kids", "View node"), "View node.Kids")[index] ?? null;
    if (node === null) return { disabled: false, message: null };
  }
  const attrs = sliceValues(required(node, "Attrs", "View node"), "View node.Attrs");
  if (attrs.some((attr) => required(attr, "Name", "View attribute") === "disabled" && required(attr, "Flag", "View attribute") === true)) {
    return { disabled: true, message: null };
  }
  const matches = [];
  for (const binding of view.bindings) {
    if (required(binding, "Path", "View binding") === action.path && required(binding, "Event", "View binding") === action.event) {
      matches.push({ Name: required(binding, "Message", "View binding"), Arg: action.value });
    }
  }
  for (const handler of sliceValues(required(node, "On", "View node"), "View node.On")) {
    if (required(handler, "Event", "View handler") === action.event) {
      matches.push({ Name: required(handler, "Message", "View handler"), Arg: required(handler, "Arg", "View handler") });
    }
  }
  if (matches.length > 1) throw new TypeError(`multiple Go handlers target ${action.path}/${action.event}`);
  return { disabled: false, message: matches[0] ?? null };
}

function validateMessage(message, expected = null) {
  const result = exactRecord(message, ["Name", "Arg"], "Go message");
  if (typeof result.Name !== "string" || typeof result.Arg !== "string") throw new TypeError("Go message fields must be strings");
  if (expected && (result.Name !== expected.Name || result.Arg !== expected.Arg)) throw new TypeError("renderer message does not match the current Go View handler");
  return result;
}

function validateToken(token, label = "effect token") {
  if (typeof token !== "string") throw new TypeError(`${label} must be a string`);
  const match = TOKEN_PATTERN.exec(token);
  if (!match || match[2].length > 16 || match[3].length > 16 || Number(match[2]) > MAX_SAFE || Number(match[3]) > MAX_SAFE) {
    throw new TypeError(`${label} must be key:g<positive-safe-generation>:r<positive-safe-requestID>`);
  }
  return { token, key: match[1], generation: Number(match[2]), requestID: Number(match[3]) };
}

export function validateModuleEffectsDescriptor(effect, label = "Go effect") {
  const value = exactRecord(effect, EFFECT_FIELDS, label);
  for (const field of EFFECT_FIELDS) if (typeof value[field] !== "string") throw new TypeError(`${label}.${field} must be a string`);
  validateToken(value.arg, `${label}.arg`);
  if (value.kind === "fixture.request" && value.name === "save" && value.reply === "complete") return undefined;
  if (value.kind === "lifecycle.cancel" && value.name === "cancel" && value.reply === "") return undefined;
  throw new TypeError(`${label} is outside the closed save/cancel descriptor set`);
}

function validateRenderer(renderer, label, component) {
  if (!record(renderer)) throw new TypeError(`${label} renderer factory must return an object`);
  for (const method of ["update", "viewRecord", "domSnapshot", "unmount"]) {
    if (typeof renderer[method] !== "function") throw new TypeError(`${label} renderer must provide ${method}()`);
  }
  const caps = renderer.viewCapabilities;
  if (!Array.isArray(caps) || caps.some((item) => typeof item !== "string")) throw new TypeError(`${label} renderer must declare view capabilities`);
  const supported = new Set(["view.node", "binding.value", "binding.checked"]);
  const requiredCaps = component.capabilities.filter((item) => supported.has(item));
  const missing = requiredCaps.filter((item) => !caps.includes(item));
  if (missing.length) throw new TypeError(`${label} renderer is missing capabilities ${missing.join(", ")}`);
  return renderer;
}

function rendererSnapshot(renderer, label) {
  return { view: cloneJSON(noThenable(renderer.viewRecord(), `${label}.viewRecord()`), `${label}.view`),
    dom: cloneJSON(noThenable(renderer.domSnapshot(), `${label}.domSnapshot()`), `${label}.dom`) };
}

function rendererFactory(renderers, backend) {
  if ((backend !== "react" && backend !== "dom") || !record(renderers) || !Object.hasOwn(renderers, backend) || typeof renderers[backend] !== "function") {
    throw new TypeError(`renderer ${JSON.stringify(backend)} is not registered in the closed React/DOM profile`);
  }
  return renderers[backend];
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateParentKeyedSidecar(parent, backend) {
  const pin = parent.keyedSidecar;
  if (!(pin.bytes instanceof Uint8Array) || pin.byteLength !== pin.bytes.byteLength || pin.byteLength <= 0 ||
      typeof pin.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(pin.sha256)) throw new TypeError("parent keyed helper byte pin is malformed");
  if (await sha256(pin.bytes) !== pin.sha256) throw new TypeError("parent keyed helper bytes do not match their digest");
  if (pin.backend !== backend || pin.packagePath !== parent.descriptor.packagePath || pin.componentId !== parent.componentId ||
      pin.moduleABI !== parent.descriptor.abiSHA256 || typeof pin.appIR !== "string" || !/^[0-9a-f]{64}$/.test(pin.appIR)) {
    throw new TypeError("parent keyed helper pin does not match backend, AppIR, component, or module ABI");
  }
  const appIRArtifact = Array.isArray(parent.descriptor.artifacts) ? parent.descriptor.artifacts.find((item) => item.path.endsWith("/app-ir.json")) : null;
  const appIRBytes = appIRArtifact
    ? parent.artifactBytes instanceof Map ? parent.artifactBytes.get(appIRArtifact.path) : parent.artifactBytes[appIRArtifact.path]
    : null;
  if (!(appIRBytes instanceof Uint8Array) || await sha256(appIRBytes) !== pin.appIR) {
    throw new TypeError("parent keyed helper pin does not match the parent AppIR artifact");
  }
}

function moduleState(side, bound, state, label) {
  const encoded = noThenable(side.encoder.gobiEncodeState(state, bound.component.stateType), `${label} state encoder`);
  if (!record(encoded) || encoded.typeId !== bound.component.stateType) throw new TypeError(`${label} state encoder returned a different type`);
  return { encoded: cloneJSON(encoded, `${label}.encoded`), state: valueToJSON(encoded, `${label}.state`) };
}

function decodeEffectSlice(side, bound, effects, label) {
  if (effects === null || effects === undefined) return [];
  const declaration = bound.compiled.appIR.symbols.find((item) => item.id === bound.component.update);
  const effectType = declaration?.signature?.results?.[1];
  if (typeof effectType !== "string") throw new TypeError(`${label}.Update does not declare its effect slice result`);
  const encoded = noThenable(side.encoder.gobiEncodeState(effects, effectType), `${label} effect encoder`);
  const slice = exactRecord(encoded, ["typeId", "kind", "isNil", "items"], `${label} encoded effects`);
  if (slice.typeId !== effectType || slice.kind !== "slice" || !Array.isArray(slice.items) || typeof slice.isNil !== "boolean") {
    throw new TypeError(`${label}.Update effects are not the declared GoScript effect slice`);
  }
  if (slice.isNil && slice.items.length) throw new TypeError(`${label}.Update returned a nil effect slice with elements`);
  return slice.items.map((item, index) => {
    const encodedEffect = exactRecord(item, ["typeId", "kind", "fields"], `${label}.effects[${index}]`);
    if (encodedEffect.kind !== "struct" || !Array.isArray(encodedEffect.fields)) throw new TypeError(`${label}.effects[${index}] is not a Go effect struct`);
    const fields = Object.fromEntries(encodedEffect.fields.map((field) => {
      const row = exactRecord(field, ["name", "value"], `${label}.effect field`);
      return [row.name, row.value?.string];
    }));
    const effect = { kind: fields.Kind, name: fields.Name, arg: fields.Arg, reply: fields.Reply };
    validateModuleEffectsDescriptor(effect, `${label}.effects[${index}]`);
    return effect;
  });
}

function eventMessage(target, child, action, message, result, kind, eventIndex) {
  return { eventIndex, kind, target, key: child?.slot.key ?? null, generation: child?.slot.generation ?? null,
    action: action ? cloneJSON(action) : null, message: message ? cloneJSON(message) : null,
    accepted: result?.accepted === true, suppressed: result?.suppressed === true, stale: result?.stale === true };
}

/** A deterministic transport that queues requests until deliver() is called. */
export function createDeferredModuleEffectTransport() {
  let sequence = 0;
  const items = [];
  const byToken = new Map();
  const ledger = [];
  function log(event) { ledger.push({ sequence: sequence++, ...event }); }
  function start(request, deliver) {
    const token = request.effect.arg;
    if (byToken.has(token)) throw new TypeError(`duplicate transport token ${token}`);
    const item = { request: cloneJSON(request), token, deliver, status: "pending" };
    items.push(item); byToken.set(token, item);
    log({ kind: "start", token, correlation: { dispatchId: request.dispatchId, effectIndex: request.effectIndex }, status: "pending" });
  }
  function cancel(token, correlation) {
    const item = byToken.get(token);
    if (!item || item.status !== "pending") return false;
    item.status = "cancelled";
    log({ kind: "cancel", token, correlation: cloneJSON(correlation), status: "cancelled" });
    return true;
  }
  function invoke(item, reply, kind) {
    const result = item.deliver(reply);
    const accepted = result?.accepted === true;
    log({ kind, token: item.token, status: accepted ? "accepted" : result?.queued ? "queued" : "rejected",
      reply: reply === undefined ? null : cloneJSON(reply), outcome: result?.error ?? (accepted ? "accepted" : "rejected") });
    if (accepted) item.status = "delivered";
    return result;
  }
  return {
    start,
    cancel,
    deliver(token, reply = undefined) {
      const item = byToken.get(token);
      if (!item || item.status !== "pending") {
        log({ kind: "deliver", token, status: item?.status ?? "unknown", outcome: "rejected" });
        return { accepted: false, outcome: "rejected", error: `transport request is ${item?.status ?? "unknown"}` };
      }
      return invoke(item, reply, "deliver");
    },
    forceDeliverRetained(token, reply = undefined) {
      const item = byToken.get(token);
      if (!item) {
        log({ kind: "force-deliver-retained", token, status: "unknown", outcome: "rejected" });
        return { accepted: false, outcome: "rejected", error: "unknown retained transport callback" };
      }
      return invoke(item, reply, "force-deliver-retained");
    },
    pending() { return items.filter((item) => item.status === "pending").map((item) => cloneJSON(item.request)); },
    records() { return cloneJSON(ledger); },
  };
}

/** Real asynchronous setTimeout transport used by the interactive demo. */
export function createTimerModuleEffectTransport({ delayMs = 650 } = {}) {
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError("delayMs must be a nonnegative finite number");
  let sequence = 0;
  const items = new Map();
  const ledger = [];
  function log(event) { ledger.push({ sequence: sequence++, ...event }); }
  return {
    start(request, deliver) {
      const token = request.effect.arg;
      if (items.has(token)) throw new TypeError(`duplicate timer token ${token}`);
      const item = { status: "pending", timer: null, request: cloneJSON(request), deliver };
      items.set(token, item);
      log({ kind: "start", token, correlation: { dispatchId: request.dispatchId, effectIndex: request.effectIndex }, status: "pending" });
      item.timer = setTimeout(() => {
        if (item.status !== "pending") return;
        const reply = { Name: "complete", Arg: token };
        const result = deliver(reply);
        const accepted = result?.accepted === true;
        log({ kind: "timer-reply", token, status: accepted ? "accepted" : "rejected", outcome: result?.error ?? (accepted ? "accepted" : "rejected") });
        if (accepted) item.status = "delivered";
      }, delayMs);
    },
    cancel(token, correlation) {
      const item = items.get(token);
      if (!item || item.status !== "pending") return false;
      clearTimeout(item.timer);
      item.status = "cancelled";
      log({ kind: "cancel", token, correlation: cloneJSON(correlation), status: "cancelled" });
      return true;
    },
    pending() { return [...items.values()].filter((item) => item.status === "pending").map((item) => cloneJSON(item.request)); },
    records() { return cloneJSON(ledger); },
  };
}

function validateTransport(transport) {
  if (!transport || typeof transport.start !== "function" || typeof transport.cancel !== "function") {
    throw new TypeError("transport must expose start(request, deliver) and cancel(token, correlation)");
  }
  return transport;
}

/** Mounts the existing keyed parent and separately compiled effect child modules. */
export async function mountCompiledModuleEffects(options) {
  if (!record(options)) throw new TypeError("mount options must be an object");
  const parent = inputSide(options.parent, "parent", PARENT_BRIDGE_KEYS, true);
  const child = inputSide(options.child, "child", CHILD_BRIDGE_KEYS, false);
  const backend = options.backend;
  const factory = rendererFactory(options.renderers, backend);
  const container = options.container;
  if (!container || container.nodeType !== 1 || !container.ownerDocument || typeof container.replaceChildren !== "function") {
    throw new TypeError("container must be an empty DOM element");
  }
  if (container.childNodes.length !== 0) throw new TypeError("container must be empty before mounting module effects");
  const transport = validateTransport(options.transport ?? createDeferredModuleEffectTransport());
  const onFailure = options.onFailure ?? null;
  if (onFailure !== null && typeof onFailure !== "function") throw new TypeError("onFailure must be a function or null");

  await validateParentKeyedSidecar(parent, backend);
  const admitted = await validateModuleEffectsPair({
    parent: { descriptor: parent.descriptor, descriptorBytes: parent.descriptorBytes, appIR: parent.module.appIR, artifactBytes: parent.artifactBytes },
    child: { descriptor: child.descriptor, descriptorBytes: child.descriptorBytes, appIR: child.module.appIR, artifactBytes: child.artifactBytes },
  });
  parent.module = { ...parent.module, appIR: admitted.parent.appIR };
  child.module = { ...child.module, appIR: admitted.child.appIR };
  if (JSON.stringify(admitted.closedEffectDescriptors) !== JSON.stringify(closedEffectDescriptors)) {
    throw new TypeError("module-effects admission returned a different closed descriptor set");
  }
  if (child.closedEffectDescriptors && JSON.stringify(child.closedEffectDescriptors) !== JSON.stringify(closedEffectDescriptors)) {
    throw new TypeError("child build carries a different closed effect descriptor set");
  }
  const parentBound = componentEntry(parent, "parent");
  const childBound = componentEntry(child, "child");
  const parentCaps = new Set(parentBound.component.capabilities);
  for (const capability of COMPILED_MODULE_EFFECTS_HOST_CAPABILITIES) {
    if (!childBound.component.capabilities.includes(capability)) throw new TypeError(`child component is missing declared capability ${capability}`);
  }
  if (parentCaps.has("effect.request-reply") || parentCaps.has("effect.cancel")) throw new TypeError("keyed parent effects are outside this fixture profile");

  let parentRoot = container.ownerDocument.createElement("div");
  parentRoot.setAttribute("data-gobi-module-root", "parent");
  let parentRenderer = null;
  let parentState;
  let parentView;
  let slots = [];
  let children = new Map();
  let active = true;
  let busy = false;
  let startingEffects = false;
  let failed = null;
  let rendererEpoch = 1;
  let backendName = backend;
  let effectDispatchSequence = 0;
  let nextEventIndex = 0;
  let activeStateEventIndex = null;
  let nextLedgerSequence = 0;
  const queuedStarts = [];
  const events = [];
  const callOrder = [];
  const effectLedger = [];
  const lifecycleLedger = [];
  const orderedLedger = [];
  const retiredChildren = [];
  const effectItems = new Map();
  const counts = { parentInit: 0, childInit: 0, parentUpdate: 0, childUpdate: 0, parentView: 0, childView: 0,
    output: 0, input: 0, publication: 0, receiveKeyed: 0, children: 0, isCurrent: 0 };

  function logCall(owner, role, slot = null) {
    const row = { sequence: callOrder.length, stateEventIndex: activeStateEventIndex, owner, role };
    if (slot) { row.key = slot.key; row.generation = slot.generation; }
    callOrder.push(row);
  }
  function lifecycle(kind, details = {}) {
    const row = { sequence: orderedLedger.length, kind, rendererEpoch, ...details };
    lifecycleLedger.push(row);
    orderedLedger.push(row);
    return row;
  }
  function reportFailure(error) {
    failed ??= error instanceof Error ? error : new Error(String(error));
    try { onFailure?.(failed); } catch { /* keep the first failure */ }
    return failed;
  }
  function assertActive() {
    if (!active || failed) throw new TypeError(`compiled module effects host is ${failed ? "failed" : "unmounted"}`);
  }
  function keyedChildren(state = parentState) {
    counts.children += 1; logCall("parent", "Children");
    return decodeChildren(noThenable(parent.keyed.children(state), "parent.Children"));
  }
  function isCurrent(key, generation) {
    counts.isCurrent += 1; logCall("parent", "IsCurrent", { key, generation });
    const result = noThenable(parent.keyed.isCurrent(parentState, key, generation), "parent.IsCurrent");
    if (typeof result !== "boolean") throw new TypeError("parent.IsCurrent must return bool");
    return result;
  }
  function callOutput() {
    counts.output += 1; logCall("parent", "Output");
    return assertInputRecord(noThenable(parent.bridges.output(parentState), "parent.Output"));
  }
  function callInput(instance, input) {
    counts.input += 1; logCall("child", "Input", instance.slot);
    instance.input = input;
    instance.state = noThenable(child.bridges.input(instance.state, input), "child.Input");
  }
  function callPublication(instance) {
    counts.publication += 1; logCall("child", "Publication", instance.slot);
    return assertPublicationRecord(noThenable(child.bridges.publication(instance.state), "child.Publication"));
  }
  function receivePublication(instance, publication) {
    if (!isCurrent(instance.slot.key, instance.slot.generation)) return false;
    counts.receiveKeyed += 1; logCall("parent", "ReceiveKeyed", instance.slot);
    parentState = noThenable(parent.keyed.receiveKeyed(parentState, instance.slot.key, instance.slot.generation, publication), "parent.ReceiveKeyed");
    return true;
  }
  function makeView(side, bound, state, label, instance = null) {
    counts[`${label}View`] += 1; logCall(label, "View", instance?.slot ?? null);
    return viewParts(noThenable(bound.View(state), `${label}.View`), label);
  }
  function recordLedger(kind, item, extra = {}) {
    const entry = { sequence: nextLedgerSequence++, kind, token: item.token, key: item.key, generation: item.generation,
      correlation: cloneJSON(item.correlation), stateEventIndex: item.stateEventIndex, rendererEpoch,
      status: item.status, pendingCount: [...effectItems.values()].filter((candidate) => candidate.status === "pending" || candidate.status === "queued").length,
      ...extra };
    effectLedger.push(entry);
    orderedLedger.push({ ...cloneJSON(entry), effectSequence: entry.sequence, sequence: orderedLedger.length });
    return entry;
  }
  function committedPendingGo() {
    return [...children.values()].flatMap((instance) => instance.state?.Pending === true && typeof instance.state?.Token === "string"
      ? [{ key: instance.slot.key, generation: instance.slot.generation, token: instance.state.Token }]
      : []);
  }
  function nextEffectCorrelation() {
    effectDispatchSequence += 1;
    return { dispatchId: `dispatch-${String(effectDispatchSequence).padStart(6, "0")}`, effectIndex: 0 };
  }
  function startEffect(effect, stateEventIndex) {
    validateModuleEffectsDescriptor(effect);
    const identity = validateToken(effect.arg);
    if (effect.kind !== "fixture.request") throw new TypeError("lifecycle cancellation must use the Go cancellation path");
    const instance = children.get(identity.key);
    if (!instance || instance.slot.generation !== identity.generation) throw new TypeError(`request ${effect.arg} has no live child generation`);
    const correlation = nextEffectCorrelation();
    if (effectItems.has(effect.arg)) throw new TypeError(`duplicate Go request token ${effect.arg}`);
    const item = { token: effect.arg, key: identity.key, generation: identity.generation, requestID: identity.requestID,
      correlation, effect: cloneJSON(effect), lifetime: instance.lifetime, stateEventIndex, status: "queued", delivery: null };
    item.delivery = (reply = undefined) => deliverEffect(item, reply, "transport");
    effectItems.set(item.token, item);
    queuedStarts.push(item);
    recordLedger("request", item, { descriptor: cloneJSON(effect), outcome: "queued" });
  }
  function cancelEffect(effect, stateEventIndex) {
    validateModuleEffectsDescriptor(effect);
    const identity = validateToken(effect.arg);
    if (effect.kind !== "lifecycle.cancel") throw new TypeError("fixture request must use the Go request path");
    const item = effectItems.get(effect.arg);
    if (!item || item.status !== "pending" && item.status !== "queued") {
      throw new TypeError(`Go cancellation targets a non-pending transport request: ${effect.arg}`);
    }
    item.status = "cancelled";
    item.stateEventIndex = stateEventIndex;
    const cancelCorrelation = nextEffectCorrelation();
    item.cancelCorrelation = cancelCorrelation;
    lifecycle("go-cancel-effect", { stateEventIndex, token: item.token, key: item.key, generation: item.generation,
      correlation: cloneJSON(cancelCorrelation), targetCorrelation: cloneJSON(item.correlation), descriptor: cloneJSON(effect), pendingAfter: false });
    lifecycle("transport-cancel-call", { stateEventIndex, token: item.token, key: item.key, generation: item.generation,
      correlation: cloneJSON(item.correlation), cancelCorrelation: cloneJSON(cancelCorrelation), retiredBeforeCall: true });
    const cancelled = noThenable(transport.cancel(item.token, item.correlation), "transport.cancel()");
    lifecycle("transport-cancel", { stateEventIndex, token: item.token, key: item.key, generation: item.generation,
      correlation: cloneJSON(item.correlation), cancelCorrelation: cloneJSON(cancelCorrelation), outcome: cancelled === false ? "already-retired" : "cancelled" });
    recordLedger("cancel", item, { correlation: cloneJSON(cancelCorrelation), targetCorrelation: cloneJSON(item.correlation),
      descriptor: cloneJSON(effect), outcome: cancelled === false ? "already-retired" : "cancelled" });
  }
  function acceptEffects(effects, stateEventIndex) {
    for (const effect of effects) {
      if (effect.kind === "fixture.request") startEffect(effect, stateEventIndex);
      else if (effect.kind === "lifecycle.cancel") cancelEffect(effect, stateEventIndex);
      else validateModuleEffectsDescriptor(effect);
    }
  }
  function completeChild(instance, message, source, item = null) {
    if (!active || failed || children.get(instance.slot.key) !== instance || instance.slot.generation !== item?.generation && item !== null) {
      return { accepted: false, stale: true, error: "child generation is no longer live" };
    }
    const result = noThenable(childBound.Update(instance.state, message), "child.Update(complete)");
    if (!Array.isArray(result) || result.length !== 2) throw new TypeError("child.Update must return [state,effects]");
    const [nextState, rawEffects] = result;
    counts.childUpdate += 1;
    logCall("child", "Update", instance.slot);
    instance.state = nextState;
    lifecycle("go-state-commit", { stateEventIndex: activeStateEventIndex ?? nextEventIndex, eventKind: "effect-reply",
      target: "child", key: instance.slot.key, generation: instance.slot.generation,
      mounted: instance.state.Mounted, pending: instance.state.Pending, token: instance.state.Token });
    acceptEffects(decodeEffectSlice(child, childBound, rawEffects, "child"), activeStateEventIndex ?? nextEventIndex);
    instance.publication = callPublication(instance);
    receivePublication(instance, instance.publication);
    return { accepted: true, source };
  }
  function normalizeReply(token, reply) {
    if (reply === undefined || reply === null) return { Name: "complete", Arg: token };
    return validateMessage(reply);
  }
  function deliverEffect(item, replyInput, source) {
    if (item.status !== "pending") {
      recordLedger("reply", item, { outcome: `ignored-${item.status}`, source, goCall: false });
      return { accepted: false, stale: true, outcome: `ignored-${item.status}`, error: `effect request is ${item.status}` };
    }
    const currentInstance = children.get(item.key);
    if (!active || failed || !currentInstance || currentInstance.lifetime !== item.lifetime || currentInstance.slot.generation !== item.generation) {
      recordLedger("reply", item, { outcome: "ignored-stale-generation", source, goCall: false });
      return { accepted: false, stale: true, outcome: "ignored-stale-generation", error: "child generation is no longer live" };
    }
    let message;
    try { message = normalizeReply(item.token, replyInput); }
    catch (error) {
      recordLedger("reply-rejected", item, { outcome: "malformed-reply", source, goCall: false, error: error.message });
      return { accepted: false, outcome: "malformed-reply", error: error.message };
    }
    if (message.Name !== item.effect.reply || message.Arg !== item.token) {
      recordLedger("reply-rejected", item, { outcome: "wrong-correlation", source, goCall: false, message: cloneJSON(message) });
      return { accepted: false, outcome: "wrong-correlation", error: "reply does not match the Go-declared effect tuple" };
    }
    if (busy || startingEffects) {
      queueMicrotask(() => deliverEffect(item, message, source));
      return { accepted: false, queued: true, error: "reply queued until the Go commit completes" };
    }
    const eventIndex = nextEventIndex++;
    busy = true;
    activeStateEventIndex = eventIndex;
    try {
      const result = completeChild(currentInstance, message, source, item);
      if (!result.accepted) {
        recordLedger("reply", item, { stateEventIndex: eventIndex, outcome: "rejected-stale", source, goCall: false });
        return result;
      }
      makeViews();
      renderAll();
      item.status = "delivered";
      lifecycle("renderer-commit", { stateEventIndex: eventIndex, eventKind: "effect-reply", rendered: true,
        pendingGo: committedPendingGo() });
      events.push({ eventIndex, kind: "effect-reply", target: "child", key: item.key, generation: item.generation,
        action: null, message: cloneJSON(message), accepted: true, suppressed: false, stale: false });
      lifecycle("go-commit-render", { stateEventIndex: eventIndex, eventKind: "effect-reply", rendered: true,
        pendingGo: committedPendingGo(), requestToken: item.token });
      recordLedger("reply", item, { stateEventIndex: eventIndex, outcome: "accepted", source, goCall: true, message: cloneJSON(message) });
      return { accepted: true, outcome: "accepted", token: item.token, eventIndex };
    } catch (error) {
      reportFailure(error);
      recordLedger("reply", item, { stateEventIndex: eventIndex, outcome: "failed", source, goCall: true, error: failed.message });
      return { accepted: false, outcome: "failed", error: failed.message };
    } finally { busy = false; activeStateEventIndex = null; }
  }
  function startQueued() {
    if (!queuedStarts.length) return;
    const batch = queuedStarts.splice(0);
    startingEffects = true;
    try {
      for (const item of batch) {
        if (item.status !== "queued") continue;
        item.status = "pending";
        try {
          const timelineStart = lifecycle("transport-start", { stateEventIndex: item.stateEventIndex, token: item.token, key: item.key,
            generation: item.generation, correlation: cloneJSON(item.correlation), descriptor: cloneJSON(item.effect), goCalls: 0, outcome: "starting" });
          const effectStart = recordLedger("start", item, { outcome: "starting", goCall: false });
          const orderedStart = orderedLedger.at(-1);
          noThenable(transport.start({ dispatchId: item.correlation.dispatchId, effectIndex: item.correlation.effectIndex, effect: cloneJSON(item.effect) }, item.delivery), "transport.start()");
          timelineStart.outcome = "started";
          effectStart.outcome = "started";
          orderedStart.outcome = "started";
        } catch (error) {
          item.status = "failed";
          reportFailure(error);
          if (orderedLedger.at(-1)?.kind === "start") orderedLedger.at(-1).outcome = "failed";
          recordLedger("start", item, { outcome: "failed", goCall: false, error: failed.message });
        }
      }
    } finally { startingEffects = false; }
  }
  function mountChild(slot, input, preferred = null) {
    const root = preferred?.root ?? container.ownerDocument.createElement("div");
    root.setAttribute("data-gobi-module-root", `child-${slot.key}`);
    root.setAttribute("data-gobi-key", slot.key);
    root.setAttribute("data-gobi-generation", String(slot.generation));
    let renderer = preferred?.renderer ?? null;
    if (renderer === null) {
      let candidate = null;
      try {
        candidate = rendererFactory(options.renderers, backendName)({ container: root, onFailure: reportFailure });
        renderer = validateRenderer(candidate, `child ${slot.key}`, childBound.component);
      } catch (error) {
        try { candidate?.unmount?.(); } catch { /* keep admission error */ }
        throw error;
      }
    }
    counts.childInit += 1; logCall("child", "Init", slot);
    let state = noThenable(childBound.Init(), "child.Init");
    counts.childUpdate += 1; logCall("child", "Update(mount)", slot);
    const mounted = noThenable(childBound.Update(state, { Name: "mount", Arg: `${slot.key}:g${slot.generation}` }), "child.Update(mount)");
    if (!Array.isArray(mounted) || mounted.length !== 2) throw new TypeError("child.Update(mount) must return [state,effects]");
    state = mounted[0];
    const instance = { slot: { ...slot }, root, renderer, lifetime: {}, state, view: null, input: null, publication: null };
    children.set(slot.key, instance);
    acceptEffects(decodeEffectSlice(child, childBound, mounted[1], "child mount"), nextEventIndex);
    callInput(instance, input);
    instance.publication = callPublication(instance);
    receivePublication(instance, instance.publication);
    return instance;
  }
  function unmountChild(instance, eventIndex) {
    if (children.get(instance.slot.key) !== instance) return;
    const beforeState = moduleState(child, childBound, instance.state, `child ${instance.slot.key} before unmount`).state;
    const pendingBefore = pending().filter((item) => item.key === instance.slot.key && item.generation === instance.slot.generation).map((item) => item.token);
    counts.childUpdate += 1; logCall("child", "Update(unmount)", instance.slot);
    const result = noThenable(childBound.Update(instance.state, { Name: "unmount", Arg: `${instance.slot.key}:g${instance.slot.generation}` }), "child.Update(unmount)");
    if (!Array.isArray(result) || result.length !== 2) throw new TypeError("child.Update(unmount) must return [state,effects]");
    instance.state = result[0];
    const effects = decodeEffectSlice(child, childBound, result[1], "child unmount");
    const afterState = moduleState(child, childBound, instance.state, `child ${instance.slot.key} after unmount`).state;
    const pendingAfter = pending().filter((item) => item.key === instance.slot.key && item.generation === instance.slot.generation).map((item) => item.token);
    const retired = { stateEventIndex: eventIndex, key: instance.slot.key, generation: instance.slot.generation,
      before: beforeState, after: afterState, goPendingAfter: afterState.Pending, emittedEffects: cloneJSON(effects), pendingBefore, pendingAfter };
    retiredChildren.push(retired);
    lifecycle("go-update-unmount", { stateEventIndex: eventIndex, key: instance.slot.key, generation: instance.slot.generation,
      before: beforeState, after: afterState, emittedEffects: cloneJSON(effects), pendingBefore, pendingAfter });
    lifecycle("go-unmounted-commit", { stateEventIndex: eventIndex, key: instance.slot.key, generation: instance.slot.generation,
      mounted: afterState.Mounted, pending: afterState.Pending, token: afterState.Token });
    lifecycle("go-state-commit", { stateEventIndex: eventIndex, eventKind: "child-unmount", target: "child",
      key: instance.slot.key, generation: instance.slot.generation, mounted: afterState.Mounted,
      pending: afterState.Pending, token: afterState.Token });
    acceptEffects(effects, eventIndex);
    retired.cancellationCorrelations = effects.filter((effect) => effect.kind === "lifecycle.cancel").map((effect) => ({
      token: effect.arg, correlation: cloneJSON(effectItems.get(effect.arg)?.cancelCorrelation ?? null),
      targetCorrelation: cloneJSON(effectItems.get(effect.arg)?.correlation ?? null),
    }));
    retired.transportPendingAfter = pending().filter((item) => item.key === instance.slot.key && item.generation === instance.slot.generation).map((item) => item.token);
    // Go's unmount transition and cancellation have run before this renderer teardown.
    try { noThenable(instance.renderer.unmount(), "child.renderer.unmount()"); } catch (error) { reportFailure(error); }
    instance.root.remove?.();
    lifecycle("renderer-unmount", { stateEventIndex: eventIndex, key: instance.slot.key, generation: instance.slot.generation });
    children.delete(instance.slot.key);
  }
  function reconcile(nextSlots, input, eventIndex, propagateInput = true) {
    const desired = new Set(nextSlots.map((slot) => `${slot.key}:${slot.generation}`));
    for (const instance of [...children.values()]) {
      if (!desired.has(`${instance.slot.key}:${instance.slot.generation}`)) unmountChild(instance, eventIndex);
    }
    for (const slot of nextSlots) {
      let instance = children.get(slot.key);
      if (!instance || instance.slot.generation !== slot.generation) {
        if (instance) unmountChild(instance, eventIndex);
        instance = mountChild(slot, input);
      } else if (propagateInput && JSON.stringify(instance.input) !== JSON.stringify(input)) {
        callInput(instance, input);
        instance.publication = callPublication(instance);
        receivePublication(instance, instance.publication);
      }
    }
    slots = nextSlots.map((slot) => ({ ...slot }));
  }
  function parentCallbacks(epoch) {
    return {
      dispatch(action, message) { return dispatchAction("parent", null, null, action, message, epoch); },
      onStaleAction(action, reportedEpoch = null) { return staleCallback("parent", null, action, epoch, reportedEpoch); },
    };
  }
  function childCallbacks(instance, epoch, rendererOverride = instance.renderer) {
    return {
      dispatch(action, message) { return dispatchAction("child", instance.slot.key, instance.slot.generation, action, message, epoch, instance); },
      onStaleAction(action, reportedEpoch = null) { return staleCallback("child", instance, action, epoch, reportedEpoch); },
      rendererOverride,
    };
  }
  function updateRenderer(renderer, view, callbacks, label) {
    noThenable(renderer.update(view.raw, callbacks), `${label}.renderer.update()`);
  }
  function renderAll(epoch = rendererEpoch) {
    updateRenderer(parentRenderer, parentView, parentCallbacks(epoch), "parent");
    for (const slot of slots) {
      const instance = children.get(slot.key);
      if (instance) updateRenderer(instance.renderer, instance.view, childCallbacks(instance, epoch), `child ${slot.key}`);
    }
    const roots = [parentRoot, ...slots.map((slot) => children.get(slot.key)?.root).filter(Boolean)];
    container.replaceChildren(...roots);
  }
  function makeViews() {
    parentView = makeView(parent, parentBound, parentState, "parent");
    for (const slot of slots) {
      const instance = children.get(slot.key);
      if (instance) instance.view = makeView(child, childBound, instance.state, "child", instance);
    }
  }
  function projectSnapshot() {
    const parentData = moduleState(parent, parentBound, parentState, "parent");
    const parentDOM = rendererSnapshot(parentRenderer, "parent");
    const parentGo = parentData.state;
    const childrenOut = slots.map((slot) => {
      const instance = children.get(slot.key);
      const data = moduleState(child, childBound, instance.state, `child ${slot.key}`);
      const dom = rendererSnapshot(instance.renderer, `child ${slot.key}`);
      const state = data.state;
      return { key: slot.key, generation: slot.generation,
        input: instance.input ? { Step: instance.input.Step, Locked: instance.input.Locked, Revision: instance.input.Revision } : null,
        state, goState: state, encodedState: data.encoded, view: dom.view, dom: dom.dom };
    });
    const keyed = {
      a: { key: parentGo.A?.Key, generation: parentGo.A?.Generation, mounted: parentGo.A?.Mounted,
        publishedCount: parentGo.A?.PublishedCount, publishedRevision: parentGo.A?.PublishedRevision },
      b: { key: parentGo.B?.Key, generation: parentGo.B?.Generation, mounted: parentGo.B?.Mounted,
        publishedCount: parentGo.B?.PublishedCount, publishedRevision: parentGo.B?.PublishedRevision },
      first: parentGo.First, second: parentGo.Second, childCount: parentGo.ChildCount,
    };
    return { schema: SNAPSHOT_SCHEMA, backend: backendName, rendererEpoch,
      parent: { state: parentGo.Parent ?? parentGo, controllerState: keyed, goState: parentGo, encodedState: parentData.encoded,
        view: parentDOM.view, dom: parentDOM.dom },
      children: childrenOut, effectPending: pending(), failed: failed ? { name: failed.name, message: failed.message } : null };
  }
  function snapshot() { assertActive(); return cloneJSON(projectSnapshot()); }
  function pending() {
    return [...effectItems.values()].filter((item) => item.status === "pending" || item.status === "queued").map((item) => ({
      sequence: item.correlation.dispatchId, ...cloneJSON(item.correlation), token: item.token, key: item.key, generation: item.generation,
      effect: cloneJSON(item.effect), status: item.status, stateEventIndex: item.stateEventIndex,
    }));
  }
  function trace() {
    return cloneJSON({ schema: TRACE_SCHEMA, backend: backendName, rendererEpoch, parent: { componentID: parentBound.component.id, packagePath: parentBound.component.packagePath },
      child: { componentID: childBound.component.id, packagePath: childBound.component.packagePath },
      events, callOrder, callCounts: counts, effects: effectLedger, lifecycle: lifecycleLedger, ledger: orderedLedger, retiredChildren,
      pending: pending(), transport: transport.records?.() ?? [] });
  }
  function staleCallback(target, instance, actionInput, epoch, reportedEpoch) {
    let action = null;
    try { action = actionRecord(actionInput); } catch { /* stale callbacks do not reach Go */ }
    const eventIndex = nextEventIndex++;
    events.push({ eventIndex, kind: "stale-callback", target, key: instance?.slot.key ?? null, generation: instance?.slot.generation ?? null,
      action, message: null, accepted: false, suppressed: false, stale: true, callbackEpoch: epoch, rendererEpoch,
      reportedEpoch: Number.isSafeInteger(reportedEpoch) ? reportedEpoch : null });
    return { accepted: false, stale: true, eventIndex };
  }
  function dispatchAction(target, key, generation, actionInput, messageInput, epoch, capturedInstance = null) {
    if (!active || failed) return { accepted: false, error: "module host is not active" };
    if (busy) return { accepted: false, error: "reentrant module dispatch rejected" };
    let action;
    try { action = actionRecord(actionInput); } catch (error) { return { accepted: false, error: error.message }; }
    const currentInstance = target === "child" ? children.get(key) : null;
    const instance = target === "child" ? capturedInstance : null;
    if (epoch !== rendererEpoch || (target === "child" && (!instance || currentInstance !== instance || instance.slot.generation !== generation))) {
      return staleCallback(target, instance, action, epoch, null);
    }
    let resolved;
    try { resolved = resolveMessage(target === "parent" ? parentView : instance.view, action); }
    catch (error) { return { accepted: false, error: error.message }; }
    if (resolved.disabled || !resolved.message) {
      const eventIndex = nextEventIndex++;
      events.push({ eventIndex, kind: "disabled-action", target, key: instance?.slot.key ?? null, generation: instance?.slot.generation ?? null,
        action, message: null, accepted: true, suppressed: true, stale: false });
      return { accepted: true, suppressed: true, eventIndex, message: null };
    }
    let message;
    try { message = validateMessage(messageInput, resolved.message); }
    catch (error) { return { accepted: false, error: error.message }; }
    return applyMessage(target, instance, action, message, "renderer-action");
  }
  function applyMessage(target, childInstance, action, message, kind) {
    if (!active || failed) return { accepted: false, error: "module host is not active" };
    if (busy) return { accepted: false, error: "reentrant module dispatch rejected" };
    const eventIndex = nextEventIndex++;
    busy = true;
    activeStateEventIndex = eventIndex;
    try {
      if (target === "parent") {
        counts.parentUpdate += 1; logCall("parent", "Update");
        const result = noThenable(parentBound.Update(parentState, message), "parent.Update");
        if (!Array.isArray(result) || result.length !== 2) throw new TypeError("parent.Update must return [state,effects]");
        if (sliceValues(result[1], "parent.Update effects").length !== 0) throw new TypeError("keyed parent emitted effects outside the frozen fixture profile");
        parentState = result[0];
        lifecycle("go-state-commit", { stateEventIndex: eventIndex, eventKind: kind, target: "parent" });
        const input = callOutput();
        reconcile(keyedChildren(), input, eventIndex, true);
      } else {
        const instance = childInstance;
        if (!instance || children.get(instance.slot.key) !== instance) return { accepted: false, stale: true, error: "child generation is no longer current" };
        counts.childUpdate += 1; logCall("child", "Update", instance.slot);
        const result = noThenable(childBound.Update(instance.state, message), "child.Update");
        if (!Array.isArray(result) || result.length !== 2) throw new TypeError("child.Update must return [state,effects]");
        instance.state = result[0];
        lifecycle("go-state-commit", { stateEventIndex: eventIndex, eventKind: kind, target: "child",
          key: instance.slot.key, generation: instance.slot.generation, mounted: instance.state.Mounted,
          pending: instance.state.Pending, token: instance.state.Token });
        acceptEffects(decodeEffectSlice(child, childBound, result[1], "child"), eventIndex);
        instance.publication = callPublication(instance);
        receivePublication(instance, instance.publication);
      }
      makeViews();
      renderAll();
      lifecycle("renderer-commit", { stateEventIndex: eventIndex, eventKind: kind, rendered: true,
        pendingGo: committedPendingGo() });
      const event = eventMessage(target, childInstance, action, message, { accepted: true }, kind, eventIndex);
      events.push(event);
      lifecycle("go-commit-render", { stateEventIndex: eventIndex, eventKind: kind, rendered: true, pendingGo: committedPendingGo() });
      startQueued();
      return { accepted: true, eventIndex, message: cloneJSON(message) };
    } catch (error) {
      reportFailure(error);
      events.push({ eventIndex, kind: "failed-dispatch", target, key: childInstance?.slot.key ?? null,
        generation: childInstance?.slot.generation ?? null, action: action ? cloneJSON(action) : null, message: cloneJSON(message),
        accepted: false, suppressed: false, stale: false, error: failed.message });
      return { accepted: false, eventIndex, error: failed.message };
    } finally { busy = false; activeStateEventIndex = null; }
  }
  function dispatchGoMessage(input) {
    const requestedTarget = record(input) ? Object.getOwnPropertyDescriptor(input, "target")?.value : null;
    if (requestedTarget !== "parent" && requestedTarget !== "child") throw new TypeError("dispatch target must be parent or child");
    if (requestedTarget === "child") {
      const identity = exactRecord(input, ["target", "key", "generation", "message"], "child dispatch options");
      const message = validateMessage(identity.message);
      const instance = children.get(identity.key);
      if (!instance || instance.slot.generation !== identity.generation) return { accepted: false, stale: true, error: "key generation is not current" };
      if (["mount", "unmount", "complete"].includes(message.Name)) return { accepted: false, error: `${message.Name} is host-owned lifecycle messaging` };
      return applyMessage("child", instance, null, message, "go-message");
    }
    const value = exactRecord(input, ["target", "message"], "parent dispatch options");
    const message = validateMessage(value.message);
    if (["mount", "unmount", "complete"].includes(message.Name)) return { accepted: false, error: `${message.Name} is host-owned lifecycle messaging` };
    return applyMessage("parent", null, null, message, "go-message");
  }
  function click(optionsInput) {
    const requestedTarget = record(optionsInput) ? Object.getOwnPropertyDescriptor(optionsInput, "target")?.value : null;
    const options = exactRecord(optionsInput, ["target", "path", "event", "value", ...(requestedTarget === "child" ? ["key", "generation"] : [])], "click options");
    if (options.target !== "parent" && options.target !== "child") return { accepted: false, error: "click target must be parent or child" };
    const action = actionRecord({ path: options.path, event: options.event, value: options.value });
    const instance = options.target === "child" ? children.get(options.key) : null;
    if (options.target === "child" && (!instance || instance.slot.generation !== options.generation)) return { accepted: false, stale: true, error: "key generation is not current" };
    const view = options.target === "parent" ? parentView : instance?.view;
    if (!view) return { accepted: false, error: "click target is not mounted" };
    let resolved;
    try { resolved = resolveMessage(view, action); } catch (error) { return { accepted: false, error: error.message }; }
    if (resolved.disabled || !resolved.message) {
      const eventIndex = nextEventIndex++;
      events.push({ eventIndex, kind: "disabled-action", target: options.target, key: instance?.slot.key ?? null,
        generation: instance?.slot.generation ?? null, action, message: null, accepted: true, suppressed: true, stale: false });
      return { accepted: true, suppressed: true, eventIndex, message: null };
    }
    const result = applyMessage(options.target, instance, action, resolved.message, "direct-click");
    return { ...result, message: cloneJSON(resolved.message) };
  }
  function elementAtPath(target, key, path) {
    const root = target === "parent" ? parentRoot : target === "child" ? children.get(key)?.root : null;
    if (!root) return null;
    const indexes = normalizePath(path);
    let node = root.firstElementChild ?? root.childNodes?.[0] ?? null;
    for (const index of indexes) node = node?.childNodes?.[index] ?? null;
    return node;
  }
  function replaceBackend(to) {
    assertActive();
    if (busy) throw new TypeError("renderer replacement is not reentrant");
    const nextFactory = rendererFactory(options.renderers, to);
    if (to === backendName) return snapshot();
    const oldEpoch = rendererEpoch;
    const nextEpoch = oldEpoch + 1;
    if (!Number.isSafeInteger(nextEpoch)) throw new TypeError("renderer epoch exceeded the safe integer range");
    const oldBackend = backendName;
    const nextParentRoot = container.ownerDocument.createElement("div");
    nextParentRoot.setAttribute("data-gobi-module-root", "parent");
    let nextParentRenderer = null;
    const candidates = new Map();
    const candidateChildren = new Map();
    let committed = false;
    try {
      nextParentRenderer = validateRenderer(nextFactory({ container: nextParentRoot, onFailure: reportFailure }), "candidate parent", parentBound.component);
      for (const slot of slots) {
        const root = container.ownerDocument.createElement("div");
        root.setAttribute("data-gobi-module-root", `child-${slot.key}`);
        root.setAttribute("data-gobi-key", slot.key);
        root.setAttribute("data-gobi-generation", String(slot.generation));
        const renderer = validateRenderer(nextFactory({ container: root, onFailure: reportFailure }), `candidate child ${slot.key}`, childBound.component);
        candidates.set(slot.key, { root, renderer });
        const previous = children.get(slot.key);
        candidateChildren.set(slot.key, { ...previous, root, renderer });
      }
      updateRenderer(nextParentRenderer, parentView, parentCallbacks(nextEpoch), "candidate parent");
      for (const slot of slots) {
        const instance = candidateChildren.get(slot.key);
        updateRenderer(instance.renderer, instance.view, childCallbacks(instance, nextEpoch, instance.renderer), `candidate child ${slot.key}`);
      }
      const previousParentRenderer = parentRenderer;
      const previousChildren = children;
      container.replaceChildren(nextParentRoot, ...slots.map((slot) => candidateChildren.get(slot.key).root));
      parentRoot = nextParentRoot; parentRenderer = nextParentRenderer; backendName = to; rendererEpoch = nextEpoch;
      children = candidateChildren;
      committed = true;
      try { noThenable(previousParentRenderer.unmount(), "old parent renderer.unmount()"); } catch (error) { reportFailure(error); }
      for (const instance of previousChildren.values()) { try { noThenable(instance.renderer.unmount(), "old child renderer.unmount()"); } catch (error) { reportFailure(error); } }
      const eventIndex = nextEventIndex++;
      events.push({ eventIndex, kind: "renderer-swap", target: null, key: null, generation: null, action: null, message: null,
        accepted: true, suppressed: false, stale: false, from: oldBackend, to, callbackEpoch: oldEpoch, rendererEpoch: nextEpoch });
      return snapshot();
    } catch (error) {
      if (!committed) {
        try { nextParentRenderer?.unmount(); } catch { /* preserve candidate error */ }
        for (const candidate of candidates.values()) { try { candidate.renderer.unmount(); } catch { /* preserve candidate error */ } }
        nextParentRoot.remove?.();
        throw error;
      }
      reportFailure(error); throw failed;
    }
  }
  function unmount() {
    if (!active) return false;
    if (busy) throw new TypeError("host unmount is not reentrant");
    const eventIndex = nextEventIndex++;
    busy = true;
    activeStateEventIndex = eventIndex;
    try {
      for (const instance of [...children.values()]) unmountChild(instance, eventIndex);
      active = false;
      rendererEpoch += 1;
      try { noThenable(parentRenderer.unmount(), "parent.renderer.unmount()"); } catch (error) { reportFailure(error); }
      parentRoot.remove?.();
      events.push({ eventIndex, kind: "host-unmount", target: null, key: null, generation: null,
        action: null, message: null, accepted: true, suppressed: false, stale: false, rendererEpoch });
      startQueued();
      return failed === null;
    } finally { busy = false; activeStateEventIndex = null; }
  }
  function flush() { return Promise.resolve().then(() => undefined); }

  const initialCandidates = [];
  try {
    const initialParentCandidate = factory({ container: parentRoot, onFailure: reportFailure });
    parentRenderer = validateRenderer(initialParentCandidate, "parent", parentBound.component);
    // Renderer admission is complete before any application role is invoked.
    const stagedChildren = ["a", "b"].map((key) => {
      const root = container.ownerDocument.createElement("div");
      root.setAttribute("data-gobi-module-root", `child-${key}`);
      root.setAttribute("data-gobi-key", key);
      const renderer = validateRenderer(factory({ container: root, onFailure: reportFailure }), `child ${key}`, childBound.component);
      initialCandidates.push(renderer);
      return { key, root, renderer };
    });
    counts.parentInit += 1; logCall("parent", "Init"); parentState = noThenable(parentBound.Init(), "parent.Init");
    const initialSlots = keyedChildren();
    if (JSON.stringify(initialSlots.map((slot) => slot.key)) !== JSON.stringify(["a", "b"])) throw new TypeError("initial keyed module children must be ordered a,b");
    const input = callOutput();
    for (const slot of initialSlots) {
      const candidate = stagedChildren.find((item) => item.key === slot.key);
      mountChild(slot, input, candidate);
    }
    slots = initialSlots.map((slot) => ({ ...slot }));
    makeViews();
    renderAll();
    startQueued();
    const initialIndex = nextEventIndex++;
    events.push({ eventIndex: initialIndex, kind: "initial-mount", target: null, key: null, generation: null,
      action: null, message: null, accepted: true, suppressed: false, stale: false });
    return {
      snapshot, trace, click, dispatch: dispatchGoMessage, replaceBackend, unmount, flush, settled: flush,
      dispatchParent(message) { return dispatchGoMessage({ target: "parent", message }); },
      dispatchChild(key, generation, message) { return dispatchGoMessage({ target: "child", key, generation, message }); },
      pending, effectRecords: () => cloneJSON(effectLedger), transportLog: () => transport.records?.() ?? [],
      ledger: () => cloneJSON(orderedLedger),
      deliver(token, reply = undefined) {
        if (typeof transport.deliver !== "function") return { accepted: false, error: "configured transport does not expose manual delivery" };
        return transport.deliver(token, reply);
      },
      forceDeliverRetained(token, reply = undefined) {
        if (typeof transport.forceDeliverRetained !== "function") return { accepted: false, error: "configured transport does not retain manual callbacks" };
        return transport.forceDeliverRetained(token, reply);
      },
      elementAtPath,
      failure: () => failed ? { name: failed.name, message: failed.message } : null,
      isUnmounted: () => !active,
      mountedHandles: () => ({ parent: { root: parentRoot, renderer: parentRenderer }, children: slots.map((slot) => {
        const instance = children.get(slot.key); return { key: slot.key, generation: slot.generation, root: instance?.root, renderer: instance?.renderer };
      }) }),
    };
  } catch (error) {
    active = false;
    try { parentRenderer?.unmount(); } catch { /* preserve admission error */ }
    for (const renderer of initialCandidates) { try { renderer.unmount(); } catch { /* preserve admission error */ } }
    parentRoot.remove?.();
    for (const instance of children.values()) { try { instance.renderer.unmount(); } catch { /* preserve initial error */ } instance.root.remove?.(); }
    throw error;
  }
}
