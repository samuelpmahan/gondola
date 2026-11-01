import { bindCompiledComponent } from "../../compiled-frontend/frontend/react/bindings.mjs";
import { assertInputRecord, assertPublicationRecord, validateModulePair } from "../../compiled-modules/abi/validate.mjs";

const SNAPSHOT_SCHEMA = "gobi.keyed-module-snapshot/v1";
const TRACE_SCHEMA = "gobi.keyed-module-trace/v1";
const PARENT_BRIDGE_KEYS = ["output", "receive"];
const CHILD_BRIDGE_KEYS = ["input", "publication"];
const KEYED_HELPER_KEYS = ["children", "receiveKeyed", "isCurrent"];
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

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
  const copy = Object.create(null);
  for (const key of expected) copy[key] = ownData(value, key, label);
  return copy;
}

function snapshotMetadata(value, path = "metadata") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string") || keys.length !== value.length + 1 || !keys.includes("length")) {
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

function cloneJSON(value, path = "trace") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => cloneJSON(item, `${path}[${index}]`));
  if (!record(value)) throw new TypeError(`${path} contains an unsupported value`);
  const copy = {};
  for (const key of Object.keys(value)) {
    const field = ownData(value, key, path);
    if (field === undefined) throw new TypeError(`${path}.${key} is undefined`);
    copy[key] = cloneJSON(field, `${path}.${key}`);
  }
  return copy;
}

function noThenable(value, label) {
  if (value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function") {
    throw new TypeError(`${label} must complete synchronously`);
  }
  return value;
}

function optionRecord(value, requiredKeys, optionalKeys, label) {
  if (!record(value)) throw new TypeError(`${label} must be an object`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError(`${label} must have a plain object prototype`);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) throw new TypeError(`${label} has unknown or symbol properties`);
  for (const key of requiredKeys) if (!keys.includes(key)) throw new TypeError(`${label}.${key} is required`);
  const copy = Object.create(null);
  for (const key of keys) copy[key] = ownData(value, key, label);
  return copy;
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
  const copy = Object.create(null);
  for (const key of wanted) {
    const fn = ownData(bridges, key, `${label}.bridges`);
    if (typeof fn !== "function") throw new TypeError(`${label}.bridges.${key} must be callable`);
    copy[key] = fn;
  }
  return Object.freeze(copy);
}

function helperEntry(helpers) {
  if (!record(helpers)) throw new TypeError("parent.keyed must be a helper record");
  const keys = Reflect.ownKeys(helpers);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("parent.keyed has symbol properties");
  const actual = [...keys].sort();
  const wanted = [...KEYED_HELPER_KEYS].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`parent.keyed must contain exactly ${wanted.join(", ")}`);
  }
  const copy = Object.create(null);
  for (const key of wanted) {
    const fn = ownData(helpers, key, "parent.keyed");
    if (typeof fn !== "function") throw new TypeError(`parent.keyed.${key} must be callable`);
    copy[key] = fn;
  }
  return Object.freeze(copy);
}

function moduleInput(side, label, expectedBridges, requiresKeyed) {
  const keys = ["module", "bridges", "encoder", "descriptor", "descriptorBytes", "artifactBytes", "componentId"];
  const optionalKeys = ["packagePath", "backend"];
  if (requiresKeyed) { keys.push("keyed", "keyedSidecar"); }
  const fields = optionRecord(side, keys, optionalKeys, `${label} module input`);
  if (!record(fields.module)) throw new TypeError(`${label}.module must be gobiCompiled`);
  const compiled = exactRecord(fields.module, ["schema", "appIR", "symbols"], `${label}.module`);
  if (compiled.schema !== "gobi.compiled-module/v1") throw new TypeError(`${label}.module has an unknown schema`);
  const appIR = snapshotMetadata(compiled.appIR, `${label}.appIR`);
  if (!record(compiled.symbols)) throw new TypeError(`${label}.module.symbols must be an object`);
  const symbols = Object.create(null);
  const symbolKeys = Reflect.ownKeys(compiled.symbols);
  if (symbolKeys.some((key) => typeof key !== "string")) throw new TypeError(`${label}.module.symbols has symbol keys`);
  for (const key of symbolKeys) {
    const fn = ownData(compiled.symbols, key, `${label}.module.symbols`);
    if (typeof fn !== "function") throw new TypeError(`${label}.module.symbols.${key} must be callable`);
    symbols[key] = fn;
  }
  fields.module = Object.freeze({ schema: compiled.schema, appIR, symbols: Object.freeze(symbols) });
  fields.bridges = bridgeEntry(fields.bridges, expectedBridges, label);
  if (!record(fields.encoder)) throw new TypeError(`${label}.encoder must export gobiEncodeState`);
  const encoderDescriptor = Object.getOwnPropertyDescriptor(fields.encoder, "gobiEncodeState");
  if (!encoderDescriptor || !Object.hasOwn(encoderDescriptor, "value") || typeof encoderDescriptor.value !== "function") {
    throw new TypeError(`${label}.encoder must have an own gobiEncodeState function`);
  }
  fields.encoder = Object.freeze({ gobiEncodeState: encoderDescriptor.value });
  if (!record(fields.descriptor)) throw new TypeError(`${label}.descriptor must be a module ABI descriptor`);
  fields.descriptor = snapshotMetadata(fields.descriptor, `${label}.descriptor`);
  if (!(fields.descriptorBytes instanceof Uint8Array) || fields.descriptorBytes.byteLength === 0) {
    throw new TypeError(`${label}.descriptorBytes must contain exact nonempty module-abi.json bytes`);
  }
  fields.descriptorBytes = new Uint8Array(fields.descriptorBytes);
  if (typeof fields.componentId !== "string" || fields.componentId === "") throw new TypeError(`${label}.componentId must be a non-empty string`);
  if (!(fields.artifactBytes instanceof Map) && !record(fields.artifactBytes)) throw new TypeError(`${label}.artifactBytes must be a Map or path record`);
  const artifactEntries = fields.artifactBytes instanceof Map
    ? [...fields.artifactBytes.entries()]
    : Reflect.ownKeys(fields.artifactBytes).map((key) => {
      if (typeof key !== "string") throw new TypeError(`${label}.artifactBytes has symbol keys`);
      return [key, ownData(fields.artifactBytes, key, `${label}.artifactBytes`)];
    });
  const artifacts = new Map();
  for (const [path, bytes] of artifactEntries) {
    if (typeof path !== "string" || !(bytes instanceof Uint8Array)) throw new TypeError(`${label}.artifactBytes must map paths to Uint8Array values`);
    artifacts.set(path, new Uint8Array(bytes));
  }
  fields.artifactBytes = artifacts;
  if (requiresKeyed) {
    fields.keyed = helperEntry(fields.keyed);
    fields.keyedSidecar = exactRecord(fields.keyedSidecar,
      ["bytes", "byteLength", "sha256", "backend", "packagePath", "componentId", "moduleABI", "appIR"], "parent.keyedSidecar");
    if (!(fields.keyedSidecar.bytes instanceof Uint8Array)) throw new TypeError("parent.keyedSidecar.bytes must be Uint8Array");
    fields.keyedSidecar.bytes = new Uint8Array(fields.keyedSidecar.bytes);
  }
  return fields;
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateKeyedSidecar(parent, backend) {
  const pin = parent.keyedSidecar;
  if (!Number.isSafeInteger(pin.byteLength) || pin.byteLength <= 0 || pin.byteLength !== pin.bytes.byteLength ||
      typeof pin.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(pin.sha256)) {
    throw new TypeError("parent keyed helper byte pin is malformed");
  }
  const digest = await sha256(pin.bytes);
  if (digest !== pin.sha256) throw new TypeError("parent keyed helper digest does not match its bytes");
  if (pin.backend !== backend || pin.packagePath !== parent.descriptor.packagePath || pin.componentId !== parent.componentId ||
      pin.moduleABI !== parent.descriptor.abiSHA256 || typeof pin.appIR !== "string" || !/^[0-9a-f]{64}$/.test(pin.appIR)) {
    throw new TypeError("parent keyed helper pin does not match backend, AppIR, component, or module ABI");
  }
  if ((parent.backend !== undefined && parent.backend !== backend) ||
      (parent.packagePath !== undefined && parent.packagePath !== parent.descriptor.packagePath)) {
    throw new TypeError("parent build identity does not match its keyed helper pin");
  }
  const appIRArtifact = parent.descriptor.artifacts.find((artifact) => artifact.path.endsWith("/app-ir.json"));
  const appIRBytes = appIRArtifact ? parent.artifactBytes.get(appIRArtifact.path) : null;
  if (!(appIRBytes instanceof Uint8Array) || await sha256(appIRBytes) !== pin.appIR) {
    throw new TypeError("parent keyed helper pin does not match the parent AppIR artifact");
  }
}

function componentEntry(side, label) {
  if (typeof side.componentId !== "string" || side.componentId === "") throw new TypeError(`${label}.componentId must be a non-empty string`);
  const bound = bindCompiledComponent(side.module, side.componentId);
  if (bound.compiled.appIR.components.length !== 1) throw new TypeError(`${label} must contain exactly one component`);
  return bound;
}

function sliceValues(value, label) {
  if (value === null) return [];
  if (Array.isArray(value)) return value.slice();
  if (!record(value)) throw new TypeError(`${label} must be a native array or GoScript slice`);
  const backing = ownData(value, "backing", label);
  const offset = ownData(value, "offset", label);
  const length = ownData(value, "length", label);
  const capacity = ownData(value, "capacity", label);
  if (!Array.isArray(backing) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || !Number.isSafeInteger(capacity) ||
      offset < 0 || length < 0 || capacity < length || offset + capacity > backing.length) {
    throw new TypeError(`${label} has invalid GoScript slice bounds`);
  }
  return backing.slice(offset, offset + length);
}

function required(value, key, label) {
  if (value === null || value === undefined || !Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is missing`);
  return ownData(value, key, label);
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

function actionRecord(action) {
  const value = exactRecord(action, ["path", "event", "value"], "Action");
  if (![value.path, value.event, value.value].every((field) => typeof field === "string")) throw new TypeError("Action fields must be strings");
  normalizePath(value.path);
  return value;
}

function resolveCurrentMessage(view, action, label) {
  let node = view.tree;
  for (const index of normalizePath(action.path)) {
    const children = sliceValues(required(node, "Kids", `${label} View node`), `${label} View node.Kids`);
    node = children[index] ?? null;
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
  if (typeof actual.Name !== "string" || typeof actual.Arg !== "string" || actual.Name !== expected.Name || actual.Arg !== expected.Arg) {
    throw new TypeError(`${label} does not match the current Go View handler`);
  }
  return actual;
}

function valueToJSON(value, path = "state") {
  if (!record(value) || typeof value.typeId !== "string" || typeof value.kind !== "string") throw new TypeError(`${path} is not an encoded Go Value`);
  switch (value.kind) {
    case "bool": return ownData(value, "bool", path);
    case "string": return ownData(value, "string", path);
    case "int":
    case "uint": {
      const number = Number(ownData(value, "integer", path));
      if (!Number.isSafeInteger(number)) throw new TypeError(`${path} integer is outside safe JSON range`);
      return number;
    }
    case "float64": {
      const bits = ownData(value, "float64Bits", path);
      if (typeof bits !== "string" || !/^[0-9a-f]{16}$/.test(bits)) throw new TypeError(`${path} has invalid float64Bits`);
      const bytes = new ArrayBuffer(8);
      const view = new DataView(bytes);
      view.setBigUint64(0, BigInt(`0x${bits}`), false);
      const number = view.getFloat64(0, false);
      if (!Number.isFinite(number)) throw new TypeError(`${path} contains a non-finite float`);
      return number;
    }
    case "struct": {
      const fields = ownData(value, "fields", path);
      if (!Array.isArray(fields)) throw new TypeError(`${path}.fields must be an array`);
      const out = {};
      for (const field of fields) {
        const item = exactRecord(field, ["name", "value"], `${path}.field`);
        if (typeof item.name !== "string" || Object.hasOwn(out, item.name)) throw new TypeError(`${path} has duplicate or invalid fields`);
        out[item.name] = valueToJSON(item.value, `${path}.${item.name}`);
      }
      return out;
    }
    case "slice":
    case "array": {
      const items = ownData(value, "items", path);
      if (!Array.isArray(items)) throw new TypeError(`${path}.items must be an array`);
      if (value.kind === "slice" && ownData(value, "isNil", path)) return null;
      return items.map((item, index) => valueToJSON(item, `${path}[${index}]`));
    }
    default: throw new TypeError(`${path} has unsupported encoded kind ${value.kind}`);
  }
}

function rendererFactory(renderers, backend) {
  if (typeof backend !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(backend)) throw new TypeError("backend must be a registered safe renderer ID");
  if (!Object.hasOwn(renderers, backend) || typeof renderers[backend] !== "function") throw new TypeError(`backend ${JSON.stringify(backend)} is not registered`);
  return renderers[backend];
}

function captureFactories(renderers) {
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

function requireRenderer(renderer, label, component) {
  if (!record(renderer)) throw new TypeError(`${label} renderer factory must return an object`);
  for (const name of ["update", "viewRecord", "domSnapshot", "unmount"]) {
    if (typeof renderer[name] !== "function") throw new TypeError(`${label} renderer must provide ${name}()`);
  }
  const caps = renderer.viewCapabilities;
  const supported = new Set(["view.node", "binding.value", "binding.checked"]);
  if (!Array.isArray(caps) || caps.some((capability) => typeof capability !== "string" || !supported.has(capability)) || new Set(caps).size !== caps.length) {
    throw new TypeError(`${label} renderer must declare view capabilities`);
  }
  const required = component.capabilities.filter((capability) => supported.has(capability));
  const missing = required.filter((capability) => !caps.includes(capability));
  if (missing.length) throw new TypeError(`${label} renderer is missing capabilities ${missing.join(", ")}`);
  return renderer;
}

function sameJSON(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function decodeGoSlice(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} helper must return a native array`);
  const slots = value.map((slot, index) => {
    const item = exactRecord(slot, ["key", "generation"], `${label}[${index}]`);
    if (typeof item.key !== "string" || !/^[a-z]$/.test(item.key) || !Number.isSafeInteger(item.generation) || item.generation < 1) {
      throw new TypeError(`${label}[${index}] has an invalid key or generation`);
    }
    return { key: item.key, generation: item.generation };
  });
  if (new Set(slots.map((slot) => slot.key)).size !== slots.length) throw new TypeError(`${label} has duplicate keys`);
  if (slots.length > 2) throw new TypeError(`${label} exceeds the two-key profile`);
  return slots;
}

function ownViewPath(view, path) {
  let node = view.tree;
  for (const index of normalizePath(path)) {
    const kids = sliceValues(required(node, "Kids", "View node"), "View node.Kids");
    node = kids[index] ?? null;
    if (node === null) return null;
  }
  return node;
}

function encodedState(side, bound, state, label) {
  const encoded = noThenable(side.encoder.gobiEncodeState(state, bound.component.stateType), `${label} state encoding`);
  if (!record(encoded) || encoded.typeId !== bound.component.stateType || typeof encoded.kind !== "string") throw new TypeError(`${label} state encoder returned a malformed Value`);
  return cloneJSON(encoded, `${label} encoded state`);
}

function validateEffects(side, effects, bound, label) {
  if (effects === null || effects === undefined) return;
  const declaration = bound.compiled.appIR.symbols.find((symbol) => symbol.id === bound.component.update);
  const effectType = declaration?.signature?.results?.[1];
  if (typeof effectType !== "string") throw new TypeError(`${label}.Update does not declare its effects slice result`);
  const encoded = noThenable(side.encoder.gobiEncodeState(effects, effectType), `${label} effect encoding`);
  const item = exactRecord(encoded, ["typeId", "kind", "isNil", "items"], `${label} encoded effects`);
  if (item.typeId !== effectType || item.kind !== "slice" || typeof item.isNil !== "boolean" || !Array.isArray(item.items) || (item.isNil && item.items.length)) {
    throw new TypeError(`${label} Update effects are not a valid encoded slice`);
  }
  if (item.items.length) throw new TypeError(`${label} emitted effects outside the effect-free keyed profile`);
}

function rendererSnapshot(renderer, name) {
  const view = noThenable(renderer.viewRecord(), `${name}.renderer.viewRecord()`);
  const dom = noThenable(renderer.domSnapshot(), `${name}.renderer.domSnapshot()`);
  return { view: cloneJSON(view, `${name} view`), dom: cloneJSON(dom, `${name} DOM`) };
}

/** Mount a Go-owned keyed parent and independently initialized child instances. */
export async function mountCompiledKeyedModules(options) {
  const optionsCopy = optionRecord(options, ["parent", "child", "renderers", "backend", "container"], ["onFailure"], "mount options");
  const parent = moduleInput(optionsCopy.parent, "parent", PARENT_BRIDGE_KEYS, true);
  const child = moduleInput(optionsCopy.child, "child", CHILD_BRIDGE_KEYS, false);
  const renderers = captureFactories(optionsCopy.renderers);
  const backend = optionsCopy.backend;
  if ((child.backend !== undefined && child.backend !== backend) ||
      (child.packagePath !== undefined && child.packagePath !== child.descriptor.packagePath)) {
    throw new TypeError("child build identity does not match the requested backend or ABI descriptor");
  }
  const factory = rendererFactory(renderers, backend);
  const onFailure = optionsCopy.onFailure ?? null;
  if (onFailure !== null && typeof onFailure !== "function") throw new TypeError("onFailure must be a function or null");
  const container = optionsCopy.container;
  if (!container || container.nodeType !== 1 || !container.ownerDocument || typeof container.replaceChildren !== "function") {
    throw new TypeError("container must be an empty DOM element");
  }
  if (container.childNodes.length !== 0) throw new TypeError("container must be empty before mounting keyed modules");

  await validateKeyedSidecar(parent, backend);

  // Capture all byte and callable inputs before async hashing begins. The
  // parent keyed sidecar is separately pinned by the loader and is checked
  // there before this host is called.
  const admitted = await validateModulePair({
    parent: { descriptor: parent.descriptor, descriptorBytes: parent.descriptorBytes, appIR: parent.module.appIR, artifactBytes: parent.artifactBytes },
    child: { descriptor: child.descriptor, descriptorBytes: child.descriptorBytes, appIR: child.module.appIR, artifactBytes: child.artifactBytes },
  });
  for (const [side, validated, label] of [[parent, admitted.parent, "parent"], [child, admitted.child, "child"]]) {
    if (!record(validated) || !record(validated.descriptor) || !record(validated.appIR) || !Array.isArray(validated.artifacts)) {
      throw new TypeError(`module ABI validator returned an incomplete ${label} snapshot`);
    }
    side.descriptor = validated.descriptor;
    side.module = Object.freeze({ ...side.module, appIR: validated.appIR });
  }
  const parentBound = componentEntry(parent, "parent");
  const childBound = componentEntry(child, "child");
  let parentRoot = container.ownerDocument.createElement("div");
  parentRoot.setAttribute("data-gobi-module-root", "parent");
  let parentRenderer = null;

  const counts = { parentInit: 0, childInit: 0, parentUpdate: 0, childUpdate: 0, parentView: 0, childView: 0,
    output: 0, input: 0, publication: 0, receiveKeyed: 0, children: 0, isCurrent: 0 };
  const bridgeCalls = [];
  const callOrder = [];
  const events = [];
  const steps = [];
  const checkpoints = [];
  const domIDs = new WeakMap();
  let nextDOMID = 1;
  let eventIndex = 0;
  let dispatchId = 1;
  let renderEpoch = 1;
  let backendName = backend;
  let active = true;
  let failed = null;
  let busy = false;
  let parentState;
  let parentView;
  let slots = [];
  let children = new Map();
  let lastInput = null;
  const childRoots = [];

  function logCall(owner, role, slot = null) {
    const item = { sequence: callOrder.length, owner, role };
    if (slot) { item.key = slot.key; item.generation = slot.generation; }
    callOrder.push(item);
  }

  function currentSlots(state = parentState) {
    counts.children += 1;
    logCall("parent", "Children");
    return decodeGoSlice(noThenable(parent.keyed.children(state), "parent.Children"), "parent.Children");
  }

  function isCurrent(key, generation, state = parentState) {
    counts.isCurrent += 1;
    logCall("parent", "IsCurrent", { key, generation });
    const result = noThenable(parent.keyed.isCurrent(state, key, generation), "parent.IsCurrent");
    if (typeof result !== "boolean") throw new TypeError("parent.IsCurrent must return a boolean");
    return result;
  }

  function bridge(role, owner, fn, state, argument, slot = null) {
    counts[role] += 1;
    logCall(owner, role, slot);
    const input = argument === undefined ? null : cloneJSON(argument, `bridge ${role} input`);
    const output = argument === undefined ? noThenable(fn(state), `bridge ${role}`) : noThenable(fn(state, argument), `bridge ${role}`);
    let traced = output;
    if (role === "input") traced = encodedState(child, childBound, output, "child");
    else if (role === "receiveKeyed") traced = encodedState(parent, parentBound, output, "parent");
    bridgeCalls.push({ sequence: bridgeCalls.length, role, owner, key: slot?.key ?? null, generation: slot?.generation ?? null,
      input, output: cloneJSON(traced, `bridge ${role} output`) });
    return output;
  }

  function outputToChildren() {
    const input = assertInputRecord(bridge("output", "parent", parent.bridges.output, parentState));
    lastInput = input;
    return input;
  }

  function inputChild(instance, input) {
    instance.input = input;
    instance.state = bridge("input", "child", child.bridges.input, instance.state, input, instance.slot);
  }

  function makeView(bound, state, label, slot = null) {
    counts[`${label}View`] += 1;
    logCall(label, "View", slot);
    return viewParts(noThenable(bound.View(state), `${label}.View`), label);
  }

  function publication(instance) {
    const item = assertPublicationRecord(bridge("publication", "child", child.bridges.publication, instance.state, undefined, instance.slot));
    return item;
  }

  function receivePublication(key, generation, publicationRecord, retained = false, callbackEpoch = renderEpoch) {
    if (!active || failed) return { accepted: false, error: "module host is not active" };
    if (callbackEpoch !== renderEpoch) {
      const item = { eventIndex: eventIndex++, kind: "stale-publication", target: "parent", key, generation,
        action: null, message: null, publication: cloneJSON(publicationRecord), dispatched: false, suppressed: false, stale: true,
        bridgeCalls: [], callOrder: [], callCountsBefore: { ...counts }, callCountsAfter: { ...counts }, callbackEpoch, renderEpoch };
      events.push(item);
      return { accepted: false, stale: true, eventIndex: item.eventIndex };
    }
    const mounted = children.get(key);
    if (!mounted || mounted.slot.generation !== generation) {
      const item = { eventIndex: eventIndex++, kind: "stale-publication", target: "parent", key, generation,
        action: null, message: null, publication: cloneJSON(publicationRecord), dispatched: false, suppressed: false, stale: true,
        bridgeCalls: [], callOrder: [], callCountsBefore: { ...counts }, callCountsAfter: { ...counts } };
      events.push(item);
      return { accepted: false, stale: true, eventIndex: item.eventIndex };
    }
    if (!isCurrent(key, generation)) {
      const item = { eventIndex: eventIndex++, kind: "stale-publication", target: "parent", key, generation,
        action: null, message: null, publication: cloneJSON(publicationRecord), dispatched: false, suppressed: false, stale: true,
        bridgeCalls: [], callOrder: [], callCountsBefore: { ...counts }, callCountsAfter: { ...counts } };
      events.push(item);
      return { accepted: false, stale: true, eventIndex: item.eventIndex };
    }
    const slot = mounted;
    const clean = assertPublicationRecord(publicationRecord);
    const before = { ...counts };
    const bridgeStart = bridgeCalls.length;
    const callsStart = callOrder.length;
    const index = eventIndex++;
    parentState = bridge("receiveKeyed", "parent", (state, payload) => parent.keyed.receiveKeyed(state, key, generation, payload), parentState, clean, slot.slot);
    renderAll();
    const afterBridges = bridgeCalls.slice(bridgeStart).map((item) => cloneJSON(item));
    const afterCalls = callOrder.slice(callsStart).map((item) => cloneJSON(item));
    const checkpoint = addCheckpoint(index, afterBridges, afterCalls);
    events.push({ eventIndex: index, kind: retained ? "publication" : "publication", target: "parent", key, generation,
      action: null, message: null, publication: cloneJSON(clean), dispatched: true, suppressed: false, stale: false,
      bridgeCalls: afterBridges, callOrder: afterCalls, callCountsBefore: before, callCountsAfter: { ...counts } });
    steps.push({ eventIndex: index, kind: "publication", target: "parent", key, generation, publication: cloneJSON(clean),
      bridgeCalls: afterBridges, parentState: checkpoint.parent.state, children: checkpoint.children });
    return { accepted: true, eventIndex: index };
  }

  function childCallbacks(instance, epoch) {
    return {
      dispatch(action, message) { return dispatch("child", action, message, { key: instance.slot.key, generation: instance.slot.generation }, epoch); },
      publish(record) { return receivePublication(instance.slot.key, instance.slot.generation, record, true, epoch); },
      onStaleAction(action, staleEpoch = null) { return stale("child", action, instance.slot, epoch, staleEpoch); },
    };
  }

  function parentCallbacks(epoch) {
    return {
      dispatch(action, message) { return dispatch("parent", action, message, null, epoch); },
      onStaleAction(action, staleEpoch = null) { return stale("parent", action, null, epoch, staleEpoch); },
    };
  }

  function updateRenderer(renderer, view, callbacks, label) {
    noThenable(renderer.update(view.raw, callbacks), `${label}.renderer.update()`);
  }

  function orderRoots() {
    const roots = [parentRoot, ...slots.map((slot) => children.get(slot.key)?.root).filter(Boolean)];
    container.replaceChildren(...roots);
  }

  function removeInstance(instance) {
    try { noThenable(instance.renderer.unmount(), "child renderer.unmount()"); }
    catch (error) { reportFailure(error); }
    instance.root.remove?.();
  }

  function createInstance(slot) {
    const root = container.ownerDocument.createElement("div");
    childRoots.push(root);
    root.setAttribute("data-gobi-module-root", `child-${slot.key}`);
    root.setAttribute("data-gobi-key", slot.key);
    root.setAttribute("data-gobi-generation", String(slot.generation));
    let candidate = null;
    let renderer;
    try {
      candidate = factory({ container: root, onFailure: reportFailure });
      renderer = requireRenderer(candidate, `child ${slot.key}`, childBound.component);
    } catch (error) {
      try { candidate?.unmount?.(); } catch { /* preserve renderer admission error */ }
      throw error;
    }
    counts.childInit += 1;
    logCall("child", "Init", slot);
    const state = noThenable(childBound.Init(), "child.Init");
    return { slot: { ...slot }, root, renderer, state, view: null, input: null, publication: null };
  }

  function reconcile(nextSlots, nextInput, propagateInput = true) {
    const desired = new Set(nextSlots.map((slot) => `${slot.key}:${slot.generation}`));
    for (const [key, instance] of [...children]) {
      if (!desired.has(`${key}:${instance.slot.generation}`)) {
        removeInstance(instance);
        children.delete(key);
      }
    }
    for (const slot of nextSlots) {
      let instance = children.get(slot.key);
      if (!instance || instance.slot.generation !== slot.generation) {
        instance = createInstance(slot);
        children.set(slot.key, instance);
        inputChild(instance, nextInput);
        instance.publication = publication(instance);
        parentState = bridge("receiveKeyed", "parent", (state, payload) => parent.keyed.receiveKeyed(state, slot.key, slot.generation, payload), parentState, instance.publication, slot);
      } else if (propagateInput && !sameJSON(instance.input, nextInput)) {
        inputChild(instance, nextInput);
        instance.publication = publication(instance);
        if (isCurrent(slot.key, slot.generation)) {
          parentState = bridge("receiveKeyed", "parent", (state, payload) => parent.keyed.receiveKeyed(state, slot.key, slot.generation, payload), parentState, instance.publication, slot);
        }
      }
    }
    slots = nextSlots.map((slot) => ({ ...slot }));
    orderRoots();
  }

  function makeViews() {
    parentView = makeView(parentBound, parentState, "parent");
    for (const slot of slots) {
      const instance = children.get(slot.key);
      instance.view = makeView(childBound, instance.state, "child", slot);
    }
  }

  function renderAll(epoch = renderEpoch) {
    updateRenderer(parentRenderer, parentView, parentCallbacks(epoch), "parent");
    for (const slot of slots) {
      const instance = children.get(slot.key);
      updateRenderer(instance.renderer, instance.view, childCallbacks(instance, epoch), `child ${slot.key}`);
    }
    orderRoots();
  }

  function stateSnapshot(side, bound, state, label) {
    const encoded = encodedState(side, bound, state, label);
    const goState = valueToJSON(encoded, `${label} state`);
    return { goState, encodedState: encoded };
  }

  function parentProjection(goState) {
    const parentState = goState.Parent;
    if (!record(parentState) || !record(goState.A) || !record(goState.B)) throw new TypeError("parent Go state is missing keyed controller fields");
    const slot = (value) => ({ key: value.Key, generation: value.Generation, mounted: value.Mounted,
      publishedCount: value.PublishedCount, publishedRevision: value.PublishedRevision });
    return {
      state: { step: parentState.Step, locked: parentState.Locked, revision: parentState.Revision,
        publishedCount: parentState.PublishedCount, publishedRevision: parentState.PublishedRevision },
      controllerState: { a: slot(goState.A), b: slot(goState.B), first: goState.First, second: goState.Second, childCount: goState.ChildCount },
      goState,
    };
  }

  function childProjection(goState) {
    const count = goState?.Counter?.Count;
    if (!Number.isFinite(count)) throw new TypeError("child Go state is missing Counter.Count");
    return { count, step: goState.Step, locked: goState.Locked, inputRevision: goState.InputRevision };
  }

  function domIdentity(root) {
    const idFor = (node) => {
      if (!node || (typeof node !== "object" && typeof node !== "function")) return null;
      if (!domIDs.has(node)) domIDs.set(node, `dom-${nextDOMID++}`);
      return domIDs.get(node);
    };
    return { root: idFor(root), content: idFor(root?.firstElementChild ?? root?.childNodes?.[0] ?? null) };
  }

  function childSnapshot(instance, slot) {
    const dom = rendererSnapshot(instance.renderer, `child ${slot.key}`);
    const state = stateSnapshot(child, childBound, instance.state, `child ${slot.key}`);
    const parentSnapshot = parentProjection(stateSnapshot(parent, parentBound, parentState, "parent").goState);
    const stored = slot.key === "a" ? parentSnapshot.controllerState.a : parentSnapshot.controllerState.b;
    const childState = childProjection(state.goState);
    return { key: slot.key, generation: slot.generation, input: { step: instance.input.Step, locked: instance.input.Locked, revision: instance.input.Revision },
      publication: { key: slot.key, generation: slot.generation, count: stored.publishedCount, revision: stored.publishedRevision },
      state: childState, childState, goState: state.goState, encodedState: state.encodedState, view: dom.view, dom: dom.dom,
      domIdentity: domIdentity(instance.root) };
  }

  function addCheckpoint(sourceEventIndex, bridgeRows, calls) {
    const parentStateSnapshot = stateSnapshot(parent, parentBound, parentState, "parent");
    const parentDOM = rendererSnapshot(parentRenderer, "parent");
    const projectedParent = parentProjection(parentStateSnapshot.goState);
    const childSnapshots = slots.map((slot) => childSnapshot(children.get(slot.key), slot));
    const checkpoint = { stateIndex: checkpoints.length, sourceEventIndex,
      parent: { state: projectedParent.state, controllerState: projectedParent.controllerState, goState: projectedParent.goState,
        encodedState: parentStateSnapshot.encodedState, view: parentDOM.view, dom: parentDOM.dom, domIdentity: domIdentity(parentRoot) },
      children: childSnapshots,
      bridgeCalls: cloneJSON(bridgeRows), callOrder: cloneJSON(calls) };
    checkpoints.push(checkpoint);
    return checkpoint;
  }

  function snapshot() {
    if (!parentRenderer || !active) throw new TypeError("keyed module host is not mounted");
    const parentStateSnapshot = stateSnapshot(parent, parentBound, parentState, "parent");
    const parentDOM = rendererSnapshot(parentRenderer, "parent");
    const projectedParent = parentProjection(parentStateSnapshot.goState);
    const childSnapshots = slots.map((slot) => childSnapshot(children.get(slot.key), slot));
    return cloneJSON({ schema: SNAPSHOT_SCHEMA, backend: backendName, parent: { state: projectedParent.state, controllerState: projectedParent.controllerState,
      goState: projectedParent.goState, encodedState: parentStateSnapshot.encodedState, view: parentDOM.view, dom: parentDOM.dom, domIdentity: domIdentity(parentRoot) },
      children: childSnapshots, failed: failed === null ? null : { name: failed.name, message: failed.message } });
  }

  function trace() {
    return cloneJSON({ schema: TRACE_SCHEMA, parent: { componentID: parentBound.component.id, packagePath: parentBound.component.packagePath },
      child: { componentID: childBound.component.id, packagePath: childBound.component.packagePath }, backend: backendName,
      eventCount: events.length, events, steps, checkpoints, bridgeCalls, callOrder, callCounts: counts,
      initial: checkpoints[0] ?? null, final: checkpoints.at(-1) ?? null,
      mounted: slots.filter((slot) => children.has(slot.key)).map((slot) => ({ key: slot.key, generation: slot.generation })) });
  }

  function reportFailure(error) {
    failed = error instanceof Error ? error : new Error(String(error));
    active = false;
    try { onFailure?.(failed); } catch { /* retain the first runtime failure */ }
    return failed;
  }

  function stale(target, actionInput, slot, callbackEpoch, reportedEpoch = null) {
    let action;
    try { action = actionRecord(actionInput); } catch (error) { return { accepted: false, stale: true, error: error.message }; }
    const item = { eventIndex: eventIndex++, kind: "stale-callback", target, key: slot?.key ?? null, generation: slot?.generation ?? null,
      action, message: null, dispatched: false, suppressed: false, stale: true, bridgeCalls: [], callOrder: [],
      callCountsBefore: { ...counts }, callCountsAfter: { ...counts }, callbackEpoch, renderEpoch, reportedEpoch: Number.isSafeInteger(reportedEpoch) ? reportedEpoch : null };
    events.push(item);
    return { accepted: false, stale: true, eventIndex: item.eventIndex };
  }

  function dispatch(target, actionInput, messageInput, slot, callbackEpoch = renderEpoch) {
    if (!active || failed) return { accepted: false, error: "keyed module host is not active" };
    if (busy) return { accepted: false, error: "reentrant module dispatch rejected" };
    let action;
    try { action = actionRecord(actionInput); } catch (error) { return { accepted: false, error: error.message }; }
    if (callbackEpoch !== renderEpoch) return stale(target, action, slot, callbackEpoch);
    if (target === "child") {
      const mounted = slot && children.get(slot.key);
      if (!mounted || mounted.slot.generation !== slot.generation) return stale(target, action, slot, callbackEpoch);
    }
    const sourceView = target === "parent" ? parentView : children.get(slot.key).view;
    let resolved;
    try { resolved = resolveCurrentMessage(sourceView, action, target); } catch (error) { return { accepted: false, error: error.message }; }
    const before = { ...counts };
    const bridgeStart = bridgeCalls.length;
    const callsStart = callOrder.length;
    if (resolved.disabled || resolved.message === null) {
      const index = eventIndex++;
      events.push({ eventIndex: index, kind: "disabled-action", target, key: slot?.key ?? null, generation: slot?.generation ?? null,
        action, message: null, dispatched: false, suppressed: true, stale: false, bridgeCalls: [], callOrder: [],
        callCountsBefore: before, callCountsAfter: { ...counts } });
      return { accepted: true, suppressed: true, eventIndex: index };
    }
    if (target === "child" && !isCurrent(slot.key, slot.generation)) {
      return stale(target, action, slot, callbackEpoch);
    }
    let message;
    try { message = validateMessage(messageInput, resolved.message, "renderer message"); }
    catch (error) { return { accepted: false, error: error.message }; }
    const index = eventIndex++;
    return applyMessage(target, action, message, slot, before, index, bridgeStart, callsStart, "renderer-action");
  }

  function dispatchGoMessage(target, messageInput, slot = null) {
    if (!active || failed) return { accepted: false, error: "keyed module host is not active" };
    if (busy) return { accepted: false, error: "reentrant module dispatch rejected" };
    if (target !== "parent" && target !== "child") return { accepted: false, error: "target must be parent or child" };
    if (target === "child") {
      const mounted = slot && children.get(slot.key);
      if (!mounted || mounted.slot.generation !== slot.generation || !isCurrent(slot.key, slot.generation)) {
        return { accepted: false, stale: true, error: "key generation is not current" };
      }
    }
    let message;
    try {
      message = exactRecord(messageInput, ["Name", "Arg"], "Go message");
      if (typeof message.Name !== "string" || typeof message.Arg !== "string") throw new TypeError("Go message fields must be strings");
    } catch (error) { return { accepted: false, error: error.message }; }
    const before = { ...counts };
    const bridgeStart = bridgeCalls.length;
    const callsStart = callOrder.length;
    const index = eventIndex++;
    return applyMessage(target, null, message, slot, before, index, bridgeStart, callsStart, "go-message");
  }

  function applyMessage(target, action, message, slot, before, index, bridgeStart, callsStart, kind) {
    const id = dispatchId++;
    busy = true;
    try {
      if (target === "parent") {
        counts.parentUpdate += 1;
        logCall("parent", "Update");
        const result = noThenable(parentBound.Update(parentState, message), "parent.Update");
        if (!Array.isArray(result) || result.length !== 2) throw new TypeError("parent.Update must return [state,effects]");
        validateEffects(parent, result[1], parentBound, "parent");
        parentState = result[0];
        const input = outputToChildren();
        const nextSlots = currentSlots();
        reconcile(nextSlots, input, true);
      } else {
        const instance = children.get(slot.key);
        counts.childUpdate += 1;
        logCall("child", "Update", instance.slot);
        const result = noThenable(childBound.Update(instance.state, message), "child.Update");
        if (!Array.isArray(result) || result.length !== 2) throw new TypeError("child.Update must return [state,effects]");
        validateEffects(child, result[1], childBound, "child");
        instance.state = result[0];
        instance.publication = publication(instance);
        if (!isCurrent(slot.key, slot.generation)) throw new TypeError("child publication generation is no longer current");
        parentState = bridge("receiveKeyed", "parent", (state, payload) => parent.keyed.receiveKeyed(state, slot.key, slot.generation, payload), parentState, instance.publication, instance.slot);
      }
      makeViews();
      renderAll();
      const bridges = bridgeCalls.slice(bridgeStart).map((item) => cloneJSON(item));
      const calls = callOrder.slice(callsStart).map((item) => cloneJSON(item));
      const checkpoint = addCheckpoint(index, bridges, calls);
      events.push({ eventIndex: index, kind, target, key: slot?.key ?? null, generation: slot?.generation ?? null,
        action, message: cloneJSON(message), dispatched: true, suppressed: false, stale: false, dispatchId: id,
        bridgeCalls: bridges, callOrder: calls, callCountsBefore: before, callCountsAfter: { ...counts } });
      steps.push({ eventIndex: index, kind, target, key: slot?.key ?? null, generation: slot?.generation ?? null,
        action, message: cloneJSON(message), bridgeCalls: bridges, parent: cloneJSON(checkpoint.parent), children: cloneJSON(checkpoint.children) });
      return { accepted: true, dispatchId: id, eventIndex: index };
    } catch (error) {
      reportFailure(error);
      events.push({ eventIndex: index, kind, target, key: slot?.key ?? null, generation: slot?.generation ?? null,
        action, message: cloneJSON(message), dispatched: false, suppressed: false, stale: false, dispatchId: id,
        bridgeCalls: bridgeCalls.slice(bridgeStart).map((item) => cloneJSON(item)), callOrder: callOrder.slice(callsStart).map((item) => cloneJSON(item)),
        callCountsBefore: before, callCountsAfter: { ...counts }, error: failed.message });
      return { accepted: false, dispatchId: id, eventIndex: index, error: failed.message };
    } finally { busy = false; }
  }

  function directParent(action, message) { return dispatch("parent", action, message, null, renderEpoch); }
  function directChild(key, action, message) {
    const instance = children.get(key);
    if (!instance) return { accepted: false, stale: true, error: `child ${key} is not mounted` };
    return dispatch("child", action, message, instance.slot, renderEpoch);
  }

  function recordSuppressedAction(target, key, actionInput) {
    if (!active || failed) return { accepted: false, error: "keyed module host is not active" };
    if (busy) return { accepted: false, error: "reentrant module dispatch rejected" };
    if (target !== "parent" && target !== "child") return { accepted: false, error: "target must be parent or child" };
    const instance = target === "child" ? children.get(key) : null;
    if (target === "child" && !instance) return { accepted: false, stale: true, error: `child ${key} is not mounted` };
    let action;
    let resolved;
    try {
      action = actionRecord(actionInput);
      resolved = resolveCurrentMessage(target === "parent" ? parentView : instance.view, action, target);
    } catch (error) { return { accepted: false, error: error.message }; }
    if (!resolved.disabled && resolved.message !== null) return { accepted: false, error: "action is not suppressed by the current Go View" };
    const index = eventIndex++;
    events.push({ eventIndex: index, kind: "disabled-action", target, key: instance?.slot.key ?? null,
      generation: instance?.slot.generation ?? null, action, message: null, dispatched: false, suppressed: true, stale: false,
      bridgeCalls: [], callOrder: [], callCountsBefore: { ...counts }, callCountsAfter: { ...counts } });
    return { accepted: true, suppressed: true, eventIndex: index };
  }

  function replaceBackend(to) {
    if (!active || failed) throw new TypeError("keyed module host is not active");
    if (busy) throw new TypeError("reentrant renderer replacement rejected");
    const nextFactory = rendererFactory(renderers, to);
    if (to === backendName) return snapshot();
    const previousBackend = backendName;
    const nextEpoch = renderEpoch + 1;
    if (!Number.isSafeInteger(nextEpoch)) throw new TypeError("renderer epoch exceeded the safe integer range");
    const nextParentRoot = container.ownerDocument.createElement("div");
    nextParentRoot.setAttribute("data-gobi-module-root", "parent");
    let nextParentRenderer = null;
    const candidateChildren = new Map();
    let committed = false;
    try {
      const parentCandidate = nextFactory({ container: nextParentRoot, onFailure: reportFailure });
      try { nextParentRenderer = requireRenderer(parentCandidate, "parent", parentBound.component); }
      catch (error) { try { parentCandidate?.unmount?.(); } catch { /* preserve capability error */ } throw error; }
      for (const slot of slots) {
        const root = container.ownerDocument.createElement("div");
        root.setAttribute("data-gobi-module-root", `child-${slot.key}`);
        root.setAttribute("data-gobi-key", slot.key);
        root.setAttribute("data-gobi-generation", String(slot.generation));
        const candidate = nextFactory({ container: root, onFailure: reportFailure });
        let renderer;
        try { renderer = requireRenderer(candidate, `child ${slot.key}`, childBound.component); }
        catch (error) { try { candidate?.unmount?.(); } catch { /* preserve capability error */ } throw error; }
        candidateChildren.set(slot.key, { root, renderer, slot });
      }
      updateRenderer(nextParentRenderer, parentView, parentCallbacks(nextEpoch), "candidate parent");
      for (const slot of slots) {
        const instance = children.get(slot.key);
        const candidate = candidateChildren.get(slot.key);
        updateRenderer(candidate.renderer, instance.view, childCallbacks({ ...instance, renderer: candidate.renderer, root: candidate.root }, nextEpoch), `candidate child ${slot.key}`);
      }
      const previousParentRenderer = parentRenderer;
      const previousChildren = children;
      container.replaceChildren(nextParentRoot, ...slots.map((slot) => candidateChildren.get(slot.key).root));
      parentRoot = nextParentRoot;
      parentRenderer = nextParentRenderer;
      children = new Map(slots.map((slot) => [slot.key, { ...previousChildren.get(slot.key), ...candidateChildren.get(slot.key) }]));
      backendName = to;
      renderEpoch = nextEpoch;
      committed = true;
      try { noThenable(previousParentRenderer.unmount(), "old parent renderer.unmount()"); } catch (error) { reportFailure(error); }
      for (const instance of previousChildren.values()) {
        try { noThenable(instance.renderer.unmount(), "old child renderer.unmount()"); } catch (error) { reportFailure(error); }
      }
      if (failed) throw failed;
      events.push({ eventIndex: eventIndex++, kind: "renderer-swap", target: null, key: null, generation: null,
        action: null, message: null, dispatched: false, suppressed: false, stale: false, bridgeCalls: [], callOrder: [],
        callCountsBefore: { ...counts }, callCountsAfter: { ...counts }, from: previousBackend, to, rendererEpoch: renderEpoch });
      return snapshot();
    } catch (error) {
      if (!committed) {
        try { nextParentRenderer?.unmount(); } catch { /* preserve admission error */ }
        for (const candidate of candidateChildren.values()) { try { candidate.renderer.unmount(); } catch { /* preserve admission error */ } }
        throw error;
      }
      reportFailure(error);
      throw failed;
    }
  }

  function unmount() {
    if (!active) return false;
    active = false;
    renderEpoch += 1;
    let okay = true;
    try { noThenable(parentRenderer.unmount(), "parent renderer.unmount()"); } catch (error) { okay = false; reportFailure(error); }
    for (const instance of children.values()) {
      try { noThenable(instance.renderer.unmount(), "child renderer.unmount()"); } catch (error) { okay = false; reportFailure(error); }
      instance.root.remove?.();
    }
    children.clear();
    parentRoot.remove?.();
    return okay;
  }

  function mountedHandles() {
    return { parent: { root: parentRoot, renderer: parentRenderer },
      children: slots.map((slot) => {
        const instance = children.get(slot.key);
        return { key: slot.key, generation: slot.generation, root: instance.root, renderer: instance.renderer };
      }) };
  }

  function elementAtPath(target, key, path) {
    const actionPath = normalizePath(path);
    const root = target === "parent" ? parentRoot : target === "child" ? children.get(key)?.root : null;
    if (!root) return null;
    let element = root.firstElementChild ?? root.childNodes?.[0] ?? null;
    if (!element) return null;
    for (const index of actionPath) {
      const node = element.childNodes?.[index] ?? null;
      if (!node) return null;
      element = node;
    }
    return element;
  }

  function publishChild(key, generation, publicationRecord) {
    if (!Number.isSafeInteger(generation) || generation < 1) return { accepted: false, error: "generation must be a positive safe integer" };
    let clean;
    try { clean = assertPublicationRecord(publicationRecord); } catch (error) { return { accepted: false, error: error.message }; }
    return receivePublication(key, generation, clean, true, renderEpoch);
  }

  let initialParentCandidate = null;
  const initialRendererCandidates = [];
  try {
    initialParentCandidate = factory({ container: parentRoot, onFailure: reportFailure });
    parentRenderer = requireRenderer(initialParentCandidate, "parent", parentBound.component);
    // The finite profile starts with two children. Their renderers are admitted
    // before Init so capability failures cannot run application roles.
    const initialCandidates = ["a", "b"].map((key) => {
      const root = container.ownerDocument.createElement("div");
      root.setAttribute("data-gobi-module-root", `child-${key}`);
      root.setAttribute("data-gobi-key", key);
      childRoots.push(root);
      const candidate = factory({ container: root, onFailure: reportFailure });
      let renderer;
      try { renderer = requireRenderer(candidate, `child ${key}`, childBound.component); }
      catch (error) { try { candidate?.unmount?.(); } catch { /* preserve capability error */ } throw error; }
      initialRendererCandidates.push(renderer);
      return { key, root, renderer };
    });
    counts.parentInit += 1;
    logCall("parent", "Init");
    parentState = noThenable(parentBound.Init(), "parent.Init");
    const initialSlots = currentSlots();
    if (!sameJSON(initialSlots.map((slot) => slot.key), ["a", "b"])) throw new TypeError("keyed profile must initialize with ordered keys a,b");
    const input = outputToChildren();
    for (let index = 0; index < initialSlots.length; index += 1) {
      const slot = initialSlots[index];
      const candidate = initialCandidates.find((item) => item.key === slot.key);
      counts.childInit += 1;
      logCall("child", "Init", slot);
      const state = noThenable(childBound.Init(), "child.Init");
      const instance = { slot: { ...slot }, root: candidate.root, renderer: candidate.renderer, state, view: null, input: null, publication: null };
      children.set(slot.key, instance);
      inputChild(instance, input);
      instance.publication = publication(instance);
      parentState = bridge("receiveKeyed", "parent", (current, payload) => parent.keyed.receiveKeyed(current, slot.key, slot.generation, payload), parentState, instance.publication, slot);
    }
    slots = initialSlots.map((slot) => ({ ...slot }));
    makeViews();
    renderAll();
    container.replaceChildren(parentRoot, ...slots.map((slot) => children.get(slot.key).root));
    addCheckpoint(null, bridgeCalls.map((item) => cloneJSON(item)), callOrder.map((item) => cloneJSON(item)));
    return {
      dispatchParent: directParent,
      dispatchChild: directChild,
      dispatchGoMessage(target, message, options = null) {
        const opts = options === null ? Object.create(null) : exactRecord(options, ["key", "generation"], "dispatch options");
        const slot = target === "child" ? { key: opts.key, generation: opts.generation } : null;
        if (target === "child" && (!slot.key || !slot.generation)) return { accepted: false, error: "child dispatch requires key and generation" };
        return dispatchGoMessage(target, message, slot);
      },
      publishChild,
      recordSuppressedAction,
      snapshot,
      trace,
      replaceBackend,
      unmount,
      failure: () => failed === null ? null : { name: failed.name, message: failed.message },
      isUnmounted: () => !active,
      mountedHandles,
      elementAtPath,
    };
  } catch (error) {
    active = false;
    try { (parentRenderer ?? initialParentCandidate)?.unmount(); } catch { /* preserve the initial failure */ }
    for (const renderer of initialRendererCandidates) { try { renderer.unmount(); } catch { /* preserve the initial failure */ } }
    parentRoot.remove?.();
    for (const root of childRoots) root.remove?.();
    throw error;
  }
}
