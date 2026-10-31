import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";

export const ORACLE_SCENARIO = freeze(JSON.parse(readFileSync(new URL("./scenario.json", import.meta.url), "utf8")));

function parent(generation = 1, requestSeq = 0, pending = false, token = "", reply = "", alive = true) {
  return { Alive: alive, Generation: generation, RequestSeq: requestSeq, Pending: pending, Token: token, Reply: reply };
}

function child(key, generation, count = 0, requestSeq = 0, pending = false, token = "", reply = "") {
  return {
    Key: key,
    Counter: { Count: count },
    Generation: generation,
    RequestSeq: requestSeq,
    Pending: pending,
    Token: token,
    Reply: reply,
  };
}

function state(parentState, children, nextGeneration) {
  return { Parent: parentState, Children: children, NextGeneration: nextGeneration };
}

// Each row is a hand-authored Go value snapshot. Repeated states correspond to
// duplicate/stale messages or tick-free host operations; no Update reducer runs here.
const s0 = state(parent(), [child("oak", 2), child("elm", 3)], 3);
const s1 = state(parent(), [child("oak", 2, 1), child("elm", 3)], 3);
const s2 = state(parent(), [child("oak", 2, 1), child("elm", 3, 1)], 3);
const s3 = state(parent(), [child("oak", 2, 1), child("elm", 3, 1), child("ash", 4)], 4);
const s4 = state(parent(), [child("oak", 2, 1), child("elm", 3, 1), child("ash", 4)], 4);
const s5 = state(parent(), [child("oak", 2, 1, 1, true, "child:oak:g2:r1"), child("elm", 3, 1), child("ash", 4)], 4);
const s6 = state(parent(), [
  child("oak", 2, 1, 1, true, "child:oak:g2:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"), child("ash", 4),
], 4);
const s7 = state(parent(), [
  child("oak", 2, 1, 1, true, "child:oak:g2:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"),
  child("ash", 4, 0, 1, true, "child:ash:g4:r1"),
], 4);
const s8 = state(parent(), [
  child("oak", 2, 1, 1, true, "child:oak:g2:r1"),
  child("ash", 4, 0, 1, true, "child:ash:g4:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"),
], 4);
const s9 = state(parent(), [
  child("ash", 4, 0, 1, true, "child:ash:g4:r1"),
  child("oak", 2, 1, 1, true, "child:oak:g2:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"),
], 4);
const s10 = state(parent(), [
  child("ash", 4, 1, 1, true, "child:ash:g4:r1"),
  child("oak", 2, 1, 1, true, "child:oak:g2:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"),
], 4);
const s11 = state(parent(), [
  child("ash", 4, 1, 1, true, "child:ash:g4:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"),
], 4);
const s12 = state(parent(), [
  child("ash", 4, 1, 1, true, "child:ash:g4:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"), child("oak", 5),
], 5);
const s13 = state(parent(), [
  child("ash", 4, 1, 1, true, "child:ash:g4:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"),
  child("oak", 5, 0, 1, true, "child:oak:g5:r1"),
], 5);
const s14 = state(parent(), [
  child("ash", 4, 1, 1, true, "child:ash:g4:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"),
  child("oak", 5, 0, 1, true, "child:oak:g5:r1"),
], 5);
const s15 = state(parent(), [
  child("ash", 4, 1, 1, true, "child:ash:g4:r1"),
  child("elm", 3, 1, 1, true, "child:elm:g3:r1"),
  child("oak", 5, 0, 1, false, "child:oak:g5:r1", "child:oak:g5:r1"),
], 5);
const s16 = state(parent(), [
  child("ash", 4, 1, 1, true, "child:ash:g4:r1"),
  child("elm", 3, 1, 1, false, "child:elm:g3:r1", "child:elm:g3:r1"),
  child("oak", 5, 0, 1, false, "child:oak:g5:r1", "child:oak:g5:r1"),
], 5);
const s17 = state(parent(), [
  child("ash", 4, 1, 1, false, "child:ash:g4:r1", "child:ash:g4:r1"),
  child("elm", 3, 1, 1, false, "child:elm:g3:r1", "child:elm:g3:r1"),
  child("oak", 5, 0, 1, false, "child:oak:g5:r1", "child:oak:g5:r1"),
], 5);
const s18 = state(parent(1, 1, true, "parent:g1:r1"), [
  child("ash", 4, 1, 1, false, "child:ash:g4:r1", "child:ash:g4:r1"),
  child("elm", 3, 1, 1, false, "child:elm:g3:r1", "child:elm:g3:r1"),
  child("oak", 5, 0, 1, false, "child:oak:g5:r1", "child:oak:g5:r1"),
], 5);
const s19 = state(parent(1, 1, true, "parent:g1:r1"), [
  child("ash", 4, 1, 1, false, "child:ash:g4:r1", "child:ash:g4:r1"),
  child("elm", 3, 1, 1, false, "child:elm:g3:r1", "child:elm:g3:r1"),
  child("oak", 5, 0, 2, true, "child:oak:g5:r2"),
], 5);
const s20 = state(parent(1, 1, true, "parent:g1:r1"), [
  child("ash", 4, 1, 1, false, "child:ash:g4:r1", "child:ash:g4:r1"),
  child("elm", 3, 1, 2, true, "child:elm:g3:r2"),
  child("oak", 5, 0, 2, true, "child:oak:g5:r2"),
], 5);
const s21 = state(parent(1, 1, true, "parent:g1:r1"), [], 5);
const s22 = state(parent(1, 1, false, "parent:g1:r1", "parent:g1:r1"), [], 5);
const s23 = state(parent(1, 2, true, "parent:g1:r2"), [], 5);
const s24 = state(parent(1, 2, true, "parent:g1:r2"), [child("pine", 6)], 6);
const s25 = state(parent(1, 2, true, "parent:g1:r2"), [child("pine", 6), child("oak", 7)], 7);
const s26 = state(parent(1, 2, true, "parent:g1:r2"), [
  child("pine", 6, 0, 1, true, "child:pine:g6:r1"), child("oak", 7),
], 7);
const s27 = state(parent(1, 2, true, "parent:g1:r2"), [
  child("pine", 6, 0, 1, true, "child:pine:g6:r1"),
  child("oak", 7, 0, 1, true, "child:oak:g7:r1"),
], 7);
const s28 = state(parent(1, 2, false, "", "", false), [], 7);
const s29 = state(parent(1, 2, false, "", "", false), [], 7);
const s30 = state(parent(1, 2, false, "", "", false), [], 7);
const s31 = state(parent(1, 2, false, "", "", false), [], 7);
const s32 = state(parent(8), [], 8);
const s33 = state(parent(8, 1, true, "parent:g8:r1"), [], 8);
const s34 = state(parent(8, 1, false, "parent:g8:r1", "parent:g8:r1"), [], 8);
const s35 = state(parent(8, 1, false, "parent:g8:r1", "parent:g8:r1"), [child("ash", 9)], 9);
const s36 = state(parent(8, 1, false, "parent:g8:r1", "parent:g8:r1"), [child("ash", 9, 1)], 9);
const s37 = state(parent(8, 1, false, "parent:g8:r1", "parent:g8:r1"), [
  child("ash", 9, 1, 1, true, "child:ash:g9:r1"),
], 9);
const s38 = state(parent(8, 1, false, "parent:g8:r1", "parent:g8:r1"), [
  child("ash", 9, 1, 1, false, "child:ash:g9:r1", "child:ash:g9:r1"),
], 9);

export const ORACLE_STATES = freeze([
  s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19,
  s20, s21, s22, s23, s24, s25, s26, s27, s28, s29, s30, s31, s32, s33, s34, s35, s36, s37, s38,
]);

const noTickKinds = new Set(["disabled-action", "renderer-swap", "stale-callback"]);
const stateIndexByEvent = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9, 10, 11, 12, 13, 14, 15, 16, 17,
  18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38,
];

const request = (token) => ({ kind: "fixture.request", name: "lookup", arg: token, reply: "complete" });
const cancel = (token) => ({ kind: "lifecycle.cancel", name: "cancel", arg: token, reply: "" });
const effectsByEvent = {
  4: [request("child:oak:g2:r1")],
  5: [request("child:elm:g3:r1")],
  6: [request("child:ash:g4:r1")],
  14: [cancel("child:oak:g2:r1")],
  16: [request("child:oak:g5:r1")],
  21: [request("parent:g1:r1")],
  22: [request("child:oak:g5:r2")],
  23: [request("child:elm:g3:r2")],
  24: [cancel("child:oak:g5:r2"), cancel("child:elm:g3:r2")],
  26: [request("parent:g1:r2")],
  29: [request("child:pine:g6:r1")],
  30: [request("child:oak:g7:r1")],
  31: [cancel("child:oak:g7:r1"), cancel("child:pine:g6:r1"), cancel("parent:g1:r2")],
  36: [request("parent:g8:r1")],
  40: [request("child:ash:g9:r1")],
};

function expectedMessage(event) {
  if (noTickKinds.has(event.kind)) return null;
  if (event.kind === "effect-reply") return { name: "complete", arg: event.token };
  return structuredClone(event.message);
}

function actionFor(event) {
  if (event.kind === "click" || event.kind === "disabled-action" || event.kind === "stale-callback") {
    return { path: event.path, event: event.event, value: "" };
  }
  return null;
}

const events = ORACLE_SCENARIO.events.map((event, eventIndex) => {
  const stateIndex = stateIndexByEvent[eventIndex];
  const noTick = noTickKinds.has(event.kind);
  return {
    eventIndex,
    stepIndex: noTick ? null : stateIndex - 1,
    stateIndex,
    kind: event.kind,
    action: actionFor(event),
    scenarioMessage: event.message ? structuredClone(event.message) : null,
    message: expectedMessage(event),
    effects: structuredClone(effectsByEvent[eventIndex] ?? []),
    ...(event.expect ? { expect: event.expect } : {}),
    ...(event.sourceEvent !== undefined ? { sourceEvent: event.sourceEvent } : {}),
  };
});

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

function textNode(text) {
  return { kind: 2, tag: "", key: "", attrs: null, on: null, kids: null, text };
}

function attr(name, value = "", flag = false) {
  return { name, value, flag, style: null };
}

function element(tag, { key = "", attrs = null, on = null, kids = [] } = {}) {
  return { kind: 1, tag, key, attrs, on, kids, text: "" };
}

function paragraph(key, text) {
  return element("p", { key, kids: [textNode(text)] });
}

function button(key, label, message, arg, disabled = false) {
  return element("button", {
    key,
    attrs: disabled ? [attr("disabled", "", true)] : null,
    on: [{ event: "click", message, arg }],
    kids: [textNode(label)],
  });
}

function parentStatus(value) {
  if (!value.Alive) return "Parent removed";
  const requestStatus = value.Pending ? `pending ${value.Token}` : value.Reply ? `complete ${value.Reply}` : "idle";
  return `Parent generation ${value.Generation}; ${requestStatus}`;
}

function childStatus(value) {
  const requestStatus = value.Pending ? `pending ${value.Token}` : value.Reply ? `complete ${value.Reply}` : "idle";
  return `Child ${value.Key} generation ${value.Generation}; count=${String(value.Counter.Count)}; ${requestStatus}`;
}

/** Independent projection of the Go value snapshot to the serialized Gobi tree. */
export function expectedView(value) {
  const parentNode = element("section", {
    key: "parent",
    kids: [
      paragraph("parent-status", parentStatus(value.Parent)),
      button("parent-request", "Request parent", "parent.request", "", !value.Parent.Alive || value.Parent.Pending),
      button("parent-remove", "Remove parent", "parent.remove", "", !value.Parent.Alive),
      button("parent-remount", "Remount parent", "parent.remount", "", value.Parent.Alive),
    ],
  });
  const childRows = value.Children.map((childValue, index) => {
    const rowKids = [
      paragraph(`child-${childValue.Key}-status`, childStatus(childValue)),
      button(`child-${childValue.Key}-count`, `Add to ${childValue.Key}`, "counter.add", childValue.Key, !value.Parent.Alive),
      button(`child-${childValue.Key}-request`, `Request ${childValue.Key}`, "child.request", childValue.Key,
        !value.Parent.Alive || childValue.Pending),
      button(`child-${childValue.Key}-remove`, `Remove ${childValue.Key}`, "child.remove", childValue.Key, !value.Parent.Alive),
    ];
    if (index > 0) {
      rowKids.push(button(`child-${childValue.Key}-move-up`, `Move ${childValue.Key} up`, "children.swap",
        `${value.Children[index - 1].Key}:${childValue.Key}`));
    }
    return element("section", { key: `child-${childValue.Key}`, attrs: [attr("class", "child")], kids: rowKids });
  });
  const childList = element("div", { key: "children", attrs: [attr("class", "children")], kids: childRows });
  const controls = ["oak", "elm", "ash", "pine"].map((key) => button(`child-add-${key}`, `Add ${key}`, "child.add", key,
    !value.Parent.Alive || value.Children.some((childValue) => childValue.Key === key)));
  controls.push(button("children-clear", "Clear children", "children.clear", "",
    !value.Parent.Alive || value.Children.length === 0));
  const controlAside = element("aside", { key: "children-controls", kids: controls });
  return element("main", {
    key: "compiled-children",
    attrs: [attr("class", "compiled-children")],
    kids: [parentNode, childList, controlAside],
  });
}

function escaped(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function buttonHTML(label, disabled = false) {
  return `<button${disabled ? ' disabled=""' : ""}>${escaped(label)}</button>`;
}

function control(path, key, disabled) {
  return { path, key, tag: "button", type: "submit", value: "", checked: false, disabled };
}

/** Independent normalized physical DOM expectation from the literal Go snapshot. */
export function expectedDOM(value) {
  const controls = [];
  let parentHTML;
  if (value.Parent.Alive) {
    const parentRequestDisabled = value.Parent.Pending;
    parentHTML = `<section><p>${escaped(parentStatus(value.Parent))}</p>` +
      `${buttonHTML("Request parent", parentRequestDisabled)}${buttonHTML("Remove parent")}` +
      `${buttonHTML("Remount parent", true)}</section>`;
    controls.push(
      control("0/1", "parent-request", parentRequestDisabled),
      control("0/2", "parent-remove", false),
      control("0/3", "parent-remount", true),
    );
  } else {
    parentHTML = `<section><p>Parent removed</p>${buttonHTML("Request parent", true)}` +
      `${buttonHTML("Remove parent", true)}${buttonHTML("Remount parent")}</section>`;
    controls.push(
      control("0/1", "parent-request", true),
      control("0/2", "parent-remove", true),
      control("0/3", "parent-remount", false),
    );
  }

  const childHTML = value.Children.map((childValue, index) => {
    const disabled = !value.Parent.Alive;
    const requestDisabled = disabled || childValue.Pending;
    const rowHTML = `<section class="child"><p>${escaped(childStatus(childValue))}</p>` +
      `${buttonHTML(`Add to ${childValue.Key}`, disabled)}` +
      `${buttonHTML(`Request ${childValue.Key}`, requestDisabled)}` +
      `${buttonHTML(`Remove ${childValue.Key}`, disabled)}` +
      `${index > 0 ? buttonHTML(`Move ${childValue.Key} up`) : ""}</section>`;
    const path = `1/${index}`;
    controls.push(
      control(`${path}/1`, `child-${childValue.Key}-count`, disabled),
      control(`${path}/2`, `child-${childValue.Key}-request`, requestDisabled),
      control(`${path}/3`, `child-${childValue.Key}-remove`, disabled),
    );
    if (index > 0) controls.push(control(`${path}/4`, `child-${childValue.Key}-move-up`, false));
    return rowHTML;
  }).join("");

  const labels = ["oak", "elm", "ash", "pine"];
  const addHTML = labels.map((key, index) => {
    const disabled = !value.Parent.Alive || value.Children.some((childValue) => childValue.Key === key);
    controls.push(control(`2/${index}`, `child-add-${key}`, disabled));
    return buttonHTML(`Add ${key}`, disabled);
  }).join("");
  const clearDisabled = !value.Parent.Alive || value.Children.length === 0;
  controls.push(control("2/4", "children-clear", clearDisabled));
  const clearHTML = buttonHTML("Clear children", clearDisabled);
  return {
    normalization: "outerHTML-v1",
    html: `<main class="compiled-children">${parentHTML}<div class="children">${childHTML}</div>` +
      `<aside>${addHTML}${clearHTML}</aside></main>`,
    controls,
  };
}

const stateProjections = ORACLE_STATES.map((snapshot, stateIndex) => {
  const view = expectedView(snapshot);
  return {
    stateIndex,
    state: structuredClone(snapshot),
    view,
    viewRecord: { tree: structuredClone(view), bindings: [] },
    dom: expectedDOM(snapshot),
  };
});

export const ORACLE_EXPECTATIONS = freeze({
  schema: "gobi.compiled-children-oracle-expectations/v1",
  scenario: {
    schema: ORACLE_SCENARIO.schema,
    name: ORACLE_SCENARIO.name,
    packagePath: ORACLE_SCENARIO.packagePath,
    componentID: ORACLE_SCENARIO.componentID,
    eventCount: ORACLE_SCENARIO.events.length,
  },
  initialProjection: structuredClone(stateProjections[0]),
  stateProjections,
  events,
  probes: {
    disabledRequest: {
      afterEvent: 9,
      stateIndex: 9,
      path: "1/1/2",
      message: { name: "child.request", arg: "oak" },
      expect: "disabled",
      addsGoTick: false,
    },
    compatibleSwap: {
      eventIndex: 10,
      from: "dom",
      to: "react",
      target: "root",
      expect: "accepted",
      stateIndex: 9,
      pendingTokens: ["child:oak:g2:r1", "child:elm:g3:r1", "child:ash:g4:r1"],
      childOrder: ["ash", "oak", "elm"],
      addsGoTick: false,
    },
    retiredCallback: {
      eventIndex: 11,
      sourceEvent: 0,
      from: "dom",
      path: "1/0/1",
      message: { name: "counter.add", arg: "oak" },
      expect: "suppressed",
      stateIndex: 9,
      addsGoTick: false,
    },
    incompatibleSwap: {
      eventIndex: 12,
      from: "react",
      to: "incompatible",
      target: "root",
      expect: "rejected",
      stateIndex: 9,
      activeRendererAfter: "react",
      pendingTokens: ["child:oak:g2:r1", "child:elm:g3:r1", "child:ash:g4:r1"],
      addsGoTick: false,
    },
    cancelledOldReply: {
      afterEvent: 14,
      stateIndex: 11,
      token: "child:oak:g2:r1",
      expect: "rejected-cancelled",
      addsGoTick: false,
    },
    clearChildrenOnly: {
      afterEvent: 24,
      stateIndex: 21,
      expectedCancellationOrder: ["child:oak:g5:r2", "child:elm:g3:r2"],
      parentTokenStillPending: "parent:g1:r1",
      childrenAfter: [],
    },
    parentRemoval: {
      afterEvent: 31,
      stateIndex: 28,
      expectedCancellationOrder: ["child:oak:g7:r1", "child:pine:g6:r1", "parent:g1:r2"],
      childrenAfter: [],
      parentAliveAfter: false,
    },
  },
});

export function expectedStateAt(stateIndex) {
  if (!Number.isSafeInteger(stateIndex) || stateIndex < 0 || stateIndex >= ORACLE_STATES.length) {
    throw new RangeError(`stateIndex must be between 0 and ${ORACLE_STATES.length - 1}`);
  }
  return structuredClone(ORACLE_STATES[stateIndex]);
}

export function eventExpectation(eventIndex) {
  if (!Number.isSafeInteger(eventIndex) || eventIndex < 0 || eventIndex >= ORACLE_EXPECTATIONS.events.length) {
    throw new RangeError(`eventIndex must be between 0 and ${ORACLE_EXPECTATIONS.events.length - 1}`);
  }
  return structuredClone(ORACLE_EXPECTATIONS.events[eventIndex]);
}

export function expectedProjection(stateIndex) {
  const item = ORACLE_EXPECTATIONS.stateProjections[stateIndex];
  if (!item) throw new RangeError(`stateIndex must be between 0 and ${ORACLE_STATES.length - 1}`);
  return { state: structuredClone(item.state), view: structuredClone(item.view), dom: structuredClone(item.dom) };
}

export function assertProjection(actual, stateIndex, path = "$.capture") {
  const expected = expectedProjection(stateIndex);
  assertExactTraceValue(expected.state, actual?.state, `${path}.state`);
  assertExactTraceValue(expected.view, actual?.view, `${path}.view`);
  assertExactTraceValue(expected.dom, actual?.dom, `${path}.dom`);
  return true;
}

function expectedNativeEvent(eventIndex) {
  const source = ORACLE_SCENARIO.events[eventIndex];
  const expected = { index: eventIndex, kind: source.kind };
  for (const key of ["path", "event", "value", "token", "from", "to", "target", "expect", "sourceEvent"]) {
    if (source[key] !== undefined && source[key] !== "") expected[key] = source[key];
  }
  const scenarioRow = ORACLE_EXPECTATIONS.events[eventIndex];
  const eventMessage = scenarioRow.message ?? scenarioRow.scenarioMessage;
  if (eventMessage !== null) expected.message = structuredClone(eventMessage);
  if (scenarioRow.stepIndex !== null) expected.stepIndex = scenarioRow.stepIndex;
  return expected;
}

/** Compare a native capture against the separately authored state/view oracle. */
export function assertNativeCapture(actual, path = "$.native") {
  assertExactTraceValue("gobi.compiled-children-native/v1", actual?.schema, `${path}.schema`);
  assertExactTraceValue(ORACLE_SCENARIO.name, actual?.name, `${path}.name`);
  assertExactTraceValue(ORACLE_SCENARIO.packagePath, actual?.packagePath, `${path}.packagePath`);
  assertExactTraceValue(ORACLE_SCENARIO.componentID, actual?.componentID, `${path}.componentID`);
  assertExactTraceValue(expectedStateAt(0), actual?.initialState, `${path}.initialState`);
  assertExactTraceValue(ORACLE_EXPECTATIONS.stateProjections[0].view, actual?.initialView, `${path}.initialView`);
  assertExactTraceValue(ORACLE_SCENARIO.events.length, actual?.events?.length, `${path}.events.length`);
  assertExactTraceValue(ORACLE_EXPECTATIONS.events.filter((event) => event.stepIndex !== null).length,
    actual?.steps?.length, `${path}.steps.length`);

  for (let eventIndex = 0; eventIndex < ORACLE_SCENARIO.events.length; eventIndex += 1) {
    assertExactTraceValue(expectedNativeEvent(eventIndex), actual.events[eventIndex], `${path}.events[${eventIndex}]`);
    const expected = ORACLE_EXPECTATIONS.events[eventIndex];
    if (expected.stepIndex === null) continue;
    const step = actual.steps[expected.stepIndex];
    const projection = ORACLE_EXPECTATIONS.stateProjections[expected.stateIndex];
    assertExactTraceValue(eventIndex, step?.eventIndex, `${path}.steps[${expected.stepIndex}].eventIndex`);
    assertExactTraceValue(expected.kind, step?.kind, `${path}.steps[${expected.stepIndex}].kind`);
    assertExactTraceValue(expected.message, step?.message, `${path}.steps[${expected.stepIndex}].message`);
    assertExactTraceValue(expected.effects, step?.effects, `${path}.steps[${expected.stepIndex}].effects`);
    assertExactTraceValue(projection.state, step?.state, `${path}.steps[${expected.stepIndex}].state`);
    assertExactTraceValue(projection.view, step?.view, `${path}.steps[${expected.stepIndex}].view`);
  }
  return true;
}

export function writeExpectations(path = new URL("./expectations.json", import.meta.url)) {
  writeFileSync(path, `${JSON.stringify(ORACLE_EXPECTATIONS)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) writeExpectations();
