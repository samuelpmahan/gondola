import { bindCompiledComponent } from "../../compiled-frontend/frontend/react/bindings.mjs";
import { assertInputRecord, assertPublicationRecord, validateModulePair } from "../abi/validate.mjs";

const TRACE_SCHEMA = "gobi.module-pair-trace/v1";
const SNAPSHOT_SCHEMA = "gobi.module-pair-snapshot/v1";
const PARENT_BRIDGE_KEYS = ["output", "receive"];
const CHILD_BRIDGE_KEYS = ["input", "publication"];

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ownData(value, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value") || "get" in descriptor || "set" in descriptor) {
    throw new TypeError(`${label}.${key} must be an own data property`);
  }
  return descriptor.value;
}

function exactRecord(value, keys, label) {
  if (!record(value)) throw new TypeError(`${label} must be an object`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError(`${label} must have a plain object prototype`);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) throw new TypeError(`${label} has symbol properties`);
  const expected = [...keys].sort();
  const sorted = [...actual].sort();
  if (sorted.length !== expected.length || sorted.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} must contain exactly ${expected.join(", ")}`);
  }
  const result = Object.create(null);
  for (const key of expected) result[key] = ownData(value, key, label);
  return result;
}

function optionRecord(value, requiredKeys, optionalKeys, label) {
  if (!record(value)) throw new TypeError(`${label} must be an object`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError(`${label} must have a plain object prototype`);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new TypeError(`${label} has unknown or symbol properties`);
  }
  for (const key of requiredKeys) if (!actual.includes(key)) throw new TypeError(`${label}.${key} is required`);
  const copy = Object.create(null);
  for (const key of actual) copy[key] = ownData(value, key, label);
  return copy;
}

function noThenable(value, label) {
  if (value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function") {
    throw new TypeError(`${label} must complete synchronously`);
  }
  return value;
}

function cloneJSON(value, path = "trace") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => cloneJSON(item, `${path}[${index}]`));
  if (!record(value)) throw new TypeError(`${path} contains an unsupported value`);
  const clone = {};
  for (const key of Object.keys(value)) {
    const field = ownData(value, key, path);
    if (field === undefined) throw new TypeError(`${path}.${key} is undefined`);
    clone[key] = cloneJSON(field, `${path}.${key}`);
  }
  return clone;
}

function snapshotMetadata(value, path = "metadata") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string") || ownKeys.length !== value.length + 1 || !ownKeys.includes("length")) {
      throw new TypeError(`${path} must be a dense array without extra properties`);
    }
    const copy = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) {
        throw new TypeError(`${path}[${index}] must be an own data element`);
      }
      copy[index] = snapshotMetadata(descriptor.value, `${path}[${index}]`);
    }
    return Object.freeze(copy);
  }
  if (!record(value)) throw new TypeError(`${path} contains a non-JSON value`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError(`${path} must be a plain object`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError(`${path} has symbol properties`);
  const copy = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) {
      throw new TypeError(`${path}.${key} must be an own data property`);
    }
    copy[key] = snapshotMetadata(descriptor.value, `${path}.${key}`);
  }
  return Object.freeze(copy);
}

function required(value, key, label) {
  if (value === null || value === undefined || !Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is missing`);
  return ownData(value, key, label);
}

function sliceValues(value, label) {
  if (value === null) return [];
  if (Array.isArray(value)) return value.slice();
  if (!record(value)) throw new TypeError(`${label} must be a native array or GoScript slice`);
  const backing = required(value, "backing", label);
  const offset = required(value, "offset", label);
  const length = required(value, "length", label);
  const capacity = required(value, "capacity", label);
  if (!Array.isArray(backing) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      !Number.isSafeInteger(capacity) || offset < 0 || length < 0 || capacity < length || offset + capacity > backing.length) {
    throw new TypeError(`${label} has invalid GoScript slice bounds`);
  }
  return backing.slice(offset, offset + length);
}

function componentEntry(side, label) {
  if (typeof side.componentId !== "string" || side.componentId === "") {
    throw new TypeError(`${label}.componentId must be a non-empty string`);
  }
  if (typeof side.encoder?.gobiEncodeState !== "function") throw new TypeError(`${label}.encoder must export gobiEncodeState`);
  const bound = bindCompiledComponent(side.module, side.componentId);
  if (bound.compiled.appIR.components.length !== 1) throw new TypeError(`${label} must contain exactly one component`);
  return bound;
}

function bridgeEntry(bridges, expected, label) {
  if (!record(bridges)) throw new TypeError(`${label}.bridges must be an object`);
  const keys = Reflect.ownKeys(bridges);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError(`${label}.bridges has symbol properties`);
  const actual = [...keys].sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label}.bridges must contain exactly ${wanted.join(", ")}`);
  }
  const result = Object.create(null);
  for (const key of wanted) {
    const value = ownData(bridges, key, `${label}.bridges`);
    if (typeof value !== "function") throw new TypeError(`${label}.bridges.${key} must be callable`);
    result[key] = value;
  }
  return result;
}

function moduleInput(side, label, expectedBridges) {
  if (!record(side)) throw new TypeError(`${label} module input must be an object`);
  const expected = ["module", "bridges", "encoder", "descriptor", "descriptorBytes", "artifactBytes", "componentId"];
  const fields = exactRecord(side, expected, `${label} module input`);
  if (!record(fields.module)) throw new TypeError(`${label}.module must be gobiCompiled`);
  const compiledFields = exactRecord(fields.module, ["schema", "appIR", "symbols"], `${label}.module`);
  const appIR = snapshotMetadata(compiledFields.appIR, `${label}.appIR`);
  const sourceSymbols = compiledFields.symbols;
  if (!record(sourceSymbols)) throw new TypeError(`${label}.module.symbols must be an object`);
  const symbolKeys = Reflect.ownKeys(sourceSymbols);
  if (symbolKeys.some((key) => typeof key !== "string")) throw new TypeError(`${label}.module.symbols has symbol keys`);
  const symbols = {};
  for (const key of symbolKeys) {
    const fn = ownData(sourceSymbols, key, `${label}.module.symbols`);
    if (typeof fn !== "function") throw new TypeError(`${label}.module.symbols.${key} must be callable`);
    symbols[key] = fn;
  }
  Object.freeze(symbols);
  fields.module = Object.freeze({ schema: compiledFields.schema, appIR, symbols });
  if (!record(fields.descriptor)) throw new TypeError(`${label}.descriptor must be a module ABI descriptor`);
  fields.descriptor = snapshotMetadata(fields.descriptor, `${label}.descriptor`);
  if (!(fields.descriptorBytes instanceof Uint8Array) || fields.descriptorBytes.byteLength === 0) {
    throw new TypeError(`${label}.descriptorBytes must contain exact nonempty module-abi.json bytes`);
  }
  fields.descriptorBytes = new Uint8Array(fields.descriptorBytes);
  fields.bridges = bridgeEntry(fields.bridges, expectedBridges, label);
  if (!record(fields.encoder)) throw new TypeError(`${label}.encoder must export gobiEncodeState`);
  const encodeDescriptor = Object.getOwnPropertyDescriptor(fields.encoder, "gobiEncodeState");
  if (!encodeDescriptor || !Object.hasOwn(encodeDescriptor, "value") || typeof encodeDescriptor.value !== "function") {
    throw new TypeError(`${label}.encoder must have an own gobiEncodeState function`);
  }
  fields.encoder = Object.freeze({ gobiEncodeState: encodeDescriptor.value });
  if (typeof fields.componentId !== "string" || fields.componentId === "") throw new TypeError(`${label}.componentId must be a non-empty string`);
  if (!(fields.artifactBytes instanceof Map) && !record(fields.artifactBytes)) {
    throw new TypeError(`${label}.artifactBytes must be a Map or path record`);
  }
  const copiedArtifacts = new Map();
  let artifactEntries;
  if (fields.artifactBytes instanceof Map) {
    artifactEntries = [...fields.artifactBytes.entries()];
  } else {
    const keys = Reflect.ownKeys(fields.artifactBytes);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError(`${label}.artifactBytes has symbol keys`);
    artifactEntries = keys.map((key) => [key, ownData(fields.artifactBytes, key, `${label}.artifactBytes`)]);
  }
  for (const [path, bytes] of artifactEntries) {
    if (typeof path !== "string" || !(bytes instanceof Uint8Array)) throw new TypeError(`${label}.artifactBytes must map paths to Uint8Array values`);
    copiedArtifacts.set(path, new Uint8Array(bytes));
  }
  fields.artifactBytes = copiedArtifacts;
  return fields;
}

function validateEmptyEffects(side, effects, bound, label) {
  if (effects === null || effects === undefined) return;
  const declared = bound.compiled.appIR.symbols.find((symbol) => symbol.id === bound.component.update);
  if (!declared || declared.signature.results.length !== 2 || typeof declared.signature.results[1] !== "string") {
    throw new TypeError(`${label} Update must declare its effects slice result`);
  }
  const effectSliceType = declared.signature.results[1];
  const encoded = noThenable(side.encoder.gobiEncodeState(effects, effectSliceType), `${label} effect encoding`);
  const effectSlice = exactRecord(encoded, ["typeId", "kind", "isNil", "items"], `${label} encoded effects`);
  if (effectSlice.typeId !== effectSliceType || effectSlice.kind !== "slice" || typeof effectSlice.isNil !== "boolean" ||
      !Array.isArray(effectSlice.items) || (effectSlice.isNil && effectSlice.items.length !== 0)) {
    throw new TypeError(`${label} Update effects are not a valid encoded slice`);
  }
  if (effectSlice.items.length !== 0) throw new TypeError(`${label} emitted effects outside the effect-free module profile`);
}

function snapshotState(side, bound, state, label) {
  const encoded = noThenable(side.encoder.gobiEncodeState(state, bound.component.stateType), `${label} state encoding`);
  if (!record(encoded) || encoded.typeId !== bound.component.stateType || typeof encoded.kind !== "string") {
    throw new TypeError(`${label} gobiEncodeState returned a malformed state Value`);
  }
  return cloneJSON(encoded, `${label} state`);
}

function viewParts(raw, label) {
  if (!record(raw)) throw new TypeError(`${label} View returned a non-object`);
  const hasTree = Object.hasOwn(raw, "Tree");
  const hasBindings = Object.hasOwn(raw, "Bindings");
  if (hasTree !== hasBindings) throw new TypeError(`${label} View must provide both Tree and Bindings`);
  const tree = hasTree ? ownData(raw, "Tree", `${label} View`) : raw;
  const bindings = hasBindings ? sliceValues(ownData(raw, "Bindings", `${label} View`), `${label} View.Bindings`) : [];
  return { raw, tree, bindings };
}

function normalizePath(path) {
  if (path === "") return [];
  if (typeof path !== "string" || !/^(0|[1-9][0-9]*)(\/(0|[1-9][0-9]*))*$/.test(path)) {
    throw new TypeError("Action.path must be a canonical slash-separated node path");
  }
  return path.split("/").map((part) => {
    const index = Number(part);
    if (!Number.isSafeInteger(index)) throw new TypeError("Action.path index is outside the safe integer range");
    return index;
  });
}

function resolveCurrentMessage(view, action, label) {
  let node = view.tree;
  for (const index of normalizePath(action.path)) {
    const kids = sliceValues(required(node, "Kids", `${label} View node`), `${label} View node.Kids`);
    node = kids[index] ?? null;
    if (node === null) return { disabled: false, message: null };
  }
  if (!record(node)) throw new TypeError(`${label} View node at ${action.path} is malformed`);
  const attrs = sliceValues(required(node, "Attrs", `${label} View node`), `${label} View node.Attrs`);
  if (attrs.some((attr) => required(attr, "Name", "View attribute") === "disabled" && required(attr, "Flag", "View attribute") === true)) {
    return { disabled: true, message: null };
  }
  const candidates = [];
  for (const binding of view.bindings) {
    if (required(binding, "Path", "View binding") === action.path && required(binding, "Event", "View binding") === action.event) {
      candidates.push({ Name: required(binding, "Message", "View binding"), Arg: action.value });
    }
  }
  const handlers = sliceValues(required(node, "On", `${label} View node`), `${label} View node.On`);
  for (const handler of handlers) {
    if (required(handler, "Event", "View handler") === action.event) {
      candidates.push({ Name: required(handler, "Message", "View handler"), Arg: required(handler, "Arg", "View handler") });
    }
  }
  if (candidates.length > 1) throw new TypeError(`multiple Gobi handlers target ${action.path}/${action.event}`);
  return { disabled: false, message: candidates[0] ?? null };
}

function validateMessage(message, expected, label) {
  const actual = exactRecord(message, ["Name", "Arg"], label);
  if (typeof actual.Name !== "string" || typeof actual.Arg !== "string" ||
      actual.Name !== expected.Name || actual.Arg !== expected.Arg) {
    throw new TypeError(`${label} does not match the current Go View handler`);
  }
  return actual;
}

function actionRecord(action) {
  const actual = exactRecord(action, ["path", "event", "value"], "Action");
  if (![actual.path, actual.event, actual.value].every((field) => typeof field === "string")) {
    throw new TypeError("Action fields must be strings");
  }
  normalizePath(actual.path);
  return actual;
}

function requireRenderer(renderer, label, component) {
  if (!record(renderer)) throw new TypeError(`${label} renderer factory must return an object`);
  for (const name of ["update", "viewRecord", "domSnapshot", "unmount"]) {
    if (typeof renderer[name] !== "function") throw new TypeError(`${label} renderer must provide ${name}()`);
  }
  const caps = renderer.viewCapabilities;
  const supported = new Set(["view.node", "binding.value", "binding.checked"]);
  if (!Array.isArray(caps) || caps.some((capability) => typeof capability !== "string" || !supported.has(capability)) ||
      new Set(caps).size !== caps.length) {
    throw new TypeError(`${label} renderer must declare view capabilities`);
  }
  const required = component.capabilities.filter((capability) =>
    capability === "view.node" || capability === "binding.value" || capability === "binding.checked");
  const missing = required.filter((capability) => !caps.includes(capability));
  if (missing.length !== 0) throw new TypeError(`${label} renderer is missing capabilities ${missing.join(", ")}`);
  return renderer;
}

function rendererFactory(renderers, backend) {
  if (typeof backend !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(backend)) {
    throw new TypeError("backend must be a registered safe renderer ID");
  }
  if (!Object.hasOwn(renderers, backend) || typeof renderers[backend] !== "function") {
    throw new TypeError(`backend ${JSON.stringify(backend)} is not registered`);
  }
  return renderers[backend];
}

function captureRendererFactories(renderers) {
  if (!record(renderers)) throw new TypeError("renderers must be an own-data factory registry");
  const keys = Reflect.ownKeys(renderers);
  if (keys.length === 0 || keys.some((key) => typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key))) {
    throw new TypeError("renderers must have safe non-empty renderer IDs");
  }
  const factories = Object.create(null);
  for (const key of keys) {
    const factory = ownData(renderers, key, "renderers");
    if (typeof factory !== "function") throw new TypeError(`renderers.${key} must be a lazy factory`);
    factories[key] = factory;
  }
  return Object.freeze(factories);
}

function updateState(side, bound, state, message, label, counts, logCall) {
  counts[`${label}Update`] += 1;
  logCall(label, "Update");
  const result = noThenable(bound.Update(state, message), `${label}.Update`);
  if (!Array.isArray(result) || result.length !== 2) throw new TypeError(`${label} Update must return [state,effects]`);
  validateEmptyEffects(side, result[1], bound, label);
  return result[0];
}

function rendererSnapshot(renderer, name) {
  const view = noThenable(renderer.viewRecord(), `${name}.renderer.viewRecord()`);
  const dom = noThenable(renderer.domSnapshot(), `${name}.renderer.domSnapshot()`);
  return { view: cloneJSON(view, `${name} view`), dom: cloneJSON(dom, `${name} DOM`) };
}

/**
 * Mount exactly one separately compiled parent and child behind a primitive,
 * validated bridge ABI. The host routes records; all application decisions
 * remain in the generated Go roles.
 */
export async function mountCompiledModulePair(options) {
  const mountOptions = optionRecord(options,
    ["parent", "child", "renderers", "backend", "container"], ["onFailure"], "mount options");
  const parent = moduleInput(mountOptions.parent, "parent", PARENT_BRIDGE_KEYS);
  const child = moduleInput(mountOptions.child, "child", CHILD_BRIDGE_KEYS);
  const renderers = captureRendererFactories(mountOptions.renderers);
  const backend = mountOptions.backend;
  const factory = rendererFactory(renderers, backend);
  const onFailure = mountOptions.onFailure ?? null;
  if (onFailure !== null && typeof onFailure !== "function") throw new TypeError("onFailure must be a function or null");

  // ABI admission deliberately precedes component binding, Init/View, factory calls,
  // root creation and any writes to the caller-owned DOM container.
  const admitted = await validateModulePair({
    parent: { descriptor: parent.descriptor, descriptorBytes: parent.descriptorBytes, appIR: parent.module.appIR, artifactBytes: parent.artifactBytes },
    child: { descriptor: child.descriptor, descriptorBytes: child.descriptorBytes, appIR: child.module.appIR, artifactBytes: child.artifactBytes },
  });
  if (!record(admitted) || !record(admitted.parent) || !record(admitted.child)) {
    throw new TypeError("module ABI pair validator returned no admitted snapshots");
  }
  for (const [side, validated, label] of [[parent, admitted.parent, "parent"], [child, admitted.child, "child"]]) {
    if (!record(validated.descriptor) || !record(validated.appIR) || !Array.isArray(validated.artifacts)) {
      throw new TypeError(`module ABI validator returned an incomplete ${label} snapshot`);
    }
    side.descriptor = validated.descriptor;
    side.module = Object.freeze({ ...side.module, appIR: validated.appIR });
  }

  const parentBound = componentEntry(parent, "parent");
  const childBound = componentEntry(child, "child");
  const parentBridges = parent.bridges;
  const childBridges = child.bridges;
  const container = mountOptions.container;
  if (!container || container.nodeType !== 1 || !container.ownerDocument || typeof container.replaceChildren !== "function") {
    throw new TypeError("container must be an empty DOM element");
  }
  if (container.childNodes.length !== 0) throw new TypeError("container must be empty before mounting a module pair");

  const counts = {
    parentInit: 0, childInit: 0, parentUpdate: 0, childUpdate: 0, parentView: 0, childView: 0,
    output: 0, input: 0, publication: 0, receive: 0,
  };
  const bridgeCalls = [];
  const callOrder = [];
  const events = [];
  const steps = [];
  const checkpoints = [];
  let eventIndex = 0;
  let nextDispatch = 1;
  let generation = 1;
  let currentBackend = backend;
  let active = true;
  let failed = null;
  let busy = false;
  let parentState;
  let childState;
  let parentView;
  let childView;
  let parentRenderer;
  let childRenderer;
  let parentRoot;
  let childRoot;

  function logCall(owner, role) {
    callOrder.push({ sequence: callOrder.length, owner, role });
  }

  function recordBridge(role, owner, fn, state, argument = undefined) {
    counts[role] += 1;
    logCall(owner, role);
    const input = argument === undefined ? null : cloneJSON(argument, `bridge ${role} input`);
    const output = argument === undefined
      ? noThenable(fn(state), `bridge ${role}`)
      : noThenable(fn(state, argument), `bridge ${role}`);
    const tracedOutput = role === "input"
      ? snapshotState(child, childBound, output, "child")
      : role === "receive" ? snapshotState(parent, parentBound, output, "parent") : output;
    bridgeCalls.push({ sequence: bridgeCalls.length, role, owner, input, output: cloneJSON(tracedOutput, `bridge ${role} output`) });
    return output;
  }

  function outputToChild() {
    const input = assertInputRecord(recordBridge("output", "parent", parentBridges.output, parentState));
    childState = recordBridge("input", "child", childBridges.input, childState, input);
    return input;
  }

  function publishToParent() {
    const publication = assertPublicationRecord(recordBridge("publication", "child", childBridges.publication, childState));
    parentState = recordBridge("receive", "parent", parentBridges.receive, parentState, publication);
    return publication;
  }

  function makeView(bound, state, label) {
    counts[`${label}View`] += 1;
    logCall(label, "View");
    return viewParts(noThenable(bound.View(state), `${label}.View`), label);
  }

  function encodedStates() {
    return {
      parentState: snapshotState(parent, parentBound, parentState, "parent"),
      childState: snapshotState(child, childBound, childState, "child"),
    };
  }

  function viewRecord(raw, label) {
    // Renderer view snapshots are normalized and JSON-safe. Keep the raw Go
    // value private so no caller can mutate the live callback source.
    return raw;
  }

  function appendCheckpoint(sourceEventIndex, bridges, calls = []) {
    const states = encodedStates();
    const checkpoint = {
      stateIndex: checkpoints.length,
      sourceEventIndex,
      ...states,
      parentView: cloneJSON(parentRenderer.viewRecord(), "parent view"),
      childView: cloneJSON(childRenderer.viewRecord(), "child view"),
      bridges: cloneJSON(bridges),
      callOrder: cloneJSON(calls),
      dom: null,
    };
    checkpoints.push(checkpoint);
    return checkpoint;
  }

  function rendererCallbacks(target, epoch) {
    return {
      dispatch(action, message) {
        return dispatch(target, action, message, epoch, "click");
      },
      onStaleAction(action, renderEpoch = null) {
        return stale(target, action, renderEpoch, epoch);
      },
    };
  }

  function commitViews(nextParentView, nextChildView, renderersPair = null, epoch = generation) {
    const targetParentRenderer = renderersPair?.parentRenderer ?? parentRenderer;
    const targetChildRenderer = renderersPair?.childRenderer ?? childRenderer;
    if (!targetParentRenderer || !targetChildRenderer) throw new TypeError("module renderers are not mounted");
    noThenable(targetParentRenderer.update(nextParentView.raw, rendererCallbacks("parent", epoch)), "parent renderer.update()");
    noThenable(targetChildRenderer.update(nextChildView.raw, rendererCallbacks("child", epoch)), "child renderer.update()");
  }

  function reportFailure(error) {
    failed = error instanceof Error ? error : new Error(String(error));
    active = false;
    try { onFailure?.(failed); } catch { /* retain the first runtime failure */ }
    return failed;
  }

  function stale(target, actionInput, renderEpoch, callbackGeneration) {
    let action;
    try { action = actionRecord(actionInput); } catch (error) { return { accepted: false, stale: true, error: error.message }; }
    const staleEvent = {
      eventIndex: eventIndex++, kind: "stale-callback", target: null, callbackTarget: target, action, message: null,
      dispatched: false, suppressed: false, stale: true, bridgeCalls: [],
      callOrder: [],
      callCountsBefore: { ...counts }, callCountsAfter: { ...counts }, callbackGeneration,
      renderEpoch: Number.isSafeInteger(renderEpoch) ? renderEpoch : null,
    };
    events.push(staleEvent);
    return { accepted: false, stale: true, dispatchId: null, eventIndex: staleEvent.eventIndex };
  }

  function recordSuppressedAction(target, actionInput) {
    if (!active || failed || !parentRenderer || !childRenderer) return { accepted: false, error: "module pair is not active" };
    if (busy) return { accepted: false, error: "reentrant module dispatch rejected" };
    if (target !== "parent" && target !== "child") return { accepted: false, error: "target must be parent or child" };
    let action;
    let resolved;
    try {
      action = actionRecord(actionInput);
      resolved = resolveCurrentMessage(target === "parent" ? parentView : childView, action, target);
    } catch (error) {
      return { accepted: false, error: error.message };
    }
    if (!resolved.disabled && resolved.message !== null) {
      return { accepted: false, error: "action is not suppressed by the current Go View" };
    }
    const index = eventIndex++;
    events.push({
      eventIndex: index, kind: "disabled-action", target, action, message: null,
      dispatched: false, suppressed: true, stale: false, bridgeCalls: [], callOrder: [],
      callCountsBefore: { ...counts }, callCountsAfter: { ...counts },
    });
    return { accepted: true, suppressed: true, eventIndex: index };
  }

  function dispatch(target, actionInput, messageInput, callbackGeneration = generation, kind = "go-message") {
    if (!active || failed || !parentRenderer || !childRenderer) return { accepted: false, error: "module pair is not active" };
    if (busy) return { accepted: false, error: "reentrant module dispatch rejected" };
    let action;
    try { action = actionRecord(actionInput); } catch (error) { return { accepted: false, error: error.message }; }
    if (callbackGeneration !== generation) return stale(target, action, null, callbackGeneration);
    const before = { ...counts };
    const bridgeStart = bridgeCalls.length;
    const callOrderStart = callOrder.length;
    const index = eventIndex++;
    if (target !== "parent" && target !== "child") {
      eventIndex -= 1;
      return { accepted: false, error: "target must be parent or child" };
    }
    const sourceView = target === "parent" ? parentView : childView;
    let resolved;
    try { resolved = resolveCurrentMessage(sourceView, action, target); }
    catch (error) { eventIndex -= 1; return { accepted: false, error: error.message }; }
    if (resolved.disabled || resolved.message === null) {
      const event = { eventIndex: index, kind, target, action, message: null, dispatched: false,
        suppressed: true, stale: false, bridgeCalls: [], callOrder: [], callCountsBefore: before, callCountsAfter: { ...counts } };
      events.push(event);
      return { accepted: true, suppressed: true, dispatchId: null, eventIndex: index };
    }
    let message;
    try { message = validateMessage(messageInput, resolved.message, "renderer message"); }
    catch (error) { eventIndex -= 1; return { accepted: false, error: error.message }; }
    return applyMessageTransaction(target, action, message, kind, before, index, bridgeStart, callOrderStart);
  }

  function applyMessageTransaction(target, action, message, kind, before, index, bridgeStart, callOrderStart) {
    const dispatchId = nextDispatch++;
    busy = true;
    try {
      if (target === "parent") {
        parentState = updateState(parent, parentBound, parentState, message, "parent", counts, logCall);
        outputToChild();
      } else {
        childState = updateState(child, childBound, childState, message, "child", counts, logCall);
        publishToParent();
      }
      const nextParentView = makeView(parentBound, parentState, "parent");
      const nextChildView = makeView(childBound, childState, "child");
      commitViews(nextParentView, nextChildView);
      parentView = nextParentView;
      childView = nextChildView;
      const bridges = bridgeCalls.slice(bridgeStart).map((item) => cloneJSON(item));
      const orderedCalls = callOrder.slice(callOrderStart).map((item) => cloneJSON(item));
      const checkpoint = appendCheckpoint(index, bridges, orderedCalls);
      const event = { eventIndex: index, kind, target, action, message, dispatched: true,
        suppressed: false, stale: false, dispatchId, bridgeCalls: bridges,
        callCountsBefore: before, callCountsAfter: { ...counts }, callOrder: orderedCalls };
      events.push(event);
      steps.push({ eventIndex: index, kind, target, message: cloneJSON(message), bridges,
        parentState: cloneJSON(checkpoint.parentState), childState: cloneJSON(checkpoint.childState),
        parentView: cloneJSON(checkpoint.parentView), childView: cloneJSON(checkpoint.childView) });
      return { accepted: true, dispatchId, eventIndex: index };
    } catch (error) {
      reportFailure(error);
      events.push({ eventIndex: index, kind, target, action, message: cloneJSON(message), dispatched: false,
        suppressed: false, stale: false, dispatchId, bridgeCalls: bridgeCalls.slice(bridgeStart).map((item) => cloneJSON(item)),
        callCountsBefore: before, callCountsAfter: { ...counts }, error: failed.message,
        callOrder: callOrder.slice(callOrderStart).map((item) => cloneJSON(item)) });
      return { accepted: false, dispatchId, eventIndex: index, error: failed.message };
    } finally {
      busy = false;
    }
  }

  function dispatchGoMessage(target, messageInput) {
    if (!active || failed || !parentRenderer || !childRenderer) return { accepted: false, error: "module pair is not active" };
    if (busy) return { accepted: false, error: "reentrant module dispatch rejected" };
    if (target !== "parent" && target !== "child") return { accepted: false, error: "target must be parent or child" };
    let message;
    try {
      message = exactRecord(messageInput, ["Name", "Arg"], "Go message");
      if (typeof message.Name !== "string" || typeof message.Arg !== "string") throw new TypeError("Go message fields must be strings");
    } catch (error) {
      return { accepted: false, error: error.message };
    }
    const before = { ...counts };
    const bridgeStart = bridgeCalls.length;
    const callOrderStart = callOrder.length;
    const index = eventIndex++;
    return applyMessageTransaction(target, null, message, "go-message", before, index, bridgeStart, callOrderStart);
  }

  function methodDispatch(target, action, message) {
    return dispatch(target, action, message, generation, "go-message");
  }

  function snapshot() {
    if (!parentRenderer || !childRenderer) throw new TypeError("module pair is not mounted");
    const parentSnap = rendererSnapshot(parentRenderer, "parent");
    const childSnap = rendererSnapshot(childRenderer, "child");
    return cloneJSON({
      schema: SNAPSHOT_SCHEMA,
      backend: currentBackend,
      parent: { state: snapshotState(parent, parentBound, parentState, "parent"), view: parentSnap.view, dom: parentSnap.dom },
      child: { state: snapshotState(child, childBound, childState, "child"), view: childSnap.view, dom: childSnap.dom },
      failed: failed === null ? null : { name: failed.name, message: failed.message },
    });
  }

  function trace() {
    const final = checkpoints.length ? cloneJSON(checkpoints.at(-1)) : null;
    return cloneJSON({
      schema: TRACE_SCHEMA,
      parent: { componentID: parentBound.component.id, packagePath: parentBound.component.packagePath },
      child: { componentID: childBound.component.id, packagePath: childBound.component.packagePath },
      eventCount: events.length,
      events,
      steps,
      checkpoints,
      bridgeCalls,
      callOrder,
      callCounts: counts,
      initial: checkpoints[0] ?? null,
      final,
      backend: currentBackend,
    });
  }

  function replaceBackend(to) {
    if (!active || failed) throw new TypeError("module pair is not active");
    if (busy) throw new TypeError("reentrant renderer replacement rejected");
    const nextFactory = rendererFactory(renderers, to);
    if (to === currentBackend) return snapshot();
    const nextGeneration = generation + 1;
    if (!Number.isSafeInteger(nextGeneration)) throw new TypeError("renderer generation exceeded the safe integer range");
    const document = container.ownerDocument;
    const fromBackend = currentBackend;
    const nextParentRoot = document.createElement("div");
    const nextChildRoot = document.createElement("div");
    nextParentRoot.setAttribute("data-gobi-module-root", "parent");
    nextChildRoot.setAttribute("data-gobi-module-root", "child");
    let nextParentRenderer = null;
    let nextChildRenderer = null;
    let committed = false;
    try {
      nextParentRenderer = nextFactory({ container: nextParentRoot, onFailure: reportFailure });
      requireRenderer(nextParentRenderer, "parent", parentBound.component);
      nextChildRenderer = nextFactory({ container: nextChildRoot, onFailure: reportFailure });
      requireRenderer(nextChildRenderer, "child", childBound.component);
      const nextParentView = parentView;
      const nextChildView = childView;
      commitViews(nextParentView, nextChildView, { parentRenderer: nextParentRenderer, childRenderer: nextChildRenderer }, nextGeneration);
      const oldParentRenderer = parentRenderer;
      const oldChildRenderer = childRenderer;
      container.replaceChildren(nextParentRoot, nextChildRoot);
      parentRenderer = nextParentRenderer;
      childRenderer = nextChildRenderer;
      parentRoot = nextParentRoot;
      childRoot = nextChildRoot;
      currentBackend = to;
      generation = nextGeneration;
      committed = true;
      try { noThenable(oldParentRenderer.unmount(), "parent renderer.unmount()"); } catch (error) { reportFailure(error); }
      try { noThenable(oldChildRenderer.unmount(), "child renderer.unmount()"); } catch (error) { reportFailure(error); }
      if (failed) throw failed;
      events.push({ eventIndex: eventIndex++, kind: "renderer-swap", target: null, action: null, message: null,
        dispatched: false, suppressed: false, stale: false, bridgeCalls: [], callCountsBefore: { ...counts },
        callCountsAfter: { ...counts }, from: fromBackend, to, generation,
        callOrder: [] });
      return snapshot();
    } catch (error) {
      if (!committed) {
        try { if (nextParentRenderer) noThenable(nextParentRenderer.unmount(), "candidate parent renderer.unmount()"); } catch { /* keep the admission failure */ }
        try { if (nextChildRenderer) noThenable(nextChildRenderer.unmount(), "candidate child renderer.unmount()"); } catch { /* keep the admission failure */ }
        throw error;
      }
      reportFailure(error);
      throw failed;
    }
  }

  function unmount() {
    if (!active && !parentRenderer && !childRenderer) return false;
    active = false;
    generation += 1;
    let okay = true;
    for (const renderer of [parentRenderer, childRenderer]) {
      try { if (renderer) noThenable(renderer.unmount(), "renderer.unmount()"); } catch (error) { okay = false; reportFailure(error); }
    }
    parentRenderer = null;
    childRenderer = null;
    parentRoot?.remove();
    childRoot?.remove();
    return okay;
  }

  try {
    // Renderer instances are created on detached roots after pair admission so
    // their declared capabilities can fail before any Go role runs. The outer
    // container is changed only after the complete pair has rendered.
    parentRoot = container.ownerDocument.createElement("div");
    childRoot = container.ownerDocument.createElement("div");
    parentRoot.setAttribute("data-gobi-module-root", "parent");
    childRoot.setAttribute("data-gobi-module-root", "child");
    parentRenderer = factory({ container: parentRoot, onFailure: reportFailure });
    requireRenderer(parentRenderer, "parent", parentBound.component);
    childRenderer = factory({ container: childRoot, onFailure: reportFailure });
    requireRenderer(childRenderer, "child", childBound.component);

    counts.parentInit += 1;
    logCall("parent", "Init");
    parentState = noThenable(parentBound.Init(), "parent.Init");
    counts.childInit += 1;
    logCall("child", "Init");
    childState = noThenable(childBound.Init(), "child.Init");
    const initCallStart = callOrder.length - 2;
    const initBridgeStart = bridgeCalls.length;
    outputToChild();
    publishToParent();
    parentView = makeView(parentBound, parentState, "parent");
    childView = makeView(childBound, childState, "child");

    commitViews(parentView, childView);
    container.replaceChildren(parentRoot, childRoot);
    const initialBridges = bridgeCalls.slice(initBridgeStart).map((item) => cloneJSON(item));
    appendCheckpoint(null, initialBridges, callOrder.slice(initCallStart).map((item) => cloneJSON(item)));
    return {
      dispatchParent: (action, message) => methodDispatch("parent", action, message),
      dispatchChild: (action, message) => methodDispatch("child", action, message),
      dispatchGoMessage,
      recordSuppressedAction,
      snapshot,
      trace,
      replaceBackend,
      unmount,
      failure: () => failed === null ? null : { name: failed.name, message: failed.message },
      isUnmounted: () => !active,
    };
  } catch (error) {
    active = false;
    try { if (parentRenderer) noThenable(parentRenderer.unmount(), "parent renderer.unmount()"); } catch { /* preserve original failure */ }
    try { if (childRenderer) noThenable(childRenderer.unmount(), "child renderer.unmount()"); } catch { /* preserve original failure */ }
    parentRoot?.remove();
    childRoot?.remove();
    throw error;
  }
}
