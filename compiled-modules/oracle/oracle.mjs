import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { encodeFixtureState } from "../../compiled-frontend/conformance/fixture-expectations.mjs";

export const ORACLE_SCHEMA = "gobi.compiled-modules-oracle/v1";
export const SCENARIO_NAME = "independent-module-pair-v1";
export const FIXED_EVENT_COUNT = 24;

const p = (step, locked, revision, publishedCount, publishedRevision) => ({
  Step: step, Locked: locked, Revision: revision,
  PublishedCount: publishedCount, PublishedRevision: publishedRevision,
});
const c = (count, step, locked, inputRevision) => ({
  Counter: { Count: count }, Step: step, Locked: locked, InputRevision: inputRevision,
});
const input = (Step, Locked, Revision) => ({ Step, Locked, Revision });
const publication = (Count, Revision) => ({ Count, Revision });

// These are manually specified Go state checkpoints, independent of native and
// generated-JS captures. There is one entry after every source event; tick-free
// events repeat the prior Go values and expect no bridge calls.
export const EXPECTED_EVENTS = Object.freeze([
  { eventIndex: 0, target: "child", message: { name: "add", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(1, 1), parent: p(1, false, 1, 1, 1), child: c(1, 1, false, 1) },
  { eventIndex: 1, target: "parent", message: { name: "step.up", arg: "" }, bridgeRoles: ["output", "input"], input: input(2, false, 2), parent: p(2, false, 2, 1, 1), child: c(1, 2, false, 2) },
  { eventIndex: 2, target: "child", message: { name: "add", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(3, 2), parent: p(2, false, 2, 3, 2), child: c(3, 2, false, 2) },
  { eventIndex: 3, target: "parent", message: { name: "lock.toggle", arg: "" }, bridgeRoles: ["output", "input"], input: input(2, true, 3), parent: p(2, true, 3, 3, 2), child: c(3, 2, true, 3) },
  { eventIndex: 4, target: "child", message: null, bridgeRoles: [], disabled: true, parent: p(2, true, 3, 3, 2), child: c(3, 2, true, 3) },
  { eventIndex: 5, target: "child", message: { name: "reset", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(0, 3), parent: p(2, true, 3, 0, 3), child: c(0, 2, true, 3) },
  { eventIndex: 6, target: "child", message: null, bridgeRoles: [], disabled: true, parent: p(2, true, 3, 0, 3), child: c(0, 2, true, 3) },
  { eventIndex: 7, target: "parent", message: { name: "step.up", arg: "" }, bridgeRoles: ["output", "input"], input: input(3, true, 4), parent: p(3, true, 4, 0, 3), child: c(0, 3, true, 4) },
  { eventIndex: 8, target: "child", message: null, bridgeRoles: [], disabled: true, parent: p(3, true, 4, 0, 3), child: c(0, 3, true, 4) },
  { eventIndex: 9, target: "parent", message: { name: "input.reset", arg: "" }, bridgeRoles: ["output", "input"], input: input(1, false, 5), parent: p(1, false, 5, 0, 3), child: c(0, 1, false, 5) },
  { eventIndex: 10, target: "child", message: { name: "add", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(1, 5), parent: p(1, false, 5, 1, 5), child: c(1, 1, false, 5) },
  { eventIndex: 11, target: null, message: null, bridgeRoles: [], rendererSwap: true, parent: p(1, false, 5, 1, 5), child: c(1, 1, false, 5) },
  { eventIndex: 12, target: null, message: null, bridgeRoles: [], staleCallback: true, parent: p(1, false, 5, 1, 5), child: c(1, 1, false, 5) },
  { eventIndex: 13, target: "parent", message: { name: "step.up", arg: "" }, bridgeRoles: ["output", "input"], input: input(2, false, 6), parent: p(2, false, 6, 1, 5), child: c(1, 2, false, 6) },
  { eventIndex: 14, target: "child", message: { name: "add", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(3, 6), parent: p(2, false, 6, 3, 6), child: c(3, 2, false, 6) },
  { eventIndex: 15, target: "child", message: { name: "reset", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(0, 6), parent: p(2, false, 6, 0, 6), child: c(0, 2, false, 6) },
  { eventIndex: 16, target: "child", message: null, bridgeRoles: [], disabled: true, parent: p(2, false, 6, 0, 6), child: c(0, 2, false, 6) },
  { eventIndex: 17, target: "parent", message: { name: "lock.toggle", arg: "" }, bridgeRoles: ["output", "input"], input: input(2, true, 7), parent: p(2, true, 7, 0, 6), child: c(0, 2, true, 7) },
  { eventIndex: 18, target: "child", message: { name: "add", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(0, 7), parent: p(2, true, 7, 0, 7), child: c(0, 2, true, 7) },
  { eventIndex: 19, target: "parent", message: { name: "input.reset", arg: "" }, bridgeRoles: ["output", "input"], input: input(1, false, 8), parent: p(1, false, 8, 0, 7), child: c(0, 1, false, 8) },
  { eventIndex: 20, target: "parent", message: null, bridgeRoles: [], disabled: true, parent: p(1, false, 8, 0, 7), child: c(0, 1, false, 8) },
  { eventIndex: 21, target: "child", message: { name: "add", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(1, 8), parent: p(1, false, 8, 1, 8), child: c(1, 1, false, 8) },
  { eventIndex: 22, target: "child", message: { name: "reset", arg: "" }, bridgeRoles: ["publication", "receive"], publication: publication(0, 8), parent: p(1, false, 8, 0, 8), child: c(0, 1, false, 8) },
  { eventIndex: 23, target: null, message: null, bridgeRoles: [], rendererSwap: true, parent: p(1, false, 8, 0, 8), child: c(0, 1, false, 8) },
]);

const attr = (name, value = "", flag = false) => ({ name, value, flag, style: null });
const node = (kind, tag, key, attrs, on, kids, text = "") => ({ kind, tag, key, attrs, on, kids, text });
const txt = (text) => node(2, "", "", null, null, null, text);
const el = (tag, key, attrs, on, kids) => node(1, tag, key, attrs, on, kids);
const handler = (message, arg = "") => [{ event: "click", message, arg }];

export function expectedParentView(state) {
  const publicationText = state.PublishedRevision > 0
    ? `Published count ${String(state.PublishedCount)} at revision ${state.PublishedRevision}`
    : "No publication";
  const stepDownAttrs = [attr("class", "module-step-down")];
  const stepUpAttrs = [attr("class", "module-step-up")];
  if (state.Step <= 1) stepDownAttrs.push(attr("disabled", "", true));
  if (state.Step >= 3) stepUpAttrs.push(attr("disabled", "", true));
  const lockLabel = state.Locked ? "Locked" : "Unlocked";
  return el("main", "module-parent", [attr("class", "compiled-module-parent")], null, [
    el("p", "", [attr("class", "module-parent-step")], null, [txt("Step: "), txt(String(state.Step))]),
    el("button", "", stepDownAttrs, handler("step.down"), [txt("Step −")]),
    el("button", "", stepUpAttrs, handler("step.up"), [txt("Step +")]),
    el("button", "", [attr("class", "module-lock-toggle")], handler("lock.toggle"), [txt(lockLabel)]),
    el("button", "", [attr("class", "module-input-reset")], handler("input.reset"), [txt("Reset input")]),
    el("p", "", [attr("class", "module-parent-publication")], null, [txt(publicationText)]),
  ]);
}

export function expectedChildView(state) {
  const count = String(state.Counter.Count);
  const locked = state.Locked ? "Locked" : "Unlocked";
  const addAttrs = [attr("class", "add")];
  let resetAttrs = null;
  if (state.Locked) addAttrs.push(attr("disabled", "", true));
  if (state.Counter.Count === 0) resetAttrs = [attr("disabled", "", true)];
  return el("section", "module-child", [attr("class", "compiled-module-child")], null, [
    el("p", "", [attr("class", "module-child-input")], null, [
      txt("Step: "), txt(String(state.Step)), txt("; "), txt(locked), txt("; input revision: "), txt(String(state.InputRevision)),
    ]),
    el("p", "", [attr("class", "module-child-publication")], null, [txt("Child publication count: "), txt(count)]),
    el("div", "", [attr("class", "counter")], null, [
      el("p", "", null, null, [txt("Count: "), txt(count)]),
      el("button", "", addAttrs, handler("add"), [txt("+")]),
      el("button", "", resetAttrs, handler("reset"), [txt("Reset")]),
    ]),
  ]);
}

export function expectedParentDOM(state) {
  const downDisabled = state.Step <= 1 ? ' disabled=""' : "";
  const upDisabled = state.Step >= 3 ? ' disabled=""' : "";
  const lockLabel = state.Locked ? "Locked" : "Unlocked";
  const publicationText = state.PublishedRevision > 0
    ? `Published count ${String(state.PublishedCount)} at revision ${state.PublishedRevision}`
    : "No publication";
  return {
    normalization: "outerHTML-v1",
    html: `<main class="compiled-module-parent"><p class="module-parent-step">Step: ${state.Step}</p>` +
      `<button class="module-step-down"${downDisabled}>Step −</button><button class="module-step-up"${upDisabled}>Step +</button>` +
      `<button class="module-lock-toggle">${lockLabel}</button><button class="module-input-reset">Reset input</button>` +
      `<p class="module-parent-publication">${publicationText}</p></main>`,
    controls: [
      { path: "1", key: "", tag: "button", type: "submit", value: "", checked: false, disabled: state.Step <= 1 },
      { path: "2", key: "", tag: "button", type: "submit", value: "", checked: false, disabled: state.Step >= 3 },
      { path: "3", key: "", tag: "button", type: "submit", value: "", checked: false, disabled: false },
      { path: "4", key: "", tag: "button", type: "submit", value: "", checked: false, disabled: false },
    ],
  };
}

export function expectedChildDOM(state) {
  const count = String(state.Counter.Count);
  const addDisabled = state.Locked ? ' disabled=""' : "";
  const resetDisabled = state.Counter.Count === 0 ? ' disabled=""' : "";
  const locked = state.Locked ? "Locked" : "Unlocked";
  return {
    normalization: "outerHTML-v1",
    html: `<section class="compiled-module-child"><p class="module-child-input">Step: ${state.Step}; ${locked}; input revision: ${state.InputRevision}</p>` +
      `<p class="module-child-publication">Child publication count: ${count}</p>` +
      `<div class="counter"><p>Count: ${count}</p><button class="add"${addDisabled}>+</button><button${resetDisabled}>Reset</button></div></section>`,
    controls: [
      { path: "2/1", key: "", tag: "button", type: "submit", value: "", checked: false, disabled: state.Locked },
      { path: "2/2", key: "", tag: "button", type: "submit", value: "", checked: false, disabled: state.Counter.Count === 0 },
    ],
  };
}

export function checkpointLiterals() {
  const initial = {
    stateIndex: 0,
    sourceEventIndex: null,
    parent: p(1, false, 1, 0, 1),
    child: c(0, 1, false, 1),
    bridges: [
      { role: "output", value: input(1, false, 1) },
      { role: "input", value: input(1, false, 1) },
      { role: "publication", value: publication(0, 1) },
      { role: "receive", value: publication(0, 1) },
    ],
  };
  const events = EXPECTED_EVENTS.map((event) => ({
    eventIndex: event.eventIndex,
    sourceEventIndex: event.eventIndex,
    parent: cloneState(event.parent),
    child: cloneState(event.child),
    bridgeRoles: [...event.bridgeRoles],
    input: event.input ? { ...event.input } : null,
    publication: event.publication ? { ...event.publication } : null,
    message: event.message ? { ...event.message } : null,
  }));
  return { initial, events };
}

function cloneState(state) {
  return structuredClone(state);
}

export function encodeLiteralState(side, state, component, appIR) {
  return encodeFixtureState(state, component.stateType, appIR.types);
}

export function assertExpectedProjection({ expected, actual, path = "$" }) {
  assertExactTraceValue(expected, actual, path);
}
