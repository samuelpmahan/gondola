import { assertExactTraceValue } from "./compare.mjs";

export const TRACE_SCHEMA = "gobi.trace/v1";
export const HOST_SCRIPT_SCHEMA = "gobi.host-script/v1";

export class ContractViolation extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ContractViolation";
    this.path = path;
  }
}

function fail(path, message) {
  throw new ContractViolation(path, message);
}

function exactKeys(value, keys, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    const missing = expected.filter((key) => !Object.hasOwn(value, key));
    const extra = actual.filter((key) => !keys.includes(key));
    fail(path, `closed fields differ (missing: ${missing.join(",") || "none"}; extra: ${extra.join(",") || "none"})`);
  }
}

function string(value, path) {
  if (typeof value !== "string") fail(path, "expected string");
}

function nonEmptyString(value, path) {
  string(value, path);
  if (value.length === 0) fail(path, "must not be empty");
}

function nodePath(value, path) {
  string(value, path);
  if (value !== "" && !/^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(value)) {
    fail(path, "must be a slash-separated zero-based child path");
  }
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "expected array (null is distinct from empty)");
}

function message(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected message object");
  exactKeys(value, ["name", "arg"], path);
  string(value.name, `${path}.name`);
  string(value.arg, `${path}.arg`);
}

function action(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected action object");
  exactKeys(value, ["path", "event", "value"], path);
  nodePath(value.path, `${path}.path`);
  string(value.event, `${path}.event`);
  string(value.value, `${path}.value`);
}

function typeTable(types) {
  if (!Array.isArray(types)) fail("$.app.types", "expected app type table");
  const table = new Map();
  for (let index = 0; index < types.length; index += 1) {
    const info = types[index];
    const path = `$.app.types[${index}]`;
    if (!info || typeof info !== "object" || Array.isArray(info)) fail(path, "expected type info");
    nonEmptyString(info.id, `${path}.id`);
    if (table.has(info.id)) fail(`${path}.id`, `duplicate type ID ${JSON.stringify(info.id)}`);
    table.set(info.id, info);
  }
  for (let index = 0; index < types.length; index += 1) {
    const info = types[index];
    const path = `$.app.types[${index}]`;
    typeInfoShape(info, path);
    if (info.kind === "slice" || info.kind === "array") {
      if (!table.has(info.elemType)) fail(`${path}.elemType`, `undeclared element type ${JSON.stringify(info.elemType)}`);
      if (info.kind === "slice" && info.jsRepresentation === "float64-array-or-goscript-slice" && table.get(info.elemType).kind !== "float64") {
        fail(`${path}.jsRepresentation`, "float64 slice representation requires float64 elements");
      }
    }
    if (info.kind === "struct") {
      for (let fieldIndex = 0; fieldIndex < info.fields.length; fieldIndex += 1) {
        const field = info.fields[fieldIndex];
        if (!table.has(field.type)) fail(`${path}.fields[${fieldIndex}].type`, `undeclared field type ${JSON.stringify(field.type)}`);
      }
    }
  }
  return table;
}

function typeInfoShape(info, path) {
  const base = ["id", "kind", "jsRepresentation"];
  const expected = info.kind === "int" || info.kind === "uint" ? [...base, "bits"]
    : info.kind === "slice" ? [...base, "elemType"]
      : info.kind === "array" ? [...base, "elemType", "length"]
        : info.kind === "struct" ? [...base, "fields"] : base;
  exactKeys(info, expected, path);
  if (!["bool", "string", "int", "uint", "float64", "struct", "slice", "array"].includes(info.kind)) {
    fail(`${path}.kind`, `unknown type kind ${JSON.stringify(info.kind)}`);
  }
  const validRepresentations = {
    bool: ["direct"],
    string: ["direct"],
    int: ["number", "bigint"],
    uint: ["number", "bigint"],
    float64: ["number"],
    struct: ["class"],
    slice: ["goscript-slice", "array-or-goscript-slice", "float64-array-or-goscript-slice"],
    array: ["array"],
  }[info.kind];
  if (!validRepresentations.includes(info.jsRepresentation)) {
    fail(`${path}.jsRepresentation`, `invalid ${info.kind} representation ${JSON.stringify(info.jsRepresentation)}`);
  }
  if (expected.includes("bits") && ![8, 16, 32, 64].includes(info.bits)) fail(`${path}.bits`, "must be 8, 16, 32, or 64");
  if (expected.includes("elemType")) nonEmptyString(info.elemType, `${path}.elemType`);
  if (expected.includes("length") && (!Number.isSafeInteger(info.length) || info.length < 0)) fail(`${path}.length`, "must be a non-negative safe integer");
  if (expected.includes("fields")) {
    array(info.fields, `${path}.fields`);
    const names = new Set();
    for (let index = 0; index < info.fields.length; index += 1) {
      const field = info.fields[index];
      const fieldPath = `${path}.fields[${index}]`;
      exactKeys(field, ["name", "type"], fieldPath);
      string(field.name, `${fieldPath}.name`);
      nonEmptyString(field.type, `${fieldPath}.type`);
      if (names.has(field.name)) fail(`${fieldPath}.name`, "duplicate struct field name");
      names.add(field.name);
    }
  }
}

const payloadByKind = Object.freeze({
  bool: "bool",
  string: "string",
  int: "integer",
  uint: "integer",
  float64: "float64Bits",
  struct: "fields",
  slice: "items",
  array: "items",
});

function checkFloatBits(bits, path) {
  if (typeof bits !== "string" || !/^[0-9a-f]{16}$/.test(bits)) fail(path, "must be 16 lower-case hexadecimal IEEE-754 bits");
  const storage = new ArrayBuffer(8);
  const view = new DataView(storage);
  view.setBigUint64(0, BigInt(`0x${bits}`), false);
  if (!Number.isFinite(view.getFloat64(0, false))) fail(path, "non-finite float64 is unsupported");
}

function checkInteger(payload, kind, bits, path) {
  if (typeof payload !== "string" || !/^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(payload)) {
    fail(path, "must be an exact canonical base-10 integer string");
  }
  const integer = BigInt(payload);
  if (kind === "uint" && integer < 0n) fail(path, "unsigned integer cannot be negative");
  const min = kind === "uint" ? 0n : -(1n << BigInt(bits - 1));
  const max = kind === "uint" ? (1n << BigInt(bits)) - 1n : (1n << BigInt(bits - 1)) - 1n;
  if (integer < min || integer > max) fail(path, `outside ${kind}${bits} range`);
}

/** Validate a closed tagged Go Value using the app's declared type metadata. */
export function validateTypedValue(value, tableOrTypes, path = "$.state", active = new WeakSet()) {
  const table = tableOrTypes instanceof Map ? tableOrTypes : typeTable(tableOrTypes);
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected tagged Value object");
  if (active.has(value)) fail(path, "cyclic tagged Value is not a JSON trace value");
  active.add(value);
  try {
  nonEmptyString(value.typeId, `${path}.typeId`);
  const info = table.get(value.typeId);
  if (!info) fail(`${path}.typeId`, `undeclared type ID ${JSON.stringify(value.typeId)}`);
  typeInfoShape(info, `$.app.types[${value.typeId}]`);
  if (value.kind !== info.kind) fail(`${path}.kind`, `does not match declared kind ${info.kind}`);
  const payloadKey = payloadByKind[info.kind];
  if (!payloadKey) fail(`${path}.kind`, `unsupported kind ${JSON.stringify(info.kind)}`);
  const keys = ["typeId", "kind", payloadKey];
  if (info.kind === "slice") keys.push("isNil");
  exactKeys(value, keys, path);

  if (info.kind === "bool" && typeof value.bool !== "boolean") fail(`${path}.bool`, "expected boolean");
  if (info.kind === "string") string(value.string, `${path}.string`);
  if (info.kind === "int" || info.kind === "uint") checkInteger(value.integer, info.kind, info.bits, `${path}.integer`);
  if (info.kind === "float64") checkFloatBits(value.float64Bits, `${path}.float64Bits`);
  if (info.kind === "slice" || info.kind === "array") {
    if (info.kind === "slice" && typeof value.isNil !== "boolean") fail(`${path}.isNil`, "expected boolean");
    array(value.items, `${path}.items`);
    if (info.kind === "slice" && value.isNil && value.items.length !== 0) fail(`${path}.items`, "nil slice must have no items");
    if (info.kind === "array" && value.items.length !== info.length) fail(`${path}.items`, `array length must be ${info.length}`);
    const elemInfo = table.get(info.elemType);
    if (!elemInfo) fail(`$.app.types[${value.typeId}].elemType`, `undeclared type ID ${JSON.stringify(info.elemType)}`);
    for (let index = 0; index < value.items.length; index += 1) validateTypedValue(value.items[index], table, `${path}.items[${index}]`, active);
    for (let index = 0; index < value.items.length; index += 1) {
      if (value.items[index].typeId !== elemInfo.id) fail(`${path}.items[${index}].typeId`, `expected element type ${elemInfo.id}`);
    }
  }
  if (info.kind === "struct") {
    array(value.fields, `${path}.fields`);
    if (value.fields.length !== info.fields.length) fail(`${path}.fields`, "struct field count differs from declaration");
    for (let index = 0; index < info.fields.length; index += 1) {
      const expected = info.fields[index];
      const actual = value.fields[index];
      const fieldPath = `${path}.fields[${index}]`;
      exactKeys(actual, ["name", "value"], fieldPath);
      if (actual.name !== expected.name) fail(`${fieldPath}.name`, `expected declaration-order field ${JSON.stringify(expected.name)}`);
      validateTypedValue(actual.value, table, `${fieldPath}.value`, active);
      if (actual.value.typeId !== expected.type) fail(`${fieldPath}.value.typeId`, `expected declared field type ${expected.type}`);
    }
  }
  return true;
  } finally {
    active.delete(value);
  }
}

function validateEffect(effect, path) {
  exactKeys(effect, ["kind", "name", "arg", "reply"], path);
  string(effect.kind, `${path}.kind`);
  string(effect.name, `${path}.name`);
  string(effect.arg, `${path}.arg`);
  string(effect.reply, `${path}.reply`);
}

function validateRequest(request, path) {
  exactKeys(request, ["dispatchId", "effectIndex", "effect"], path);
  nonEmptyString(request.dispatchId, `${path}.dispatchId`);
  if (!Number.isSafeInteger(request.effectIndex) || request.effectIndex < 0) fail(`${path}.effectIndex`, "must be a non-negative safe integer");
  validateEffect(request.effect, `${path}.effect`);
}

function validateCompletion(completion, path) {
  exactKeys(completion, ["dispatchId", "effectIndex", "message"], path);
  nonEmptyString(completion.dispatchId, `${path}.dispatchId`);
  if (!Number.isSafeInteger(completion.effectIndex) || completion.effectIndex < 0) fail(`${path}.effectIndex`, "must be a non-negative safe integer");
  message(completion.message, `${path}.message`);
}

function validateBinding(binding, path) {
  exactKeys(binding, ["path", "event", "message", "source"], path);
  nodePath(binding.path, `${path}.path`);
  string(binding.event, `${path}.event`);
  string(binding.message, `${path}.message`);
  if (binding.source !== "target.value" && binding.source !== "target.checked") fail(`${path}.source`, "unknown binding source");
}

function validateDOM(dom, path) {
  if (dom === null) return;
  exactKeys(dom, ["normalization", "html", "controls"], path);
  if (dom.normalization !== "outerHTML-v1") fail(`${path}.normalization`, "unknown DOM normalization");
  string(dom.html, `${path}.html`);
  array(dom.controls, `${path}.controls`);
  for (let index = 0; index < dom.controls.length; index += 1) {
    const control = dom.controls[index];
    const controlPath = `${path}.controls[${index}]`;
    exactKeys(control, ["path", "key", "tag", "type", "value", "checked", "disabled"], controlPath);
    nodePath(control.path, `${controlPath}.path`);
    if (control.key !== null) string(control.key, `${controlPath}.key`);
    string(control.tag, `${controlPath}.tag`);
    string(control.type, `${controlPath}.type`);
    if (control.value !== null) string(control.value, `${controlPath}.value`);
    if (control.checked !== null && typeof control.checked !== "boolean") fail(`${controlPath}.checked`, "expected boolean or null");
    if (control.disabled !== null && typeof control.disabled !== "boolean") fail(`${controlPath}.disabled`, "expected boolean or null");
  }
}

/** Validate exact v1 trace fields, type-aware state, and dispatch/effect links. */
export function validateTrace(trace, app) {
  exactKeys(trace, ["schema", "appId", "ticks"], "$");
  if (trace.schema !== TRACE_SCHEMA) fail("$.schema", `expected ${TRACE_SCHEMA}`);
  nonEmptyString(trace.appId, "$.appId");
  if (!app || typeof app !== "object") fail("$.app", "app IR is required");
  const component = Array.isArray(app.components) ? app.components.find((entry) => entry.id === trace.appId) : null;
  if (!component) fail("$.appId", `unknown component ${JSON.stringify(trace.appId)}`);
  const types = typeTable(app.types);
  array(trace.ticks, "$.ticks");
  if (trace.ticks.length === 0) fail("$.ticks", "must include initialization tick 0");
  const dispatches = new Set();
  const requests = new Map();
  const completed = new Set();

  for (let index = 0; index < trace.ticks.length; index += 1) {
    const tick = trace.ticks[index];
    const path = `$.ticks[${index}]`;
    exactKeys(tick, ["index", "action", "message", "dispatchId", "state", "requestedEffects", "completedEffects", "view", "dom"], path);
    if (tick.index !== index) fail(`${path}.index`, `expected contiguous tick index ${index}`);
    if (index === 0) {
      if (tick.action !== null || tick.message !== null || tick.dispatchId !== null) fail(path, "tick 0 must be initialization with null action, message, and dispatchId");
      if (tick.requestedEffects?.length || tick.completedEffects?.length) fail(path, "initialization tick cannot request or complete effects");
    } else if (tick.action !== null) action(tick.action, `${path}.action`);
    else if (tick.message === null || tick.dispatchId === null) fail(path, "non-init reply tick requires message and dispatchId");
    if (tick.message !== null) message(tick.message, `${path}.message`);
    if (tick.dispatchId !== null) {
      nonEmptyString(tick.dispatchId, `${path}.dispatchId`);
      if (dispatches.has(tick.dispatchId)) fail(`${path}.dispatchId`, "dispatchId must be unique per actual Update call");
      dispatches.add(tick.dispatchId);
    }
    if (index > 0 && tick.action !== null && (tick.dispatchId === null) !== (tick.message === null)) {
      fail(path, "suppressed actions must have null message and dispatchId; dispatched actions need both");
    }
    validateTypedValue(tick.state, types, `${path}.state`);
    if (tick.state.typeId !== component.stateType) fail(`${path}.state.typeId`, `expected component state type ${component.stateType}`);
    array(tick.requestedEffects, `${path}.requestedEffects`);
    array(tick.completedEffects, `${path}.completedEffects`);
    for (let effectIndex = 0; effectIndex < tick.requestedEffects.length; effectIndex += 1) {
      const request = tick.requestedEffects[effectIndex];
      const requestPath = `${path}.requestedEffects[${effectIndex}]`;
      validateRequest(request, requestPath);
      if (request.effectIndex !== effectIndex) fail(`${requestPath}.effectIndex`, "effect indices must follow request order within a dispatch");
      if (tick.dispatchId === null || request.dispatchId !== tick.dispatchId) fail(`${requestPath}.dispatchId`, "request must belong to the current dispatch");
      const key = `${request.dispatchId}\u0000${request.effectIndex}`;
      if (requests.has(key)) fail(requestPath, "duplicate effect request correlation");
      requests.set(key, request);
    }
    for (let completionIndex = 0; completionIndex < tick.completedEffects.length; completionIndex += 1) {
      const item = tick.completedEffects[completionIndex];
      const completionPath = `${path}.completedEffects[${completionIndex}]`;
      validateCompletion(item, completionPath);
      if (tick.message === null || assertExactTraceValue(tick.message, item.message, `${completionPath}.message`) !== undefined) {
        fail(`${completionPath}.message`, "completion message must equal the reply delivered in this tick");
      }
      const key = `${item.dispatchId}\u0000${item.effectIndex}`;
      const request = requests.get(key);
      if (!request) fail(completionPath, "completion refers to an unknown or not-yet-requested effect");
      if (completed.has(key)) fail(completionPath, "effect completion must be delivered at most once");
      if (request.effect.reply !== item.message.name) fail(`${completionPath}.message.name`, "reply message name differs from requested effect reply name");
      completed.add(key);
    }
    if (index > 0 && tick.action === null && tick.completedEffects.length === 0) fail(`${path}.completedEffects`, "reply tick must identify its completed effect");
    if (tick.action !== null && tick.completedEffects.length !== 0) fail(`${path}.completedEffects`, "user-action tick cannot also be an effect reply tick");
    if (!tick.view || typeof tick.view !== "object" || Array.isArray(tick.view)) fail(`${path}.view`, "expected view record");
    exactKeys(tick.view, ["tree", "bindings"], `${path}.view`);
    // NodeRecord is compared as a closed ordered value against the independent Go trace.
    // Its nested wire schema is owned by gobi and intentionally not normalized here.
    if (!tick.view.tree || typeof tick.view.tree !== "object" || Array.isArray(tick.view.tree)) fail(`${path}.view.tree`, "expected NodeRecord object");
    array(tick.view.bindings, `${path}.view.bindings`);
    for (let bindingIndex = 0; bindingIndex < tick.view.bindings.length; bindingIndex += 1) {
      validateBinding(tick.view.bindings[bindingIndex], `${path}.view.bindings[${bindingIndex}]`);
    }
    validateDOM(tick.dom, `${path}.dom`);
  }
  return true;
}

/** Validate HostScript's closed shape and exact ordered request/completion correspondence. */
export function validateHostScript(script, trace) {
  exactKeys(script, ["schema", "steps"], "$.hostScript");
  if (script.schema !== HOST_SCRIPT_SCHEMA) fail("$.hostScript.schema", `expected ${HOST_SCRIPT_SCHEMA}`);
  array(script.steps, "$.hostScript.steps");
  const traceRequests = [];
  const traceCompletions = [];
  for (const tick of trace.ticks) {
    for (const request of tick.requestedEffects) traceRequests.push(request);
    for (const completion of tick.completedEffects) traceCompletions.push(completion);
  }
  const scriptedRequests = [];
  const scriptedCompletions = [];
  for (let index = 0; index < script.steps.length; index += 1) {
    const step = script.steps[index];
    const path = `$.hostScript.steps[${index}]`;
    exactKeys(step, ["request", "completion"], path);
    validateRequest(step.request, `${path}.request`);
    scriptedRequests.push(step.request);
    if (step.completion !== null) {
      message(step.completion, `${path}.completion`);
      scriptedCompletions.push({ dispatchId: step.request.dispatchId, effectIndex: step.request.effectIndex, message: step.completion });
    }
  }
  assertExactTraceValue(traceRequests, scriptedRequests, "$.hostScript.requestedEffects");
  assertExactTraceValue(traceCompletions, scriptedCompletions, "$.hostScript.completedEffects");
  return true;
}

/** Compare complete traces. Browser DOM is accepted only against explicit oracle snapshots. */
export function assertTraceMatch(expected, actual, { domSnapshots = null } = {}) {
  if (domSnapshots === null) return assertExactTraceValue(expected, actual);
  if (!Array.isArray(expected?.ticks) || !Array.isArray(actual?.ticks)) fail("$", "expected traces with tick arrays");
  if (expected.ticks.length !== actual.ticks.length || domSnapshots.length !== actual.ticks.length) {
    fail("$.ticks", "expected, actual, and DOM oracle tick counts must agree");
  }
  const left = structuredClone(expected);
  const right = structuredClone(actual);
  for (let index = 0; index < left.ticks.length; index += 1) {
    if (domSnapshots[index] === null) fail(`$.ticks[${index}].dom`, "browser DOM oracle must provide a snapshot for every tick");
    left.ticks[index].dom = null;
    right.ticks[index].dom = null;
    assertExactTraceValue(domSnapshots[index], actual.ticks[index].dom, `$.ticks[${index}].dom`);
  }
  return assertExactTraceValue(left, right);
}
