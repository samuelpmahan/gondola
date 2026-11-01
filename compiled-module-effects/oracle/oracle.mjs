import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const ORACLE_SCHEMA = "gobi.module-effects-oracle/v1";
export const SCENARIO_SCHEMA = "gobi.module-effects-scenario/v1";
export const NATIVE_SCHEMA = "gobi.module-effects-native/v1";
export const CAPTURE_SCHEMA = "gobi.module-effects-capture/v1";
export const BUILD_INDEX_SCHEMA = "gobi.module-effects-build-index/v1";
export const EXPECTED_SEEDS = Object.freeze([20261104, 20261105, 20261106]);
export const EXPECTED_EFFECTS = Object.freeze([
  Object.freeze({ kind: "fixture.request", name: "save", argument: "key:g<generation>:r<requestID>", reply: "complete" }),
  Object.freeze({ kind: "lifecycle.cancel", name: "cancel", argument: "key:g<generation>:r<requestID>", reply: "" }),
]);
export const EXPECTED_CLOSED_DESCRIPTORS = Object.freeze([
  Object.freeze({ kind: "fixture.request", name: "save", argument: "opaque active token: key:g<generation>:r<requestID>", reply: "complete" }),
  Object.freeze({ kind: "lifecycle.cancel", name: "cancel", argument: "opaque active token: key:g<generation>:r<requestID>", reply: "" }),
]);
export const EXPECTED_CAPABILITIES = Object.freeze([
  "effect.cancel", "effect.request-reply", "numeric.float64", "numeric.safe-integer", "view.node",
]);

const MAX_SAFE_ID = 9007199254740991;
const EVENT_LIMIT = 256;
const BUILD_PACKAGES = Object.freeze({
  parent: "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent",
  child: "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild",
});
const CHILD_STATE_TYPE = `${BUILD_PACKAGES.child}.State`;
const CORE_STATE_TYPE = "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild.State";
const EXPECTED_BOUNDARY_CASES = Object.freeze([
  Object.freeze({ name: "max-safe", arg: "a:g9007199254740991", operations: ["request", "complete"] }),
  Object.freeze({ name: "max-safe-cancel-retry", arg: "a:g9007199254740991", operations: ["request", "cancel", "request", "complete"] }),
  Object.freeze({ name: "max-safe-plus-one", arg: "a:g9007199254740992", operations: [] }),
  Object.freeze({ name: "zero", arg: "a:g0", operations: [] }),
  Object.freeze({ name: "leading-zero", arg: "a:g01", operations: [] }),
  Object.freeze({ name: "malformed", arg: "a:g1x", operations: [] }),
  Object.freeze({ name: "uint64-max", arg: "a:g18446744073709551615", operations: [] }),
  Object.freeze({ name: "uint64-overflow", arg: "a:g18446744073709551616", operations: [] }),
  Object.freeze({ name: "non-ascii-digit", arg: "a:g١", operations: [] }),
  Object.freeze({ name: "other-byte", arg: "a:g1!", operations: [] }),
]);

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function equal(expected, actual, path) {
  if (!isDeepStrictEqual(expected, actual)) {
    fail(path, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function record(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function attr(name, value, flag = false) {
  return { name, value, flag, style: null };
}

function textNode(value) {
  return { kind: 2, tag: "", key: "", attrs: null, on: null, kids: null, text: String(value) };
}

function element(tag, { key = "", attrs = null, on = null, kids = null } = {}) {
  return { kind: 1, tag, key, attrs, on, kids, text: "" };
}

function classAttr(className) {
  return [attr("class", className)];
}

function paragraph(className, children, key = "") {
  return element("p", { key, attrs: className ? classAttr(className) : null, kids: children });
}

function button(label, message, arg = "", disabled = false, className = undefined, key = "") {
  const attrs = className ? classAttr(className) : null;
  const finalAttrs = disabled ? [...(attrs ?? []), attr("disabled", "", true)] : attrs;
  return element("button", {
    key,
    attrs: finalAttrs,
    on: [{ event: "click", message, arg }],
    kids: [textNode(label)],
  });
}

function parentView(model) {
  const { parentState, controllerState } = model;
  const children = model.order.map((key) => model.children.get(key)).filter(Boolean);
  const published = parentState.publishedRevision > 0
    ? `Published count ${parentState.publishedCount} at revision ${parentState.publishedRevision}`
    : "No publication";
  const controls = element("section", {
    key: "keyed-membership-controls",
    attrs: classAttr("keyed-membership-controls"),
    kids: [
      button("Mount a", "child.add", "a", controllerState.a.mounted || controllerState.childCount >= 2, "keyed-a-child.add"),
      button("Remove a", "child.remove", "a", !controllerState.a.mounted, "keyed-a-child.remove"),
      button("Mount b", "child.add", "b", controllerState.b.mounted || controllerState.childCount >= 2, "keyed-b-child.add"),
      button("Remove b", "child.remove", "b", !controllerState.b.mounted, "keyed-b-child.remove"),
      button("Reorder children", "children.reorder", children.length === 2
        ? `${children[1].key},${children[0].key}` : (children[0]?.key === "a" ? "b,a" : "a,b"),
      controllerState.childCount !== 2, "keyed-reorder-children"),
    ],
  });
  const summaries = element("section", {
    key: "keyed-child-summaries",
    attrs: classAttr("keyed-child-summaries"),
    kids: children.map((child) => {
      const slot = controllerState[child.key];
      const label = `${child.key} generation ${child.generation} publication count ${slot.publishedCount}` +
        (slot.publishedRevision > 0 ? ` at revision ${slot.publishedRevision}` : "");
      return paragraph("keyed-child-summary", [textNode(label)], child.key);
    }),
  });
  const parent = parentState;
  return element("main", {
    key: "keyed-module-parent",
    attrs: classAttr("compiled-module-parent"),
    kids: [
      paragraph("module-parent-step", [textNode("Step: "), textNode(parent.step)]),
      button("Step −", "step.down", "", parent.step <= 1, "module-step-down"),
      button("Step +", "step.up", "", parent.step >= 3, "module-step-up"),
      button(parent.locked ? "Locked" : "Unlocked", "lock.toggle", "", false, "module-lock-toggle"),
      button("Reset input", "input.reset", "", false, "module-input-reset"),
      paragraph("module-parent-publication", [textNode(published)]),
      controls,
      summaries,
    ],
  });
}

function childView(child) {
  const effect = child.effectState;
  const core = effect.Core;
  const status = effect.Pending ? "Saving" : effect.Reply ? `Saved: ${effect.Reply}` : "Ready";
  const counter = element("div", {
    attrs: classAttr("counter"),
    kids: [
      paragraph("", [textNode("Count: "), textNode(core.Counter.Count)]),
      button("+", "add", "", !effect.Mounted || core.Locked, "add"),
      button("Reset", "reset", "", !effect.Mounted || core.Counter.Count === 0),
    ],
  });
  const controls = element("section", {
    key: "effect-request-controls",
    attrs: classAttr("effect-request-controls"),
    kids: [
      button("Save", "request", "", !effect.Mounted || effect.Pending, undefined, "effect-request"),
      button("Cancel", "cancel", "", !effect.Mounted || !effect.Pending, undefined, "effect-cancel"),
    ],
  });
  return element("section", {
    key: "module-child",
    attrs: classAttr("compiled-module-child"),
    kids: [
      paragraph("module-child-input", [
        textNode("Step: "), textNode(core.Step), textNode("; "), textNode(core.Locked ? "Locked" : "Unlocked"),
        textNode("; input revision: "), textNode(core.InputRevision),
      ]),
      paragraph("module-child-publication", [textNode("Child publication count: "), textNode(core.Counter.Count)]),
      counter,
      controls,
      paragraph("effect-request-status", [textNode(status)]),
    ],
  });
}

function modelView(model, key = undefined) {
  return key === undefined ? parentView(model) : childView(model.children.get(key));
}

function readPath(root, path) {
  const indexes = path === "" ? [] : path.split("/").map((part) => {
    if (!/^(0|[1-9]\d*)$/.test(part)) fail("scenario.action.path", `invalid view path ${JSON.stringify(path)}`);
    return Number(part);
  });
  let node = root;
  for (const index of indexes) {
    if (!Array.isArray(node?.kids) || index >= node.kids.length) fail("scenario.action.path", `path ${JSON.stringify(path)} does not resolve`);
    node = node.kids[index];
  }
  return node;
}

function isDisabled(node) {
  return (node?.attrs ?? []).some((item) => item?.name === "disabled" && item?.flag === true);
}

function messageForClick(model, event, index) {
  const root = modelView(model, event.target === "child" ? event.key : undefined);
  if (event.target !== "parent" && event.target !== "child") fail(`scenario.events[${index}].target`, "must be parent or child");
  if (event.target === "child") {
    const child = model.children.get(event.key);
    if (!child || child.effectState.Generation !== event.generation || !child.effectState.Mounted) {
      fail(`scenario.events[${index}]`, `child ${event.key} generation ${event.generation} is not current`);
    }
  }
  const node = readPath(root, event.action?.path ?? "");
  const handlers = node?.on ?? [];
  if (handlers.length !== 1 || handlers[0].event !== event.action?.event) {
    fail(`scenario.events[${index}].action`, "path does not identify one matching Go click handler");
  }
  return { message: { name: handlers[0].message, arg: handlers[0].arg }, disabled: isDisabled(node) };
}

function newEffectState(key, generation, input) {
  return {
    Core: {
      Counter: { Count: 0 }, Step: input.step, Locked: input.locked, InputRevision: input.revision,
    },
    Key: key,
    Generation: generation,
    Mounted: true,
    RequestID: 0,
    Pending: false,
    Token: "",
    Reply: "",
  };
}

function slot(key, generation = 1, mounted = true, publishedCount = 0, publishedRevision = 0) {
  return { key, generation, mounted, publishedCount, publishedRevision };
}

function initialModel() {
  const model = {
    parentState: { step: 1, locked: false, revision: 1, publishedCount: 0, publishedRevision: 0 },
    controllerState: {
      a: slot("a", 1, true, 0, 1), b: slot("b", 1, true, 0, 1),
      first: "a", second: "b", childCount: 2,
    },
    order: ["a", "b"],
    children: new Map(),
    transportPending: new Map(),
    transportStatuses: new Map(),
    retainedCallbacks: new Set(),
    renderer: "dom",
    expectedRetirements: [],
  };
  const input = { step: 1, locked: false, revision: 1 };
  for (const key of model.order) {
    const child = { key, generation: 1, input: clone(input), effectState: newEffectState(key, 1, input) };
    model.children.set(key, child);
  }
  return model;
}

function publicationFor(child) {
  return {
    key: child.key,
    generation: child.generation,
    count: child.effectState.Core.Counter.Count,
    revision: child.effectState.Core.InputRevision,
  };
}

function publish(model, child) {
  const target = model.controllerState[child.key];
  if (!target?.mounted || target.generation !== child.generation) return;
  target.publishedCount = child.effectState.Core.Counter.Count;
  target.publishedRevision = child.effectState.Core.InputRevision;
}

function childModel(key, effectState) {
  const core = effectState.Core;
  return {
    key,
    generation: effectState.Generation,
    input: { step: core.Step, locked: core.Locked, revision: core.InputRevision },
    childState: { count: core.Counter.Count, step: core.Step, locked: core.Locked, inputRevision: core.InputRevision },
    effectState: clone(effectState),
    publication: publicationFor({ key, generation: effectState.Generation, effectState }),
  };
}

function parentGoState(model) {
  const convert = (item) => ({
    Key: item.key, Generation: item.generation, Mounted: item.mounted,
    PublishedCount: item.publishedCount, PublishedRevision: item.publishedRevision,
  });
  return {
    Parent: {
      Step: model.parentState.step, Locked: model.parentState.locked, Revision: model.parentState.revision,
      PublishedCount: model.parentState.publishedCount, PublishedRevision: model.parentState.publishedRevision,
    },
    A: convert(model.controllerState.a), B: convert(model.controllerState.b),
    First: model.controllerState.first, Second: model.controllerState.second, ChildCount: model.controllerState.childCount,
  };
}

function childGoState(child) {
  return clone(child.effectState);
}

function snapshotModel(model) {
  const children = model.order.map((key) => model.children.get(key)).filter(Boolean).map((child) => ({
    ...childModel(child.key, child.effectState),
    view: childView(child),
  }));
  const parentGo = parentGoState(model);
  const nativeState = {
    parent: parentGo,
    children: children.map((child) => ({
      key: child.key,
      generation: child.generation,
      state: clone(child.effectState),
      view: clone(child.view),
      publication: { Count: child.publication.count, Revision: child.publication.revision },
    })),
    parentView: parentView(model),
  };
  return {
    parentState: clone(model.parentState),
    controllerState: clone(model.controllerState),
    children,
    effectPending: [...model.transportPending.entries()].map(([token, item]) => ({ token, key: item.key,
      generation: item.generation, effect: requestEffect(token) })),
    parentGoState: parentGo,
    childGoStates: children.map((child) => ({ key: child.key, generation: child.generation,
      state: childGoState(model.children.get(child.key)) })),
    parentView: parentView(model),
    nativeState,
  };
}

function requestEffect(token) {
  return { kind: "fixture.request", name: "save", arg: token, reply: "complete" };
}

function cancelEffect(token) {
  return { kind: "lifecycle.cancel", name: "cancel", arg: token, reply: "" };
}

function updateChild(model, child, message) {
  const effect = child.effectState;
  const core = effect.Core;
  const effects = [];
  let accepted = true;
  if (message.name === "add" && message.arg === "" && !core.Locked && [1, 2, 3].includes(core.Step) &&
      core.Counter.Count <= MAX_SAFE_ID - core.Step) {
    core.Counter.Count += core.Step;
  } else if (message.name === "reset" && message.arg === "" && core.Counter.Count > 0) {
    core.Counter.Count = 0;
  } else if (message.name === "request" && message.arg === "" && effect.Mounted && !effect.Pending && effect.RequestID < MAX_SAFE_ID) {
    effect.RequestID += 1;
    effect.Pending = true;
    effect.Token = `${effect.Key}:g${effect.Generation}:r${effect.RequestID}`;
    effect.Reply = "";
    model.transportPending.set(effect.Token, { key: child.key, generation: child.generation, requestID: effect.RequestID });
    model.transportStatuses.set(effect.Token, { key: child.key, generation: child.generation, requestID: effect.RequestID, status: "pending" });
    effects.push(requestEffect(effect.Token));
  } else if (message.name === "cancel" && message.arg === "" && effect.Mounted && effect.Pending && effect.Token) {
    const token = effect.Token;
    effect.Pending = false;
    model.transportPending.delete(token);
    model.transportStatuses.set(token, { ...model.transportStatuses.get(token), status: "cancelled" });
    model.retainedCallbacks.add(token);
    effects.push(cancelEffect(token));
  } else if (message.name === "complete") {
    if (effect.Mounted && effect.Pending && effect.Token === message.arg) {
      effect.Pending = false;
      effect.Reply = message.arg;
      model.transportPending.delete(message.arg);
      model.transportStatuses.set(message.arg, { ...model.transportStatuses.get(message.arg), status: "completed" });
    } else {
      accepted = false;
    }
  }
  publish(model, child);
  return { accepted, effects };
}

function mountChild(model, key) {
  const target = model.controllerState[key];
  const input = { step: model.parentState.step, locked: model.parentState.locked, revision: model.parentState.revision };
  target.mounted = true;
  target.publishedCount = 0;
  target.publishedRevision = 0;
  const child = { key, generation: target.generation, input: clone(input), effectState: newEffectState(key, target.generation, input) };
  model.children.set(key, child);
  publish(model, child);
}

function removeChild(model, key) {
  const child = model.children.get(key);
  const target = model.controllerState[key];
  if (!child || !target.mounted) return [];
  const effects = [];
  const effectState = child.effectState;
  const before = clone(effectState);
  if (effectState.Pending) {
    const token = effectState.Token;
    effectState.Mounted = false;
    effectState.Pending = false;
    model.transportPending.delete(token);
    model.transportStatuses.set(token, { ...model.transportStatuses.get(token), status: "cancelled" });
    model.retainedCallbacks.add(token);
    effects.push(cancelEffect(token));
  } else {
    effectState.Mounted = false;
    effectState.Pending = false;
  }
  model.expectedRetirements.push({ eventIndex: model.currentEventIndex, key, generation: child.generation,
    before, after: clone(effectState), effects: clone(effects) });
  target.mounted = false;
  model.order = model.order.filter((item) => item !== key);
  model.children.delete(key);
  if (model.controllerState.childCount === 2) {
    model.controllerState.first = model.controllerState.first === key ? model.controllerState.second : model.controllerState.first;
    model.controllerState.second = "";
  } else {
    model.controllerState.first = "";
    model.controllerState.second = "";
  }
  model.controllerState.childCount = Math.max(0, model.controllerState.childCount - 1);
  return effects;
}

function parentMessage(model, message) {
  const effects = [];
  if (message.name === "child.remove") {
    effects.push(...removeChild(model, message.arg));
    return effects;
  }
  if (message.name === "child.add") {
    const target = model.controllerState[message.arg];
    if (target && !target.mounted && model.controllerState.childCount < 2 && target.generation < MAX_SAFE_ID) {
      target.generation += 1;
      target.mounted = true;
      if (model.controllerState.childCount === 0) model.controllerState.first = message.arg;
      else model.controllerState.second = message.arg;
      model.controllerState.childCount += 1;
      model.order.push(message.arg);
      mountChild(model, message.arg);
    }
  } else if (message.name === "children.reorder") {
    if (message.arg === "a,b" || message.arg === "b,a") {
      model.order = message.arg.split(",");
      [model.controllerState.first, model.controllerState.second] = model.order;
    }
  }
  return effects;
}

function parseToken(token) {
  const match = /^(a|b):g([1-9]\d*):r([1-9]\d*)$/.exec(token);
  if (!match) return null;
  const generation = Number(match[2]);
  const requestID = Number(match[3]);
  if (!Number.isSafeInteger(generation) || generation > MAX_SAFE_ID ||
      !Number.isSafeInteger(requestID) || requestID > MAX_SAFE_ID) return null;
  return { key: match[1], generation, requestID };
}

function applyScenarioEvent(model, event, eventIndex, priorEvents = []) {
  model.currentEventIndex = eventIndex;
  const result = {
    eventIndex, kind: event.kind, declaredMessage: null, message: null,
    accepted: false, effects: [], goCall: false, replyStatus: null,
  };
  for (const field of ["target", "key", "generation", "action", "token", "to", "sourceEvent"]) {
    if (event[field] !== undefined) result[field] = clone(event[field]);
  }
  if (event.kind === "click") {
    const { message, disabled } = messageForClick(model, event, eventIndex);
    result.declaredMessage = clone(message);
    result.accepted = !disabled;
    if (result.accepted) {
      result.message = clone(message);
      result.goCall = true;
      if (event.target === "parent") result.effects = parentMessage(model, message);
      else {
        const child = model.children.get(event.key);
        const childResult = updateChild(model, child, message);
        result.accepted = childResult.accepted;
        result.effects = childResult.effects;
        if (!result.accepted) result.message = null;
      }
    }
  } else if (event.kind === "transport-reply") {
    const parsed = parseToken(event.token);
    const pending = model.transportPending.get(event.token);
    if (parsed && pending && parsed.key === pending.key && parsed.generation === pending.generation && parsed.requestID === pending.requestID) {
      const child = model.children.get(parsed.key);
      if (child && child.generation === parsed.generation && child.effectState.Pending && child.effectState.Token === event.token) {
        result.message = { name: "complete", arg: event.token };
        result.declaredMessage = clone(result.message);
        result.goCall = true;
        const completion = updateChild(model, child, result.message);
        result.accepted = completion.accepted;
        result.replyStatus = result.accepted ? "accepted" : "rejected-go-guard";
      }
    }
    if (!result.goCall) {
      result.accepted = false;
      const transportStatus = model.transportStatuses.get(event.token)?.status;
      result.replyStatus = transportStatus === "cancelled" ? "rejected-cancelled"
        : transportStatus === "completed" ? "rejected-duplicate" : "rejected-unknown";
    }
  } else if (event.kind === "renderer-swap") {
    if (!new Set(["react", "dom"]).has(event.to)) fail(`scenario.events[${eventIndex}].to`, "must be react or dom");
    const from = model.renderer;
    model.renderer = event.to;
    result.rendererSwap = { from, to: event.to, target: "root" };
    result.replyStatus = "renderer-swap-no-go-state-change";
  } else if (event.kind === "stale-callback") {
    result.declaredMessage = clone(priorEvents[event.sourceEvent]?.declaredMessage ?? null);
    result.replyStatus = "stale-renderer-callback-suppressed";
  } else {
    fail(`scenario.events[${eventIndex}].kind`, `unsupported kind ${JSON.stringify(event.kind)}`);
  }
  result.state = snapshotModel(model);
  result.renderer = model.renderer;
  result.transportPending = [...model.transportPending.keys()];
  result.retirements = clone(model.expectedRetirements);
  return result;
}

const FIXED_LITERAL_INTENTS = Object.freeze([
  ["click", "child", "a", 1, "2/2"], ["click", "child", "a", 1, "2/1"],
  ["click", "child", "a", 1, "3/0"], ["click", "child", "b", 1, "3/0"],
  ["click", "child", "a", 1, "3/1"], ["click", "child", "a", 1, "3/0"],
  ["transport-reply", "b:g1:r1"], ["transport-reply", "b:g1:r1"],
  ["transport-reply", "a:g1:r1"], ["transport-reply", "a:g1:r2"],
  ["click", "child", "a", 1, "3/0"], ["renderer-swap", "react"],
  ["transport-reply", "a:g1:r3"], ["click", "child", "a", 1, "3/0"],
  ["click", "child", "a", 1, "3/0"], ["click", "parent", "", 0, "6/1"],
  ["click", "parent", "", 0, "6/0"], ["click", "child", "a", 2, "3/0"],
  ["transport-reply", "a:g1:r4"], ["stale-callback", "a", 1, 13],
  ["transport-reply", "a:g2:r1"], ["transport-reply", "a:g2:r1"],
  ["click", "child", "b", 1, "2/1"], ["click", "child", "a", 2, "2/1"],
  ["click", "child", "a", 2, "2/2"], ["click", "child", "a", 2, "2/2"],
  ["click", "child", "a", 2, "3/0"], ["renderer-swap", "dom"],
  ["transport-reply", "a:g2:r2"], ["click", "child", "b", 1, "3/0"],
  ["transport-reply", "b:g1:r2"],
]);

function eventIntent(event) {
  if (event.kind === "click") return ["click", event.target, event.key ?? "", event.generation ?? 0, event.action?.path ?? ""];
  if (event.kind === "transport-reply") return ["transport-reply", event.token ?? ""];
  if (event.kind === "renderer-swap") return ["renderer-swap", event.to ?? ""];
  if (event.kind === "stale-callback") return ["stale-callback", event.key ?? "", event.generation ?? 0, event.sourceEvent ?? -1];
  return [event.kind ?? ""];
}

function eventFromIntent(intent) {
  if (intent[0] === "click") {
    const [, target, key, generation, path] = intent;
    const event = { kind: "click", target, action: { path, event: "click", value: "" } };
    if (target === "child") {
      event.key = key;
      event.generation = generation;
    }
    return event;
  }
  if (intent[0] === "transport-reply") return { kind: "transport-reply", token: intent[1] };
  if (intent[0] === "renderer-swap") return { kind: "renderer-swap", to: intent[1] };
  if (intent[0] === "stale-callback") return { kind: "stale-callback", key: intent[1], generation: intent[2], sourceEvent: intent[3] };
  fail("scenario.events", `unknown intent kind ${intent[0]}`);
}

function expectedNativeEvent(event, source) {
  const result = { index: event.eventIndex, kind: event.kind };
  if (source.target !== undefined) result.target = source.target;
  if (source.key !== undefined) result.key = source.key;
  if (source.generation !== undefined) result.generation = source.generation;
  if (source.action !== undefined) result.action = clone(source.action);
  if (source.token !== undefined) result.token = source.token;
  if (source.to !== undefined) result.to = source.to;
  if (source.sourceEvent !== undefined) result.sourceEvent = source.sourceEvent;
  if (event.declaredMessage !== null) result.message = clone(event.declaredMessage);
  result.accepted = event.accepted;
  result.stateIndex = event.stateIndex;
  result.effectIndices = clone(event.effectIndices);
  if (event.kind === "transport-reply") result.transportOutcome = event.replyStatus;
  if (event.kind === "stale-callback") result.transportOutcome = "rejected-stale-generation";
  if (event.rendererSwap) result.rendererSwap = clone(event.rendererSwap);
  return result;
}

function eventNativeExpected(event, nativeRow) {
  const declaredMessage = nativeRow.message ? { name: nativeRow.message.name, arg: nativeRow.message.arg ?? "" } : null;
  let message = null;
  if (event.kind === "click" && nativeRow.accepted === true) message = clone(declaredMessage);
  if (event.kind === "transport-reply" && nativeRow.accepted === true) message = { name: "complete", arg: event.token };
  return {
    accepted: nativeRow.accepted === true,
    declaredMessage,
    message,
    stateIndex: nativeRow.stateIndex ?? nativeRow.index,
    effectIndices: clone(nativeRow.effectIndices ?? []),
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function expectedSeedSuffix(seed, count = 12) {
  const random = seededRandom(seed);
  const operations = ["request-a", "request-b", "add-a", "reset-a", "add-b", "reset-b"];
  const requestIDs = { a: 2, b: 2 };
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const operation = operations[Math.floor(random() * operations.length)];
    const key = operation.at(-1);
    const generation = key === "a" ? 2 : 1;
    if (operation.startsWith("request-")) {
      requestIDs[key] += 1;
      result.push(["click", "child", key, generation, "3/0"]);
      result.push(["transport-reply", `${key}:g${generation}:r${requestIDs[key]}`]);
    } else {
      result.push(["click", "child", key, generation, operation.startsWith("add-") ? "2/1" : "2/2"]);
    }
  }
  return result;
}

function expectedNativeTransportLedger(events, effects) {
  const byToken = new Map();
  const ledger = [];
  const effectByIndex = new Map(effects.map((item) => [item.index, item]));
  const push = (eventIndex, action, token, status, effectIndex, outcome, identity = undefined) => {
    const item = identity ?? byToken.get(token);
    const entry = { sequence: ledger.length, eventIndex, action, token };
    if (item) {
      entry.key = item.key;
      entry.generation = item.generation;
    }
    entry.effectIndex = effectIndex;
    entry.status = status;
    entry.outcome = outcome;
    ledger.push(entry);
  };
  for (const event of events) {
    for (const index of event.effectIndices) {
      const item = effectByIndex.get(index);
      const token = item.effect.arg;
      if (item.effect.kind === "fixture.request") {
        const identity = { key: item.key, generation: item.generation, effectIndex: index, status: "pending" };
        byToken.set(token, identity);
        push(event.eventIndex, "start", token, "pending", index, "accepted", identity);
      } else if (item.effect.kind === "lifecycle.cancel") {
        const current = byToken.get(token);
        if (!current || current.status !== "pending") fail(`events[${event.eventIndex}].effects`, `cancel token ${token} has no pending request`);
        current.status = "cancelled";
        push(event.eventIndex, "cancel", token, "cancelled", index, "accepted", current);
      } else {
        fail(`effects[${index}].kind`, `unknown typed effect ${item.effect.kind}`);
      }
    }
    if (event.kind === "transport-reply") {
      const current = byToken.get(event.token);
      if (!current) {
        push(event.eventIndex, "reject-unknown", event.token, "unknown", -1, "rejected-unknown");
      } else if (current.status === "pending") {
        current.status = "completed";
        push(event.eventIndex, "complete", event.token, "completed", current.effectIndex, "accepted", current);
      } else if (current.status === "cancelled") {
        push(event.eventIndex, "reject-cancelled", event.token, "cancelled", current.effectIndex, "rejected-cancelled", current);
      } else if (current.status === "completed") {
        push(event.eventIndex, "reject-duplicate", event.token, "completed", current.effectIndex, "rejected-duplicate", current);
      }
    }
  }
  return ledger;
}

function expectedRetiredChildren(events) {
  const retired = [];
  for (const event of events) {
    for (const item of event.retirements.filter((candidate) => candidate.eventIndex === event.eventIndex)) {
      retired.push({ key: item.key, generation: item.generation, state: clone(item.after),
        view: childView({ key: item.key, generation: item.generation, effectState: item.after }),
        publication: { Count: item.after.Core.Counter.Count, Revision: item.after.Core.InputRevision } });
    }
  }
  return retired;
}

function expectedNativeLifecycleLedger(events) {
  const rows = [];
  const push = (eventIndex, action, key, generation, fields = {}) => {
    rows.push({ sequence: rows.length, eventIndex, action, key, generation, ...fields });
  };
  for (const event of events) {
    for (const item of event.retirements.filter((candidate) => candidate.eventIndex === event.eventIndex)) {
      const cancellation = item.effects[0];
      const effectIndex = cancellation ? event.effectIndices[0] : -1;
      push(event.eventIndex, "go.update.unmount", item.key, item.generation, {
        message: { name: "unmount", arg: `${item.key}:g${item.generation}` },
        state: clone(item.before), effectIndex: -1,
      });
      push(event.eventIndex, "go.state.unmounted", item.key, item.generation, {
        state: clone(item.after), effectIndex: -1,
      });
      if (cancellation) {
        push(event.eventIndex, "go.effect.cancel", item.key, item.generation, {
          state: clone(item.after), effectIndex, token: cancellation.arg,
        });
        push(event.eventIndex, "transport.cancel", item.key, item.generation, {
          effectIndex, token: cancellation.arg,
        });
      }
      push(event.eventIndex, "renderer.teardown", item.key, item.generation, { effectIndex: -1 });
    }
  }
  return rows;
}

export function deriveExpectedReplay(scenario) {
  record(scenario, "scenario");
  equal(SCENARIO_SCHEMA, scenario.schema, "scenario.schema");
  if (scenario.name !== "module-effects-literal" && !/^module-effects-seed-\d+$/.test(scenario.name ?? "")) {
    fail("scenario.name", "must identify the pinned literal or one of the pinned seeds");
  }
  const events = array(scenario.events, "scenario.events");
  if (events.length < FIXED_LITERAL_INTENTS.length || events.length > EVENT_LIMIT) {
    fail("scenario.events.length", `must be between ${FIXED_LITERAL_INTENTS.length} and ${EVENT_LIMIT}`);
  }
  const intents = events.map(eventIntent);
  const expectedIntents = [...FIXED_LITERAL_INTENTS];
  for (let index = 0; index < FIXED_LITERAL_INTENTS.length; index += 1) {
    equal(FIXED_LITERAL_INTENTS[index], intents[index], `scenario.events[${index}].intent`);
  }
  if (scenario.name === "module-effects-literal") {
    equal(FIXED_LITERAL_INTENTS.length, events.length, "scenario.events.length");
  } else {
    const seed = Number(scenario.name.slice("module-effects-seed-".length));
    if (!EXPECTED_SEEDS.includes(seed)) fail("scenario.name", `seed ${seed} is not one of the pinned literal seeds`);
    const suffix = expectedSeedSuffix(seed);
    equal(suffix, intents.slice(FIXED_LITERAL_INTENTS.length), "scenario.events.seededSuffix");
    expectedIntents.push(...suffix);
  }
  const canonicalEvents = expectedIntents.map(eventFromIntent);
  equal(canonicalEvents, events, "scenario.events");

  const model = initialModel();
  const initial = snapshotModel(model);
  const replayed = [];
  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    replayed.push(applyScenarioEvent(model, events[eventIndex], eventIndex, replayed));
  }
  let effectIndex = 0;
  const effectRecords = [];
  for (const event of replayed) {
    event.stateIndex = event.eventIndex + 1;
    event.effectIndices = [];
    for (const effect of event.effects) {
      const parsed = parseToken(effect.arg);
      if (!parsed) fail(`events[${event.eventIndex}].effects`, "effect token is malformed");
      event.effectIndices.push(effectIndex);
      effectRecords.push({ index: effectIndex, eventIndex: event.eventIndex, key: parsed.key,
        generation: parsed.generation, effect: clone(effect) });
      effectIndex += 1;
    }
    event.message = event.message ? clone(event.message) : null;
    event.declaredMessage = event.declaredMessage ? clone(event.declaredMessage) : null;
  }
  const transportLedger = expectedNativeTransportLedger(replayed, effectRecords);
  const lifecycleLedger = expectedNativeLifecycleLedger(replayed, effectRecords);
  const retiredChildren = expectedRetiredChildren(replayed);
  const pendingTransports = [...model.transportStatuses.entries()]
    .filter(([, item]) => item.status === "pending")
    .map(([token, item]) => ({ token, key: item.key, generation: item.generation,
      effectIndex: effectRecords.find((row) => row.effect.arg === token)?.index ?? -1 }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.generation - right.generation || left.token.localeCompare(right.token));
  return {
    schema: ORACLE_SCHEMA,
    name: scenario.name,
    scenarioSHA256: sha256(Buffer.from(JSON.stringify(scenario))),
    initial,
    events: replayed,
    final: replayed.at(-1)?.state ?? initial,
    effects: effectRecords,
    transportLedger,
    lifecycleLedger,
    retiredChildren,
    pendingTransports,
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertNativeCapture(actual, expected) {
  record(actual, "native");
  equal(NATIVE_SCHEMA, actual.schema, "native.schema");
  equal(expected.name, actual.name, "native.name");
  equal(BUILD_PACKAGES.child, actual.packagePath, "native.packagePath");
  equal(BUILD_PACKAGES.child, actual.componentID, "native.componentID");
  equal(0, actual.initialStateIndex, "native.initialStateIndex");
  const states = array(actual.states, "native.states");
  equal(expected.events.length + 1, states.length, "native.states.length");
  equal(expected.initial.nativeState, states[0], "native.states[0]");
  const events = array(actual.events, "native.events");
  equal(expected.events.length, events.length, "native.events.length");
  for (let index = 0; index < expected.events.length; index += 1) {
    const want = expected.events[index];
    const row = events[index];
    equal(index, row?.index, `native.events[${index}].index`);
    equal(expectedNativeEvent(want, (actual.scenario?.events ?? [])[index] ?? {}), row, `native.events[${index}]`);
    equal(want.stateIndex, row.stateIndex, `native.events[${index}].stateIndex`);
    equal(want.state.nativeState, states[want.stateIndex], `native.states[${want.stateIndex}]`);
  }
  equal(expected.effects, array(actual.effects, "native.effects"), "native.effects");
  equal(expected.transportLedger, array(actual.transportLedger, "native.transportLedger"), "native.transportLedger");
  equal(expected.pendingTransports, array(actual.pendingTransports, "native.pendingTransports"), "native.pendingTransports");
  equal(expected.lifecycleLedger, array(actual.lifecycleLedger, "native.lifecycleLedger"), "native.lifecycleLedger");
  equal(expected.retiredChildren, array(actual.retiredChildren, "native.retiredChildren"), "native.retiredChildren");
  return { events: events.length, states: states.length, effects: actual.effects.length,
    transportEvents: actual.transportLedger.length, lifecycleEvents: actual.lifecycleLedger.length };
}

export function assertNativeModuleEffectsCapture(native, scenario) {
  const expected = deriveExpectedReplay(scenario);
  record(native, "native");
  equal(NATIVE_SCHEMA, native.schema, "native.schema");
  equal(expected.name, native.name, "native.name");
  const states = array(native.states, "native.states");
  equal(expected.events.length + 1, states.length, "native.states.length");
  const expectedNative = { ...native, scenario: scenario };
  // The scenario event source is passed separately and also checked through native event metadata below.
  return assertNativeCapture(expectedNative, expected);
}

export function assertModuleEffectsBuildAdmission(loaded) {
  record(loaded, "builds");
  equal(BUILD_INDEX_SCHEMA, loaded.schema, "builds.schema");
  if (!/^[0-9a-f]{64}$/.test(loaded.indexSHA256 ?? "")) fail("builds.indexSHA256", "must pin the build-index bytes");
  equal(EXPECTED_CLOSED_DESCRIPTORS, array(loaded.closedEffectDescriptors, "builds.closedEffectDescriptors"),
    "builds.closedEffectDescriptors");
  const inventory = array(loaded.inventory, "builds.inventory");
  equal(4, inventory.length, "builds.inventory.length");
  const inventoryKeys = inventory.map((item, index) => {
    record(item, `builds.inventory[${index}]`);
    if (!new Set(["react", "dom"]).has(item.backend) || !new Set(["parent", "child"]).has(item.role)) {
      fail(`builds.inventory[${index}]`, "backend/role must identify one of the four independent modules");
    }
    return `${item.backend}/${item.role}`;
  }).sort();
  equal(["dom/child", "dom/parent", "react/child", "react/parent"], inventoryKeys, "builds.inventory.identities");

  const sourcePins = record(loaded.sourcePins, "builds.sourcePins");
  for (const path of [
    "fixtures/compiled/effectmodulechild/app.go",
    "fixtures/compiled/effectmodulechild/view.go",
    "fixtures/compiled/keyedmoduleparent/app.go",
    "fixtures/compiled/modulechild/app.go",
  ]) {
    const pin = record(sourcePins[path], `builds.sourcePins[${JSON.stringify(path)}]`);
    equal(path, pin.path, `builds.sourcePins[${JSON.stringify(path)}].path`);
    if (!Number.isSafeInteger(pin.bytes) || pin.bytes <= 0 || !/^[0-9a-f]{64}$/.test(pin.sha256 ?? "")) {
      fail(`builds.sourcePins[${JSON.stringify(path)}]`, "source identity needs byte count and SHA-256");
    }
  }
  const toolchain = record(loaded.toolchain, "builds.toolchain");
  if (!/^v22\./.test(toolchain.node ?? "") || !/^(?:go version )?go1\.24\./.test(toolchain.rootGo ?? "") ||
      !/^(?:go version )?go1\.27\.3/.test(toolchain.compilerGo ?? "") || toolchain.goscript !== "v0.6.2" || toolchain.esbuild !== "0.28.2") {
    fail("builds.toolchain", "does not match the pinned four-build toolchain");
  }

  const built = record(loaded.builds, "builds.builds");
  const profiles = record(loaded.profiles, "builds.profiles");
  equal(["dom", "react"], Object.keys(built).sort(), "builds.builds.backends");
  equal(["dom", "react"], Object.keys(profiles).sort(), "builds.profiles.backends");
  const admission = record(loaded.admission, "builds.admission");
  const boundarySummaries = {};
  for (const backend of ["react", "dom"]) {
    const pair = record(built[backend], `builds.builds.${backend}`);
    equal(backend, pair.backend, `builds.builds.${backend}.backend`);
    for (const role of ["parent", "child"]) {
      const side = record(pair[role], `builds.builds.${backend}.${role}`);
      equal(BUILD_PACKAGES[role], side.packagePath, `builds.builds.${backend}.${role}.packagePath`);
      equal(BUILD_PACKAGES[role], side.componentId, `builds.builds.${backend}.${role}.componentId`);
      equal(backend, side.backend, `builds.builds.${backend}.${role}.backend`);
      equal(BUILD_PACKAGES[role], side.descriptor?.packagePath, `builds.builds.${backend}.${role}.descriptor.packagePath`);
      if (!/^[0-9a-f]{64}$/.test(side.descriptor?.abiSHA256 ?? "")) {
        fail(`builds.builds.${backend}.${role}.descriptor.abiSHA256`, "must pin the admitted module ABI");
      }
    }
    assertEffectChildUint64ABI(pair.child, `builds.builds.${backend}.child`);
    const helper = pair.parent.keyed;
    for (const name of ["children", "receiveKeyed", "isCurrent"]) {
      if (typeof helper?.[name] !== "function") fail(`builds.builds.${backend}.parent.keyed.${name}`, "keyed helper export is missing");
    }
    if (pair.child.keyed !== undefined) fail(`builds.builds.${backend}.child.keyed`, "keyed helper must remain on the parent module");
    const pins = record(pair.pins, `builds.builds.${backend}.pins`);
    equal(pair.parent.descriptor.abiSHA256, pins.parentABI, `builds.builds.${backend}.pins.parentABI`);
    equal(pair.child.descriptor.abiSHA256, pins.childABI, `builds.builds.${backend}.pins.childABI`);
    for (const pinName of ["helperSHA256", "parentAppIRSHA256", "helperDescriptorSHA256"]) {
      if (!/^[0-9a-f]{64}$/.test(pins[pinName] ?? "")) fail(`builds.builds.${backend}.pins.${pinName}`, "must be SHA-256");
    }

    const indexed = record(admission[backend], `builds.admission.${backend}`);
    equal(true, indexed.admitted, `builds.admission.${backend}.admitted`);
    equal(true, indexed.parentABIUnchanged, `builds.admission.${backend}.parentABIUnchanged`);
    equal(pins.parentABI, indexed.parentABISHA256, `builds.admission.${backend}.parentABISHA256`);
    equal(pins.childABI, indexed.childABISHA256, `builds.admission.${backend}.childABISHA256`);
    const parentComparison = record(indexed.parentABIComparison, `builds.admission.${backend}.parentABIComparison`);
    equal(pins.parentABI, parentComparison.rawParentABISHA256, `builds.admission.${backend}.parentABIComparison.rawParentABISHA256`);
    equal(pins.parentAppIRSHA256, parentComparison.normalizedParentAppIRSHA256,
      `builds.admission.${backend}.parentABIComparison.normalizedParentAppIRSHA256`);
    equal(pins.normalizedParentModuleSHA256, parentComparison.normalizedParentModuleSHA256,
      `builds.admission.${backend}.parentABIComparison.normalizedParentModuleSHA256`);
    equal(pins.normalizedParentHelperSHA256, parentComparison.normalizedParentHelperSHA256,
      `builds.admission.${backend}.parentABIComparison.normalizedParentHelperSHA256`);
    equal(sourcePins["fixtures/compiled/keyedmoduleparent/app.go"].sha256, parentComparison.sourceSHA256,
      `builds.admission.${backend}.parentABIComparison.sourceSHA256`);
    const extension = record(indexed.effectCapabilityExtension, `builds.admission.${backend}.effectCapabilityExtension`);
    equal(EXPECTED_CAPABILITIES, array(extension.capabilities, `builds.admission.${backend}.effectCapabilityExtension.capabilities`),
      `builds.admission.${backend}.effectCapabilityExtension.capabilities`);
    equal(EXPECTED_CLOSED_DESCRIPTORS,
      array(extension.closedEffectDescriptors, `builds.admission.${backend}.effectCapabilityExtension.closedEffectDescriptors`),
      `builds.admission.${backend}.effectCapabilityExtension.closedEffectDescriptors`);
    const probe = record(pair.effectProbe, `builds.builds.${backend}.effectProbe`);
    assertCompiledProbe(probe, `builds.builds.${backend}.effectProbe`);
    if (indexed.effectProbe !== undefined) assertCompiledProbe(indexed.effectProbe, `builds.admission.${backend}.effectProbe`);
    boundarySummaries[backend] = assertCompiledMountBoundaryProbe(pair.child, indexed.mountBoundaryProbe, backend);
    const profile = profiles[backend];
    equal(BUILD_PACKAGES.parent, profile.parent.packagePath, `builds.profiles.${backend}.parent.packagePath`);
    equal(BUILD_PACKAGES.child, profile.child.packagePath, `builds.profiles.${backend}.child.packagePath`);
  }
  return { schema: loaded.schema, backendBuilds: 2, independentApps: 4, effects: 2, capabilities: EXPECTED_CAPABILITIES.length,
    uint64Boundary: boundarySummaries };
}

function copyBuildAdmissionSummary(loaded) {
  const copyPair = (pair) => ({
    ...pair,
    pins: clone(pair.pins),
    admission: pair.admission ? clone(pair.admission) : pair.admission,
    effectProbe: clone(pair.effectProbe),
    parent: { ...pair.parent, descriptor: clone(pair.parent.descriptor) },
    child: { ...pair.child, descriptor: clone(pair.child.descriptor) },
    pair: pair.pair ? { ...pair.pair } : pair.pair,
  });
  return {
    ...loaded,
    closedEffectDescriptors: clone(loaded.closedEffectDescriptors),
    admission: clone(loaded.admission), inventory: clone(loaded.inventory),
    sourcePins: clone(loaded.sourcePins), toolchain: clone(loaded.toolchain),
    builds: Object.fromEntries(Object.entries(loaded.builds).map(([backend, pair]) => [backend, copyPair(pair)])),
    profiles: loaded.profiles,
  };
}

function assertCompiledProbe(probe, path) {
  record(probe, path);
  const observations = [
    { kind: "fixture.request", name: "save", arg: "a:g1:r1", reply: "complete" },
    { kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r1", reply: "" },
    { kind: "fixture.request", name: "save", arg: "a:g1:r2", reply: "complete" },
    { kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r2", reply: "" },
  ];
  equal(4, probe.observedCount, `${path}.observedCount`);
  equal(2, probe.uniqueDescriptorCount ?? new Set((probe.observations ?? []).map(({ kind, name, reply }) =>
    JSON.stringify([kind, name, reply]))).size, `${path}.uniqueDescriptorCount`);
  equal(observations, array(probe.observations, `${path}.observations`), `${path}.observations`);
  const state = (step, key, generation, mounted, requestID, pending, token, reply, coreStep, coreLocked, coreInputRevision, counterCount = 0) => ({
    step, key, generation, mounted, requestID, pending, token, reply, coreStep, coreLocked, coreInputRevision, counterCount,
  });
  const pending = [
    state("initial", "", "0", false, "0", false, "", "", 1, false, 0),
    state("mount", "a", "1", true, "0", false, "", "", 1, false, 0),
    state("input", "a", "1", true, "0", false, "", "", 2, false, 1),
    state("request", "a", "1", true, "1", true, "a:g1:r1", "", 2, false, 1),
    state("cancel", "a", "1", true, "1", false, "a:g1:r1", "", 2, false, 1),
    state("retry", "a", "1", true, "2", true, "a:g1:r2", "", 2, false, 1),
    state("unmount", "a", "1", false, "2", false, "a:g1:r2", "", 2, false, 1),
    state("stale-complete", "a", "1", false, "2", false, "a:g1:r2", "", 2, false, 1),
  ];
  equal(pending, array(probe.stateSnapshots, `${path}.stateSnapshots`), `${path}.stateSnapshots`);
  equal(["Init", "Update", "View", "Input", "Publication"], probe.standardRoles, `${path}.standardRoles`);
  equal({ Count: 0, Revision: 1 }, probe.inputPublication, `${path}.inputPublication`);
  equal(true, probe.requestAndCancelEffectsMatchClosedDescriptors, `${path}.requestAndCancelEffectsMatchClosedDescriptors`);
  equal(true, probe.staleReplyNoopAfterUnmount, `${path}.staleReplyNoopAfterUnmount`);
}

function assertEffectChildUint64ABI(side, path) {
  const types = array(side.descriptor?.types, `${path}.descriptor.types`);
  const stateInfo = types.find((item) => item.id === CHILD_STATE_TYPE);
  equal([
    { name: "Core", type: CORE_STATE_TYPE }, { name: "Key", type: "string" },
    { name: "Generation", type: "uint64" }, { name: "Mounted", type: "bool" },
    { name: "RequestID", type: "uint64" }, { name: "Pending", type: "bool" },
    { name: "Token", type: "string" }, { name: "Reply", type: "string" },
  ], stateInfo?.fields, `${path}.descriptor.types.${CHILD_STATE_TYPE}.fields`);
  const uint64Info = types.find((item) => item.id === "uint64");
  equal({ id: "uint64", kind: "uint", bits: 64, jsRepresentation: "bigint" }, uint64Info,
    `${path}.descriptor.types.uint64`);
  equal(["Generation", "RequestID"], types.flatMap((item) => (item.fields ?? [])
    .filter((field) => field.type === "uint64").map((field) => field.name)).sort(), `${path}.descriptor.uint64FieldReferences`);
  equal([uint64Info], types.filter((item) => item.jsRepresentation === "bigint"),
    `${path}.descriptor.bigintTypeInfos`);
}

function boundaryInitialState() {
  return { Core: { Counter: { Count: 0 }, Step: 1, Locked: false, InputRevision: 0 },
    Key: "", Generation: 0n, Mounted: false, RequestID: 0n, Pending: false, Token: "", Reply: "" };
}

function projectBoundaryState(state, path) {
  const checkedSafe = (value, field) => {
    if (typeof value !== "bigint" || value < 0n || value > BigInt(MAX_SAFE_ID)) {
      fail(`${path}.${field}`, "must remain a Go BigInt in the nonnegative JavaScript safe integer range");
    }
    const projected = Number(value);
    if (!Number.isSafeInteger(projected) || BigInt(projected) !== value) fail(`${path}.${field}`, "cannot be represented exactly as a safe integer");
    return projected;
  };
  return { Core: { Counter: { Count: state.Core.Counter.Count }, Step: state.Core.Step,
    Locked: state.Core.Locked, InputRevision: state.Core.InputRevision },
  Key: state.Key, Generation: checkedSafe(state.Generation, "Generation"), Mounted: state.Mounted,
  RequestID: checkedSafe(state.RequestID, "RequestID"), Pending: state.Pending, Token: state.Token, Reply: state.Reply };
}

function expectedBoundaryCase(spec) {
  let state = boundaryInitialState();
  let accepted = false;
  const rows = [];
  const emit = (message, arg, effects) => rows.push({ message, ...(arg === undefined ? {} : { arg }),
    state: projectBoundaryState(state, `boundary.${spec.name}.${message}`), effects });
  const match = /^([ab]):g([1-9][0-9]*)$/.exec(spec.arg);
  if (match && BigInt(match[2]) <= BigInt(MAX_SAFE_ID)) {
    accepted = true;
    state.Key = match[1]; state.Generation = BigInt(match[2]); state.Mounted = true;
  }
  emit("mount", spec.arg, []);
  for (const operation of spec.operations) {
    let effects = [];
    let arg = "";
    if (operation === "request" && state.Mounted && !state.Pending && state.RequestID < BigInt(MAX_SAFE_ID)) {
      state.RequestID += 1n;
      state.Pending = true;
      state.Token = `${state.Key}:g${state.Generation}:r${state.RequestID}`;
      state.Reply = "";
      effects = [requestEffect(state.Token)];
    } else if (operation === "cancel" && state.Mounted && state.Pending) {
      state.Pending = false;
      effects = [cancelEffect(state.Token)];
    } else if (operation === "complete") {
      arg = state.Token;
      if (state.Mounted && state.Pending && state.Token === arg) {
        state.Pending = false; state.Reply = arg;
      }
    }
    emit(operation, arg, effects);
  }
  return { name: spec.name, arg: spec.arg, accepted, steps: rows };
}

function assertEncodedUint64Fields(encoder, component, state, path) {
  const encoded = encoder.gobiEncodeState(state, component.stateType);
  if (encoded?.kind !== "struct" || !Array.isArray(encoded.fields)) fail(`${path}.encodedState`, "must encode the compiled child State struct");
  const field = (fields, name, label) => {
    const row = fields.find((item) => item.name === name);
    if (!row || row.value?.typeId !== "uint64" || row.value.kind !== "uint" || typeof row.value.integer !== "string") {
      fail(label, "must be an encoded uint64 decimal string");
    }
    return row.value.integer;
  };
  const generation = field(encoded.fields, "Generation", `${path}.encodedState.Generation`);
  const requestID = field(encoded.fields, "RequestID", `${path}.encodedState.RequestID`);
  equal(state.Generation.toString(10), generation, `${path}.encodedState.Generation.integer`);
  equal(state.RequestID.toString(10), requestID, `${path}.encodedState.RequestID.integer`);
  for (const [name, value] of [["Generation", generation], ["RequestID", requestID]]) {
    const integer = BigInt(value);
    if (integer < 0n || integer > BigInt(MAX_SAFE_ID)) fail(`${path}.encodedState.${name}`, "exceeds the exact safe-number projection range");
    const number = Number(integer);
    if (!Number.isSafeInteger(number) || BigInt(number) !== integer) fail(`${path}.encodedState.${name}`, "does not round-trip through a safe JS number");
  }
}

function compiledSliceItems(value, path) {
  if (Array.isArray(value)) return value.slice();
  if (!value || typeof value !== "object") fail(path, "compiled effect result must be an array or GoScript slice");
  const own = (key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) fail(`${path}.${key}`, "must be an own data field");
    return descriptor.value;
  };
  const backing = own("backing");
  const offset = own("offset");
  const length = own("length");
  const capacity = own("capacity");
  const target = own("target");
  if (target !== undefined || !Array.isArray(backing) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      !Number.isSafeInteger(capacity) || offset < 0 || length < 0 || capacity < length || offset + capacity > backing.length) {
    fail(path, "is not a valid GoScript slice window");
  }
  return backing.slice(offset, offset + length);
}

function compiledEffectTuple(effect, path) {
  const own = (key) => {
    const descriptor = Object.getOwnPropertyDescriptor(effect, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) fail(`${path}.${key}`, "must be an own data field");
    return descriptor.value;
  };
  const tuple = { kind: own("Kind"), name: own("Name"), arg: own("Arg"), reply: own("Reply") };
  if (Object.values(tuple).some((value) => typeof value !== "string")) fail(path, "effect tuple fields must all be strings");
  return tuple;
}

function assertCompiledMountBoundaryProbe(side, probe, backend) {
  const path = `builds.admission.${backend}.mountBoundaryProbe`;
  record(probe, path);
  equal("gobi.module-effects-mount-boundaries/v1", probe.schema, `${path}.schema`);
  equal(backend, probe.backend, `${path}.backend`);
  equal(true, probe.nativeParity, `${path}.nativeParity`);
  const component = side.module?.appIR?.components?.[0];
  const init = side.module?.symbols?.[component?.init];
  const update = side.module?.symbols?.[component?.update];
  const view = side.module?.symbols?.[component?.view];
  if (!component || typeof init !== "function" || typeof update !== "function" || typeof view !== "function" ||
      typeof side.encoder?.gobiEncodeState !== "function") fail(path, "loaded compiled module lacks Update/View/encoder entrypoints");
  const actualCases = array(probe.cases, `${path}.cases`);
  equal(EXPECTED_BOUNDARY_CASES.length, actualCases.length, `${path}.cases.length`);
  const compiledRuns = [];
  for (const [caseIndex, spec] of EXPECTED_BOUNDARY_CASES.entries()) {
    const casePath = `${path}.cases[${caseIndex}]`;
    const actualCase = record(actualCases[caseIndex], casePath);
    equal(spec.name, actualCase.name, `${casePath}.name`);
    equal(spec.arg, actualCase.arg, `${casePath}.arg`);
    const expected = expectedBoundaryCase(spec);
    equal(expected.accepted, actualCase.accepted, `${casePath}.accepted`);
    const actualSteps = array(actualCase.steps, `${casePath}.steps`);
    equal(expected.steps.length, actualSteps.length, `${casePath}.steps.length`);

    let state = init();
    const compiledSteps = [];
    for (let stepIndex = 0; stepIndex < expected.steps.length; stepIndex += 1) {
      const want = expected.steps[stepIndex];
      const actual = record(actualSteps[stepIndex], `${casePath}.steps[${stepIndex}]`);
      const arg = want.arg ?? "";
      const result = update(state, { Name: want.message, Arg: arg });
      if (!Array.isArray(result) || result.length !== 2) fail(`${casePath}.steps[${stepIndex}]`, "compiled Update must return [State,Effects]");
      state = result[0];
      view(state);
      assertEncodedUint64Fields(side.encoder, component, state, `${casePath}.steps[${stepIndex}]`);
      const effects = compiledSliceItems(result[1], `${casePath}.steps[${stepIndex}].effects`).map((item, index) =>
        compiledEffectTuple(item, `${casePath}.steps[${stepIndex}].effects[${index}]`));
      const projection = projectBoundaryState(state, `${casePath}.steps[${stepIndex}].state`);
      equal({ message: want.message, ...(want.arg === undefined ? {} : { arg: want.arg }),
        state: want.state, effects: want.effects },
      { message: actual.message, ...(actual.arg === undefined ? {} : { arg: actual.arg }),
        state: actual.state, effects: actual.effects }, `${casePath}.steps[${stepIndex}].nativeProjection`);
      equal({ message: want.message, ...(want.arg === undefined ? {} : { arg: want.arg }), state: want.state, effects: want.effects },
        { message: want.message, ...(want.arg === undefined ? {} : { arg: want.arg }), state: projection, effects },
        `${casePath}.steps[${stepIndex}].compiledReplay`);
      compiledSteps.push({ message: want.message, ...(want.arg === undefined ? {} : { arg: want.arg }), state: projection, effects });
    }
    compiledRuns.push({ name: spec.name, arg: spec.arg, accepted: expected.accepted, steps: compiledSteps });
  }
  equal(EXPECTED_BOUNDARY_CASES.map((spec) => expectedBoundaryCase(spec)), compiledRuns,
    `${path}.compiledBoundaryReplay`);
  return { cases: actualCases.length, validMountCases: actualCases.filter((item) => item.accepted).length,
    bigintFields: ["Generation", "RequestID"], encodedSafeRange: MAX_SAFE_ID.toString(10) };
}

export function runModuleEffectsBuildAdmissionMutationControls(loaded) {
  assertModuleEffectsBuildAdmission(loaded);
  const cases = [
    ["remove-cancel-descriptor", (copy) => { copy.closedEffectDescriptors.pop(); }],
    ["remove-cancel-capability", (copy) => { copy.admission.dom.effectCapabilityExtension.capabilities = copy.admission.dom.effectCapabilityExtension.capabilities.filter((item) => item !== "effect.cancel"); }],
    ["unadmit-react-child", (copy) => { copy.admission.react.admitted = false; }],
    ["wrong-dom-child-package", (copy) => { copy.builds.dom.child.packagePath = "github.com/example/wrong-child"; }],
    ["remove-react-keyed-helper", (copy) => { copy.builds.react.parent.keyed = null; }],
    ["drop-source-pin", (copy) => { delete copy.sourcePins["fixtures/compiled/effectmodulechild/app.go"]; }],
    ["replace-dom-child-uint64-with-number", (copy) => {
      copy.builds.dom.child.descriptor.types.find((item) => item.id === "uint64").jsRepresentation = "number";
    }],
  ];
  const rejected = [];
  for (const [name, mutate] of cases) {
    const candidate = copyBuildAdmissionSummary(loaded);
    mutate(candidate);
    try {
      assertModuleEffectsBuildAdmission(candidate);
      fail(`buildMutation.${name}`, "independent admission checker accepted a malformed build summary");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.message.includes("independent admission checker accepted")) throw error;
      rejected.push({ name, rejected: true, path: error.message.split(":")[0] });
    }
  }
  return { total: rejected.length, rejected };
}

function childrenByIdentity(snapshot, path) {
  const children = array(snapshot?.children, `${path}.children`);
  return new Map(children.map((child, index) => {
    record(child, `${path}.children[${index}]`);
    return [`${child.key}:g${child.generation}`, child];
  }));
}

function expectedControllerState(modelState) {
  const source = modelState.controllerState;
  const convert = (slot) => ({ key: slot.key, generation: slot.generation, mounted: slot.mounted,
    publishedCount: slot.publishedCount, publishedRevision: slot.publishedRevision });
  return { a: convert(source.a), b: convert(source.b), first: source.first, second: source.second,
    childCount: source.childCount };
}

function renderedControls(snapshot) {
  const controls = [];
  const collect = (node, key = null, generation = null) => {
    if (!node || typeof node !== "object") return;
    if (node.kind === 1 && ["button", "input", "select", "textarea"].includes(node.tag)) {
      const attributes = node.attrs ?? [];
      const get = (name) => attributes.find((item) => item.name === name)?.value ?? "";
      const content = (child) => child?.kind === 2 ? child.text : (child?.kids ?? []).map(content).join("");
      controls.push({ tag: node.tag, type: get("type") || (node.tag === "button" ? "submit" : ""),
        text: (node.kids ?? []).map(content).join(""), value: get("value"),
        disabled: isDisabled(node), connected: true, className: get("class"),
        parentKey: key, parentGeneration: generation === null ? null : String(generation) });
    }
    for (const child of node.kids ?? []) collect(child, key, generation);
  };
  collect(snapshot.parentView);
  for (const child of snapshot.children) collect(child.view, child.key, child.generation);
  return controls;
}

function decodeHTML(value) {
  return value.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'",
  })[entity]);
}

function parseSimpleHTML(html, path) {
  const root = { children: [] };
  const stack = [root];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const tokens = html.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith("<!--") || token.startsWith("<!")) continue;
    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim().toLowerCase();
      if (stack.length < 2 || stack.at(-1).tag !== name) fail(path, `unbalanced closing tag ${name}`);
      stack.pop();
      continue;
    }
    if (!token.startsWith("<")) {
      const value = decodeHTML(token);
      const list = stack.at(-1).children;
      if (value !== "") {
        if (list.at(-1)?.kind === "text") list.at(-1).text += value;
        else list.push({ kind: "text", text: value });
      }
      continue;
    }
    const match = /^<([A-Za-z][A-Za-z0-9:-]*)([\s\S]*?)\s*\/?>$/.exec(token);
    if (!match) fail(path, `cannot parse element token ${JSON.stringify(token)}`);
    const tag = match[1].toLowerCase();
    const attrs = {};
    const source = match[2].replace(/\/\s*$/, "");
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let item;
    while ((item = attrPattern.exec(source)) !== null) {
      const name = item[1].toLowerCase();
      const value = item[2] ?? item[3] ?? item[4] ?? "";
      attrs[name] = decodeHTML(value);
    }
    const node = { kind: "element", tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!voidTags.has(tag) && !token.endsWith("/>")) stack.push(node);
  }
  if (stack.length !== 1) fail(path, `unclosed element ${stack.at(-1).tag}`);
  return root.children;
}

function canonicalGoNode(node) {
  if (node.kind === 2) return { kind: "text", text: node.text };
  const attrs = {};
  for (const item of node.attrs ?? []) attrs[item.name.toLowerCase()] = item.flag ? "" : item.value;
  const children = [];
  for (const child of node.kids ?? []) {
    const normalized = canonicalGoNode(child);
    if (normalized.kind === "text" && children.at(-1)?.kind === "text") children.at(-1).text += normalized.text;
    else children.push(normalized);
  }
  return { kind: "element", tag: node.tag.toLowerCase(), attrs, children };
}

function assertFullDOMTree(dom, modelState, path) {
  const expected = [{ kind: "element", tag: "div", attrs: { "data-gobi-module-root": "parent" },
    children: [canonicalGoNode(modelState.parentView)] }];
  for (const child of modelState.children) {
    expected.push({ kind: "element", tag: "div", attrs: { "data-gobi-module-root": `child-${child.key}`,
      "data-gobi-key": child.key, "data-gobi-generation": String(child.generation) },
    children: [canonicalGoNode(child.view)] });
  }
  equal(expected, parseSimpleHTML(dom.html, `${path}.dom.html`), `${path}.dom.html.tree`);
}

function rendererExpectation(profile, scenario, eventIndex) {
  const swapEvents = scenario.events.slice(0, eventIndex + 1).filter((event) => event.kind === "renderer-swap");
  if (profile.startsWith("browser.")) {
    if (profile === "browser.swap") {
      let backend = "dom";
      let epoch = 1;
      for (const event of swapEvents) {
        if (event.to !== backend) { backend = event.to; epoch += 1; }
      }
      return { backend, epoch };
    }
    return { backend: profile.slice("browser.".length), epoch: 1 };
  }
  let backend = profile.slice("direct.".length);
  let epoch = 1;
  for (const event of swapEvents) {
    if (event.to !== backend) { backend = event.to; epoch += 1; }
  }
  return { backend, epoch };
}

function assertOneSnapshot(capture, snapshotRow, modelState, eventIndex, profile, scenario) {
  const path = `${profile}.snapshots[${eventIndex < 0 ? 0 : eventIndex + 1}]`;
  record(snapshotRow, path);
  equal(eventIndex, snapshotRow.eventIndex, `${path}.eventIndex`);
  const actual = record(snapshotRow.snapshot, `${path}.snapshot`);
  equal("gobi.module-effects-snapshot/v1", actual.schema, `${path}.snapshot.schema`);
  const renderer = eventIndex < 0 ? rendererExpectation(profile, scenario, -1)
    : rendererExpectation(profile, scenario, eventIndex);
  equal(renderer.backend, actual.backend, `${path}.snapshot.backend`);
  equal(renderer.epoch, actual.rendererEpoch, `${path}.snapshot.rendererEpoch`);
  equal(modelState.parentGoState, actual.parent?.goState, `${path}.snapshot.parent.goState`);
  equal(modelState.parentGoState.Parent, actual.parent?.state, `${path}.snapshot.parent.state`);
  equal(expectedControllerState(modelState), actual.parent?.controllerState, `${path}.snapshot.parent.controllerState`);
  equal({ tree: modelState.parentView, bindings: [] }, actual.parent?.view, `${path}.snapshot.parent.view`);

  const actualChildren = array(actual.children, `${path}.snapshot.children`);
  equal(modelState.children.map(({ key, generation }) => ({ key, generation })),
    actualChildren.map(({ key, generation }) => ({ key, generation })), `${path}.snapshot.children.identityOrder`);
  for (let index = 0; index < modelState.children.length; index += 1) {
    const expectedChild = modelState.children[index];
    const got = actualChildren[index];
    const childPath = `${path}.snapshot.children[${index}]`;
    equal(expectedChild.input, { step: got.input?.Step, locked: got.input?.Locked, revision: got.input?.Revision },
      `${childPath}.input`);
    equal(expectedChild.effectState, got.goState, `${childPath}.goState`);
    equal(expectedChild.effectState, got.state, `${childPath}.state`);
    equal({ tree: expectedChild.view, bindings: [] }, got.view, `${childPath}.view`);
  }
  const pendingExpected = array(modelState.effectPending, `${path}.expected.effectPending`);
  const pendingActual = array(actual.effectPending, `${path}.snapshot.effectPending`);
  equal(pendingExpected.map(({ token, key, generation, effect }) => ({ token, key, generation, effect })),
    pendingActual.map(({ token, key, generation, effect }) => ({ token, key, generation, effect })),
    `${path}.snapshot.effectPending`);
  for (const [index, item] of pendingActual.entries()) {
    equal("pending", item.status, `${path}.snapshot.effectPending[${index}].status`);
    const correlation = { dispatchId: item.dispatchId, effectIndex: item.effectIndex };
    equal(item.dispatchId, item.sequence, `${path}.snapshot.effectPending[${index}].sequence`);
    if (typeof item.dispatchId !== "string" || !Number.isSafeInteger(item.effectIndex)) {
      fail(`${path}.snapshot.effectPending[${index}].correlation`, "must carry dispatchId and effectIndex separately from renderer epoch");
    }
    equal(["dispatchId", "effectIndex"], Object.keys(correlation).sort(),
      `${path}.snapshot.effectPending[${index}].correlation.fields`);
  }
  equal(null, actual.failed, `${path}.snapshot.failed`);

  const dom = snapshotRow.dom;
  if (profile.startsWith("browser.")) {
    record(dom, `${path}.dom`);
    if (typeof dom.html !== "string" || dom.html.length === 0) fail(`${path}.dom.html`, "live browser markup is missing");
    assertFullDOMTree(dom, modelState, path);
    equal(renderedControls(modelState), array(dom.controls, `${path}.dom.controls`), `${path}.dom.controls`);
  } else {
    equal(null, dom, `${path}.dom`);
  }
  return actual;
}

function assertEventParity(event, expected, source, nativeRow, index, profile) {
  const path = `${profile}.events[${index}]`;
  record(event, path);
  equal(index, event.eventIndex, `${path}.eventIndex`);
  equal(source, event.sourceEvent, `${path}.sourceEvent`);
  equal(eventNativeExpected(expected, nativeRow), event.nativeExpected, `${path}.nativeExpected`);
  equal(expected.accepted, event.accepted, `${path}.accepted`);
  equal(source.kind === "transport-reply" ? null : expected.message, event.message, `${path}.message`);
  const result = event.result;
  if (source.kind === "click") {
    if (expected.message !== null) {
      if (result?.accepted !== true) fail(`${path}.result.accepted`, "enabled native click was not dispatched");
      equal(expected.message, result?.message ? { name: result.message.Name ?? result.message.name,
        arg: result.message.Arg ?? result.message.arg ?? "" } : null, `${path}.result.message`);
    } else if (expected.declaredMessage !== null) {
      equal(null, event.message, `${path}.message`);
      if (profile.startsWith("browser.")) equal(null, result, `${path}.result`);
      else {
        equal(true, result?.accepted, `${path}.result.accepted`);
        equal(true, result?.suppressed, `${path}.result.suppressed`);
        equal(null, result?.message ?? null, `${path}.result.message`);
      }
    }
    if (profile.startsWith("browser.")) {
      const click = record(event.domClick, `${path}.domClick`);
      equal(true, click.usedHTMLElementClick, `${path}.domClick.usedHTMLElementClick`);
      equal("button", click.tag, `${path}.domClick.tag`);
      equal(true, click.connectedBefore, `${path}.domClick.connectedBefore`);
      equal(expected.message === null, click.disabledBefore, `${path}.domClick.disabledBefore`);
      equal(expected.message === null ? 0 : 1, click.callbackDelta, `${path}.domClick.callbackDelta`);
      equal(expected.message, click.observedMessage, `${path}.domClick.observedMessage`);
    } else {
      equal(null, event.domClick, `${path}.domClick`);
    }
  } else if (source.kind === "transport-reply") {
    equal(expected.accepted, result?.accepted === true, `${path}.result.accepted`);
    equal({ Name: "complete", Arg: source.token }, event.manualReply, `${path}.manualReply`);
  } else if (source.kind === "stale-callback") {
    equal(false, result?.accepted === true, `${path}.result.accepted`);
    equal(true, result?.stale === true || event.retainedCallback?.stale === true, `${path}.result.stale`);
  } else if (source.kind === "renderer-swap") {
    if (profile.startsWith("direct.") || profile === "browser.swap") {
      equal(true, result?.accepted, `${path}.result.accepted`);
      equal(source.to, result?.to, `${path}.result.to`);
    } else equal(null, result, `${path}.result`);
  }
}

function assertEffectStateEventLink(captureEvents, eventIndex, stateEventIndex, path) {
  const event = captureEvents[eventIndex];
  record(event, `${path}.captureEvent`);
  equal(eventIndex, event.eventIndex, `${path}.captureEvent.eventIndex`);
  const hostEventIndex = event.hostEventIndex;
  if (!Number.isSafeInteger(hostEventIndex) || hostEventIndex < 0) {
    fail(`${path}.captureEvent.hostEventIndex`, "effect-producing event must identify its committed host state event");
  }
  equal(hostEventIndex, event.result?.eventIndex, `${path}.captureEvent.result.eventIndex`);
  equal(hostEventIndex, stateEventIndex, `${path}.stateEventIndex`);
  return hostEventIndex;
}

export function assertModuleEffectsReplyLedgerLinks({ capture, expected, profile }) {
  const path = profile;
  const ordered = array(capture.orderedLedger, `${path}.orderedLedger`);
  const sourceEvents = array(capture.events, `${path}.events`);
  const requestEffects = expected.effects.filter(({ effect }) => effect.kind === "fixture.request");
  const cancelEffects = expected.effects.filter(({ effect }) => effect.kind === "lifecycle.cancel");
  const requestByToken = new Map();
  for (const item of requestEffects) {
    const token = item.effect.arg;
    if (requestByToken.has(token)) fail(`${path}.expected.effects`, `duplicate request token ${token}`);
    const requests = ordered.filter((row) => row.kind === "request" && row.token === token);
    if (requests.length !== 1) fail(`${path}.orderedLedger`, `request ${token} must have exactly one request row`);
    const request = requests[0];
    assertEffectStateEventLink(sourceEvents, item.eventIndex, request.stateEventIndex,
      `${path}.orderedLedger.request.${token}`);
    const requestCorrelation = record(request.correlation, `${path}.orderedLedger[${request.sequence}].correlation`);
    equal(["dispatchId", "effectIndex"], Object.keys(requestCorrelation).sort(),
      `${path}.orderedLedger[${request.sequence}].correlation.fields`);
    if (typeof requestCorrelation.dispatchId !== "string" || requestCorrelation.dispatchId.length === 0 ||
        !Number.isSafeInteger(requestCorrelation.effectIndex) || requestCorrelation.effectIndex < 0) {
      fail(`${path}.orderedLedger[${request.sequence}].correlation`, "must identify the originating dispatch and effect");
    }
    requestByToken.set(token, { row: request, eventIndex: item.eventIndex });
  }

  const cancelByToken = new Map();
  for (const item of cancelEffects) {
    const token = item.effect.arg;
    if (cancelByToken.has(token)) fail(`${path}.expected.effects`, `duplicate cancellation token ${token}`);
    const cancels = ordered.filter((row) => row.kind === "go-cancel-effect" && row.token === token);
    if (cancels.length !== 1) fail(`${path}.orderedLedger`, `cancel ${token} must have exactly one Go cancellation row`);
    const cancel = cancels[0];
    assertEffectStateEventLink(sourceEvents, item.eventIndex, cancel.stateEventIndex,
      `${path}.orderedLedger.go-cancel-effect.${token}`);
    cancelByToken.set(token, cancel);
  }

  const replyCursors = new Map();
  for (const item of expected.events.filter((entry) => entry.kind === "transport-reply")) {
    const rows = ordered.filter((row) => row.kind === "reply" && row.token === item.token);
    const cursor = replyCursors.get(item.token) ?? 0;
    const reply = rows[cursor];
    if (!reply) fail(`${path}.orderedLedger`, `reply ${item.token} has no transport reply ledger row`);
    replyCursors.set(item.token, cursor + 1);

    const requestEntry = requestByToken.get(item.token);
    if (!requestEntry) fail(`${path}.orderedLedger.${item.eventIndex}.correlation`, `reply ${item.token} has no declared request`);
    const request = requestEntry.row;
    const correlation = record(reply.correlation, `${path}.orderedLedger[${reply.sequence}].correlation`);
    equal(["dispatchId", "effectIndex"], Object.keys(correlation).sort(),
      `${path}.orderedLedger[${reply.sequence}].correlation.fields`);
    equal(request.correlation, correlation, `${path}.orderedLedger.${item.eventIndex}.correlation`);

    equal(item.accepted, reply.goCall === true, `${path}.orderedLedger.${item.eventIndex}.goCall`);
    if (item.accepted) {
      equal("accepted", reply.outcome, `${path}.orderedLedger.${item.eventIndex}.outcome`);
      equal({ Name: "complete", Arg: item.token }, reply.message, `${path}.orderedLedger.${item.eventIndex}.message`);
      assertEffectStateEventLink(sourceEvents, item.eventIndex, reply.stateEventIndex,
        `${path}.orderedLedger.reply.${item.token}.accepted`);
    } else if (item.replyStatus === "rejected-duplicate") {
      equal("ignored-delivered", reply.outcome, `${path}.orderedLedger.${item.eventIndex}.outcome`);
      assertEffectStateEventLink(sourceEvents, requestEntry.eventIndex,
      reply.stateEventIndex, `${path}.orderedLedger.reply.${item.token}.duplicate`);
    } else if (item.replyStatus === "rejected-cancelled") {
      equal("ignored-cancelled", reply.outcome, `${path}.orderedLedger.${item.eventIndex}.outcome`);
      const cancel = cancelByToken.get(item.token);
      if (!cancel) fail(`${path}.orderedLedger.${item.eventIndex}.stateEventIndex`,
        `cancelled reply ${item.token} has no declared cancellation event`);
      equal(cancel.stateEventIndex, reply.stateEventIndex,
        `${path}.orderedLedger.${item.eventIndex}.stateEventIndex`);
    } else {
      fail(`${path}.orderedLedger.${item.eventIndex}.outcome`, `unsupported reply disposition ${item.replyStatus}`);
    }
  }
  equal(expected.events.filter((entry) => entry.kind === "transport-reply").length,
    ordered.filter((row) => row.kind === "reply").length, `${path}.orderedLedger.replyRowCount`);
}

function assertHostLedgers(capture, expected, scenario, profile) {
  const path = profile;
  const ordered = array(capture.orderedLedger, `${path}.orderedLedger`);
  ordered.forEach((row, index) => {
    record(row, `${path}.orderedLedger[${index}]`);
    equal(index, row.sequence, `${path}.orderedLedger[${index}].sequence`);
  });
  const effectRows = array(capture.effectLedger, `${path}.effectLedger`);
  const expectedEffects = expected.effects.map(({ key, generation, effect }) => ({ key, generation, effect }));
  const actualEffects = effectRows.filter((row) => row.kind === "request" || row.kind === "cancel").map((row) => ({
    key: row.key, generation: row.generation, effect: row.descriptor,
  }));
  equal(expectedEffects, actualEffects, `${path}.effectLedger.declaredEffects`);
  for (const item of expected.effects.filter(({ effect }) => effect.kind === "fixture.request")) {
    const token = item.effect.arg;
    const request = ordered.find((row) => row.kind === "request" && row.token === token);
    const commit = ordered.find((row) => row.kind === "go-commit-render" && row.pendingGo?.some((entry) => entry.token === token));
    const start = ordered.find((row) => row.kind === "start" && row.token === token);
    if (!request || !commit || !start) fail(`${path}.orderedLedger`, `request ${token} lacks request, commit/render, or transport start evidence`);
    if (!(request.sequence < commit.sequence && commit.sequence < start.sequence)) {
      fail(`${path}.orderedLedger.${token}`, "transport start must follow Go commit and renderer commit");
    }
    for (const row of [request, start]) {
      const correlation = record(row.correlation, `${path}.orderedLedger[${row.sequence}].correlation`);
      equal(["dispatchId", "effectIndex"], Object.keys(correlation).sort(),
        `${path}.orderedLedger[${row.sequence}].correlation.fields`);
    }
    equal(request.correlation, start.correlation, `${path}.orderedLedger.${token}.correlation`);
  }
  const sourceEvents = array(capture.events, `${path}.events`);
  assertModuleEffectsReplyLedgerLinks({ capture, expected, profile });
  const transport = array(capture.transportLedger, `${path}.transportLedger`);
  const requestTokens = expected.effects.filter(({ effect }) => effect.kind === "fixture.request").map(({ effect }) => effect.arg);
  equal(requestTokens.slice().sort(), transport.filter((row) => row.kind === "start").map((row) => row.token).sort(),
    `${path}.transportLedger.starts`);
  const cancelTokens = expected.effects.filter(({ effect }) => effect.kind === "lifecycle.cancel").map(({ effect }) => effect.arg);
  equal(cancelTokens.slice().sort(), transport.filter((row) => row.kind === "cancel").map((row) => row.token).sort(),
    `${path}.transportLedger.cancels`);
  const transportCursors = new Map();
  for (const item of expected.events.filter(({ kind }) => kind === "transport-reply")) {
    const hostEvent = sourceEvents[item.eventIndex];
    const rows = transport.filter((row) => row.token === item.token && ["deliver", "force-deliver-retained"].includes(row.kind));
    const cursor = transportCursors.get(item.token) ?? 0;
    const transportRow = rows[cursor];
    if (!transportRow) fail(`${path}.transportLedger`, `reply ${item.token} has no transport delivery evidence`);
    transportCursors.set(item.token, cursor + 1);
    equal(item.accepted, transportRow.status === "accepted", `${path}.transportLedger.${item.eventIndex}.status`);
    equal(hostEvent.eventIndex, item.eventIndex, `${path}.events[${item.eventIndex}].eventIndex`);
  }

  for (const item of expected.effects.filter(({ effect }) => effect.kind === "lifecycle.cancel")) {
    const token = item.effect.arg;
    const goCancel = ordered.find((row) => row.kind === "go-cancel-effect" && row.token === token);
    const cancelCall = ordered.find((row) => row.kind === "transport-cancel-call" && row.token === token);
    const cancelResult = ordered.find((row) => row.kind === "transport-cancel" && row.token === token);
    const request = ordered.find((row) => row.kind === "request" && row.token === token);
    if (!goCancel || !cancelCall || !cancelResult || !request) fail(`${path}.orderedLedger`, `cancel ${token} lacks Go declaration/transport lifecycle evidence`);
    if (!(goCancel.sequence < cancelCall.sequence && cancelCall.sequence < cancelResult.sequence)) {
      fail(`${path}.orderedLedger.${token}`, "Go cancellation must retire correlation before transport.cancel and record its outcome after");
    }
    equal(true, cancelCall.retiredBeforeCall, `${path}.orderedLedger.${token}.retiredBeforeCall`);
    equal(request.correlation, cancelCall.correlation, `${path}.orderedLedger.${token}.targetCorrelation`);
    equal(cancelCall.cancelCorrelation, goCancel.correlation, `${path}.orderedLedger.${token}.cancelCorrelation`);
    equal(request.correlation, goCancel.targetCorrelation, `${path}.orderedLedger.${token}.targetCorrelation`);
    equal(cancelCall.cancelCorrelation, cancelResult.cancelCorrelation, `${path}.orderedLedger.${token}.cancelResultCorrelation`);
    equal("cancelled", cancelResult.outcome, `${path}.orderedLedger.${token}.cancelOutcome`);
  }

  const removal = scenario.events.findIndex((event) => event.kind === "click" && event.target === "parent" && event.action.path === "6/1");
  const removedToken = "a:g1:r4";
  const unmountKinds = ["go-update-unmount", "go-unmounted-commit", "go-state-commit", "go-cancel-effect",
    "transport-cancel-call", "transport-cancel", "renderer-unmount"];
  const unmountRows = ordered.filter((row) => row.stateEventIndex === capture.events[removal]?.hostEventIndex &&
    unmountKinds.includes(row.kind) && row.key === "a" && row.generation === 1);
  equal(unmountKinds, unmountRows.map((row) => row.kind), `${path}.orderedLedger.unmountOrder`);
  const retired = array(capture.retiredChildren, `${path}.retiredChildren`).find((item) => item.key === "a" && item.generation === 1);
  record(retired, `${path}.retiredChildren.a.g1`);
  equal(true, retired.before.Pending, `${path}.retiredChildren.a.g1.before.Pending`);
  equal(false, retired.after.Mounted, `${path}.retiredChildren.a.g1.after.Mounted`);
  equal(false, retired.after.Pending, `${path}.retiredChildren.a.g1.after.Pending`);
  equal([removedToken], retired.pendingBefore, `${path}.retiredChildren.a.g1.pendingBefore`);
  equal([removedToken], retired.pendingAfter, `${path}.retiredChildren.a.g1.pendingAfter`);
  equal([], retired.transportPendingAfter, `${path}.retiredChildren.a.g1.transportPendingAfter`);
  equal([{ kind: "lifecycle.cancel", name: "cancel", arg: removedToken, reply: "" }],
    retired.emittedEffects, `${path}.retiredChildren.a.g1.emittedEffects`);
}

export function assertModuleEffectsParity({ scenario, native, profiles }) {
  const expected = deriveExpectedReplay(scenario);
  assertNativeModuleEffectsCapture(native, scenario);
  record(profiles, "profiles");
  const profileNames = ["direct.react", "direct.dom", "browser.react", "browser.dom", "browser.swap"];
  equal(profileNames.slice().sort(), Object.keys(profiles).sort(), "profiles.names");
  const backendByProfile = { "direct.react": "react", "direct.dom": "dom", "browser.react": "react",
    "browser.dom": "dom", "browser.swap": "dom" };
  const pinsByBackend = {};
  for (const profile of profileNames) {
    const capture = record(profiles[profile], `profiles.${profile}`);
    equal(CAPTURE_SCHEMA, capture.schema, `profiles.${profile}.schema`);
    equal(profile, capture.profile, `profiles.${profile}.profile`);
    const moduleBackend = backendByProfile[profile];
    equal(moduleBackend, capture.backend, `profiles.${profile}.backend`);
    equal(scenario.name, capture.scenarioName, `profiles.${profile}.scenarioName`);
    equal(scenario, capture.scenario, `profiles.${profile}.scenario`);
    equal(expected.scenarioSHA256, capture.scenarioSHA256, `profiles.${profile}.scenarioSHA256`);
    equal(scenario.events.length, capture.sourceEventCount, `profiles.${profile}.sourceEventCount`);
    const expectedSeed = scenario.name === "module-effects-literal" ? null : Number(scenario.name.slice("module-effects-seed-".length));
    equal(expectedSeed, capture.seed, `profiles.${profile}.seed`);
    const pins = record(capture.modulePins, `profiles.${profile}.modulePins`);
    for (const name of ["parentABI", "childABI", "helperSHA256", "parentAppIRSHA256", "helperDescriptorSHA256"]) {
      if (!/^[0-9a-f]{64}$/.test(pins[name] ?? "")) fail(`profiles.${profile}.modulePins.${name}`, "must bind the captured module pair to an artifact SHA-256");
    }
    if (pinsByBackend[moduleBackend] === undefined) pinsByBackend[moduleBackend] = pins;
    else equal(pinsByBackend[moduleBackend], pins, `profiles.${profile}.modulePins.sameBackend`);
    const snapshots = array(capture.snapshots, `profiles.${profile}.snapshots`);
    equal(scenario.events.length + 1, snapshots.length, `profiles.${profile}.snapshots.length`);
    const correlationByToken = new Map();
    const initialSnapshot = assertOneSnapshot(capture, snapshots[0], expected.initial, -1, profile, scenario);
    for (const item of initialSnapshot.effectPending) correlationByToken.set(item.token,
      { dispatchId: item.dispatchId, effectIndex: item.effectIndex });
    for (let index = 0; index < scenario.events.length; index += 1) {
      const actualSnapshot = assertOneSnapshot(capture, snapshots[index + 1], expected.events[index].state, index, profile, scenario);
      for (const item of actualSnapshot.effectPending) {
        const correlation = { dispatchId: item.dispatchId, effectIndex: item.effectIndex };
        if (correlationByToken.has(item.token)) equal(correlationByToken.get(item.token), correlation,
          `profiles.${profile}.snapshots[${index + 1}].effectPending.${item.token}.correlation`);
        else correlationByToken.set(item.token, correlation);
      }
    }
    const rows = array(capture.events, `profiles.${profile}.events`);
    equal(scenario.events.length, rows.length, `profiles.${profile}.events.length`);
    for (let index = 0; index < scenario.events.length; index += 1) {
      assertEventParity(rows[index], expected.events[index], scenario.events[index], native.events[index], index, profile);
    }
    if (capture.failure !== undefined) equal(null, capture.failure, `profiles.${profile}.failure`);
    if (capture.trace?.failure !== undefined) equal(null, capture.trace.failure, `profiles.${profile}.trace.failure`);
    assertHostLedgers(capture, expected, scenario, profile);
  }
  const summary = { status: "matched", schema: ORACLE_SCHEMA, scenario: scenario.name,
    events: scenario.events.length, profiles: profileNames.length, effects: expected.effects.length,
    requestTokens: expected.effects.filter(({ effect }) => effect.kind === "fixture.request").length,
    cancellationTokens: expected.effects.filter(({ effect }) => effect.kind === "lifecycle.cancel").length,
    replyTransitions: expected.transportLedger.length };
  return summary;
}

function mutateSnapshot(capture, eventIndex, mutate) {
  const row = capture.snapshots.find((item) => item.eventIndex === eventIndex);
  if (!row) fail("mutation.snapshot", `missing event snapshot ${eventIndex}`);
  mutate(row.snapshot);
}

export function runModuleEffectsMutationControls({ scenario, native, profiles }) {
  assertModuleEffectsParity({ scenario, native, profiles });
  const mutations = [
    ["bypass-go-cancellation", (copy) => mutateSnapshot(copy["direct.react"], 4, (snapshot) => {
      const child = snapshot.children.find((item) => item.key === "a"); child.goState.Pending = true; child.state.Pending = true;
    })],
    ["cancel-sibling-pending-request", (copy) => mutateSnapshot(copy["direct.dom"], 4, (snapshot) => {
      const child = snapshot.children.find((item) => item.key === "b"); child.goState.Pending = false; child.state.Pending = false;
    })],
    ["accept-duplicate-reply", (copy) => { copy["browser.dom"].events[7].result.accepted = true; }],
    ["accept-wrong-correlation-tuple", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.find((row) => row.kind === "reply" && row.token === "a:g1:r3");
      reply.message.Arg = "a:g1:r2";
    }],
    ["accept-old-generation-reply", (copy) => { copy["browser.swap"].events[18].result.accepted = true; }],
    ["confuse-renderer-epoch-with-reply-correlation", (copy) => {
      const request = copy["direct.dom"].orderedLedger.find((row) => row.kind === "request" && row.token === "a:g1:r3");
      request.correlation.rendererEpoch = request.rendererEpoch;
    }],
    ["start-before-commit-render", (copy) => {
      const ledger = copy["direct.react"].orderedLedger;
      const start = ledger.findIndex((row) => row.kind === "start" && row.token === "a:g1:r1");
      const commit = ledger.findIndex((row) => row.kind === "go-commit-render" && row.pendingGo?.some((item) => item.token === "a:g1:r1"));
      const [row] = ledger.splice(start, 1); ledger.splice(commit, 0, row);
      ledger.forEach((item, index) => { item.sequence = index; });
    }],
    ["call-transport-cancel-before-retiring-correlation", (copy) => {
      const call = copy["direct.react"].orderedLedger.find((row) => row.kind === "transport-cancel-call" && row.token === "a:g1:r1");
      call.retiredBeforeCall = false;
    }],
    ["accept-reply-without-correlation", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.find((row) => row.kind === "reply" && row.token === "a:g1:r3");
      delete reply.correlation;
    }],
    ["accept-reply-with-wrong-state-event-index", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.find((row) => row.kind === "reply" && row.token === "a:g1:r3");
      reply.stateEventIndex = 999;
    }],
    ["accept-reply-with-extra-correlation-field", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.find((row) => row.kind === "reply" && row.token === "a:g1:r3");
      reply.correlation.rendererEpoch = reply.rendererEpoch;
    }],
    ["accept-reply-with-wrong-dispatch-correlation", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.find((row) => row.kind === "reply" && row.token === "a:g1:r3");
      reply.correlation.dispatchId = "dispatch-999999";
    }],
    ["accept-reply-with-wrong-effect-correlation", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.find((row) => row.kind === "reply" && row.token === "a:g1:r3");
      reply.correlation.effectIndex = 999;
    }],
    ["accept-duplicate-reply-with-wrong-state-event-index", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.filter((row) => row.kind === "reply" && row.token === "b:g1:r1")[1];
      reply.stateEventIndex = 999;
    }],
    ["accept-cancelled-reply-without-correlation", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.find((row) => row.kind === "reply" && row.token === "a:g1:r1");
      delete reply.correlation;
    }],
    ["accept-cancelled-reply-with-wrong-state-event-index", (copy) => {
      const reply = copy["browser.swap"].orderedLedger.find((row) => row.kind === "reply" && row.token === "a:g1:r1");
      reply.stateEventIndex = 999;
    }],
  ];
  const rejected = [];
  for (const [name, mutate] of mutations) {
    const candidate = clone(profiles);
    mutate(candidate);
    try {
      assertModuleEffectsParity({ scenario, native, profiles: candidate });
      fail(`mutation.${name}`, "independent mounted oracle accepted a malformed capture");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.message.includes("independent mounted oracle accepted")) throw error;
      rejected.push({ name, rejected: true, path: error.message.split(":")[0] });
    }
  }
  return { status: rejected.length === mutations.length ? "detected" : "incomplete",
    total: mutations.length, rejected };
}

