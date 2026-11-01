import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { literalKeyedScenario } from "../conformance/scenarios.mjs";

const NATIVE_SCHEMA = "gobi.keyed-module-native/v1";
const SNAPSHOT_SCHEMA = "gobi.keyed-module-snapshot/v1";
const IDENTITY_SCHEMA = "gobi.keyed-module-dom-identity/v1";
const CORE_EVENT_COUNT = 18;
const SEMANTIC_EXPECTATIONS = JSON.parse(readFileSync(new URL("./expectations.json", import.meta.url), "utf8"));
const PARENT_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent";
const CHILD_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild";
const DEFAULT_REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const CORE_INTENTS = [
  ["click", "child", "a", 1, "2/1", null],
  ["click", "child", "b", 1, "2/1", null],
  ["click", "parent", "", 0, "3", null],
  ["click", "child", "a", 1, "2/1", null],
  ["click", "parent", "", 0, "3", null],
  ["click", "child", "a", 1, "2/2", null],
  ["click", "child", "a", 1, "2/2", null],
  ["click", "child", "b", 1, "2/1", null],
  ["click", "parent", "", 0, "6/4", null],
  ["click", "child", "a", 1, "2/1", null],
  ["click", "parent", "", 0, "6/1", null],
  ["stale-callback", "", "a", 1, "", 9],
  ["publication", "", "a", 1, "", 9],
  ["click", "parent", "", 0, "6/0", null],
  ["click", "child", "a", 2, "2/1", null],
  ["stale-callback", "", "a", 1, "", 9],
  ["publication", "", "a", 1, "", 9],
  ["click", "child", "b", 1, "2/2", null],
];

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function equal(expected, actual, path) {
  if (!isDeepStrictEqual(expected, actual)) {
    fail(path, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireRecord(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function intentOf(event) {
  return [
    event?.kind ?? "", event?.target ?? "", event?.key ?? "", event?.generation ?? 0,
    event?.action?.path ?? "", event?.sourceEvent ?? null,
  ];
}

function validateCoreScenario(scenario) {
  requireRecord(scenario, "scenario");
  if (scenario.schema !== "gobi.keyed-modules-scenario/v1") fail("scenario.schema", "unknown keyed-module scenario schema");
  if (typeof scenario.name !== "string" || !scenario.name) fail("scenario.name", "must be a non-empty scenario identity");
  const events = requireArray(scenario.events, "scenario.events");
  if (events.length < CORE_EVENT_COUNT) fail("scenario.events", `requires the ${CORE_EVENT_COUNT}-event literal prefix`);
  for (let index = 0; index < CORE_EVENT_COUNT; index += 1) {
    equal(CORE_INTENTS[index], intentOf(events[index]), `scenario.events[${index}].intent`);
    const event = events[index];
    if (event.kind === "click") {
      if (event.action?.event !== "click" || event.action?.value !== "") {
        fail(`scenario.events[${index}].action`, "literal controls must be click events with an empty value");
      }
    }
  }
  for (let index = CORE_EVENT_COUNT; index < events.length; index += 1) {
    const event = events[index];
    if (event.kind !== "click" || !["parent", "child"].includes(event.target)) {
      fail(`scenario.events[${index}]`, "seeded suffix must contain bounded parent or child clicks");
    }
  }
  if (scenario.name !== "keyed-modules-literal" && !/^keyed-modules-seed-\d+$/.test(scenario.name)) {
    fail("scenario.name", `unexpected literal/seed identity ${JSON.stringify(scenario.name)}`);
  }
  return events;
}

function emptyModel() {
  const model = {
    parent: { step: 1, locked: false, revision: 1, publishedCount: 0, publishedRevision: 0 },
    slots: {
      a: { key: "a", generation: 1, mounted: true, publishedCount: 0, publishedRevision: 0 },
      b: { key: "b", generation: 1, mounted: true, publishedCount: 0, publishedRevision: 0 },
    },
    order: ["a", "b"],
    children: new Map(),
    expectedMessages: [],
    expectedPublications: [],
  };
  model.children.set("a", childInstance(model.parent, 1, 0));
  model.children.set("b", childInstance(model.parent, 1, 0));
  publishToSlot(model, "a", 1);
  publishToSlot(model, "b", 1);
  return model;
}

function childInstance(parent, generation, count) {
  return { generation, count, step: parent.step, locked: parent.locked, inputRevision: parent.revision };
}

function publishToSlot(model, key, generation) {
  const child = model.children.get(key);
  const slot = model.slots[key];
  if (!child || !slot.mounted || slot.generation !== generation) return null;
  slot.publishedCount = child.count;
  slot.publishedRevision = child.inputRevision;
  return { key, generation, count: child.count, revision: child.inputRevision };
}

function syncInputs(model) {
  for (const key of model.order) {
    const child = model.children.get(key);
    child.step = model.parent.step;
    child.locked = model.parent.locked;
    child.inputRevision = model.parent.revision;
    publishToSlot(model, key, child.generation);
  }
}

function reverseOrder(model) {
  return model.order.length === 2 ? [...model.order].reverse() : [...model.order];
}

function messageFromClick(model, event, index) {
  const path = event.action?.path;
  if (event.target === "child") {
    if (path === "2/1") return { name: "add", arg: "" };
    if (path === "2/2") return { name: "reset", arg: "" };
    fail(`scenario.events[${index}].action.path`, `unknown child action path ${JSON.stringify(path)}`);
  }
  const parentMessages = {
    "1": { name: "step.down", arg: "" },
    "2": { name: "step.up", arg: "" },
    "3": { name: "lock.toggle", arg: "" },
    "4": { name: "input.reset", arg: "" },
    "6/0": { name: "child.add", arg: "a" },
    "6/1": { name: "child.remove", arg: "a" },
    "6/2": { name: "child.add", arg: "b" },
    "6/3": { name: "child.remove", arg: "b" },
  };
  if (path === "6/4") return { name: "children.reorder", arg: reverseOrder(model).join(",") };
  const message = parentMessages[path];
  if (!message) fail(`scenario.events[${index}].action.path`, `unknown parent action path ${JSON.stringify(path)}`);
  return message;
}

function disabledClick(model, event, message, index) {
  if (event.target === "child") {
    const child = model.children.get(event.key);
    if (!child || child.generation !== event.generation || !model.slots[event.key]?.mounted) {
      fail(`scenario.events[${index}]`, `child ${event.key} generation ${event.generation} is not current for a click`);
    }
    return (message.name === "add" && child.locked) || (message.name === "reset" && child.count === 0);
  }
  switch (message.name) {
    case "step.down": return model.parent.step <= 1;
    case "step.up": return model.parent.step >= 3;
    case "child.add": return model.slots[message.arg].mounted || model.order.length >= 2;
    case "child.remove": return !model.slots[message.arg].mounted;
    case "children.reorder": return model.order.length !== 2;
    default: return false;
  }
}

function applyParentMessage(model, message) {
  const { name, arg } = message;
  if (name === "child.add") {
    const slot = model.slots[arg];
    if (!slot || slot.mounted || model.order.length >= 2 || slot.generation >= Number.MAX_SAFE_INTEGER) return false;
    slot.generation += 1;
    slot.mounted = true;
    slot.publishedCount = 0;
    slot.publishedRevision = 0;
    model.children.set(arg, childInstance(model.parent, slot.generation, 0));
    model.order.push(arg);
    syncInputs(model);
    return true;
  }
  if (name === "child.remove") {
    const slot = model.slots[arg];
    if (!slot?.mounted) return false;
    slot.mounted = false;
    model.children.delete(arg);
    model.order = model.order.filter((key) => key !== arg);
    syncInputs(model);
    return true;
  }
  if (name === "children.reorder") {
    const desired = arg.split(",");
    if (model.order.length !== 2 || desired.length !== 2 || new Set(desired).size !== 2 ||
        !desired.every((key) => model.order.includes(key))) return false;
    model.order = desired;
    syncInputs(model);
    return true;
  }

  let changed = false;
  switch (name) {
    case "step.down":
      if (arg === "" && model.parent.step > 1) { model.parent.step -= 1; changed = true; }
      break;
    case "step.up":
      if (arg === "" && model.parent.step < 3) { model.parent.step += 1; changed = true; }
      break;
    case "lock.toggle":
      if (arg === "") { model.parent.locked = !model.parent.locked; changed = true; }
      break;
    case "input.reset":
      if (arg === "") { model.parent.step = 1; model.parent.locked = false; changed = true; }
      break;
    default: break;
  }
  if (changed) {
    model.parent.revision += 1;
    syncInputs(model);
  }
  return true;
}

function applyChildMessage(model, key, generation, message) {
  const child = model.children.get(key);
  if (!child || !model.slots[key]?.mounted || child.generation !== generation || model.slots[key].generation !== generation) return null;
  if (message.name === "add" && message.arg === "" && !child.locked) child.count += child.step;
  if (message.name === "reset" && message.arg === "" && child.count > 0) child.count = 0;
  return publishToSlot(model, key, generation);
}

function applyPublication(model, key, generation, publication) {
  const slot = model.slots[key];
  if (!slot?.mounted || slot.generation !== generation || publication.revision !== model.parent.revision ||
      !Number.isFinite(publication.count) || publication.count < 0 || publication.count > Number.MAX_SAFE_INTEGER) return false;
  slot.publishedCount = publication.count;
  slot.publishedRevision = publication.revision;
  return true;
}

function snapshotModel(model) {
  const children = model.order.map((key) => {
    const child = model.children.get(key);
    const slot = model.slots[key];
    return {
      key, generation: child.generation,
      input: { step: child.step, locked: child.locked, revision: child.inputRevision },
      childState: { count: child.count, step: child.step, locked: child.locked, inputRevision: child.inputRevision },
      publication: { key, generation: slot.generation, count: slot.publishedCount, revision: slot.publishedRevision },
    };
  });
  return {
    parentState: { ...model.parent },
    controllerState: {
      a: { ...model.slots.a }, b: { ...model.slots.b },
      first: model.order[0] ?? "", second: model.order[1] ?? "", childCount: model.order.length,
    },
    children,
  };
}

function compareNativeSnapshot(actual, model, path) {
  requireRecord(actual, path);
  const expected = snapshotModel(model);
  equal(expected.parentState, actual.parentState, `${path}.parentState`);
  equal(expected.controllerState, actual.controllerState, `${path}.controllerState`);
  const actualChildren = requireArray(actual.children, `${path}.children`);
  if (actualChildren.length !== expected.children.length) fail(`${path}.children`, `expected ${expected.children.length} mounted children, got ${actualChildren.length}`);
  for (let index = 0; index < expected.children.length; index += 1) {
    const want = expected.children[index];
    const got = actualChildren[index];
    equal(want.key, got?.key, `${path}.children[${index}].key`);
    equal(want.generation, got?.generation, `${path}.children[${index}].generation`);
    equal(want.input, got?.input, `${path}.children[${index}].input`);
    equal(want.childState, got?.childState, `${path}.children[${index}].childState`);
    equal(want.publication, got?.publication, `${path}.children[${index}].publication`);
    validateChildView(got?.view, want, `${path}.children[${index}].view`);
  }
  validateParentView(actual.parentView, expected, `${path}.parentView`);
}

function attrValue(node, name) {
  return (node?.attrs ?? []).find((item) => item?.name === name)?.value;
}

function isDisabled(node) {
  return (node?.attrs ?? []).some((item) => item?.name === "disabled" && item?.flag === true);
}

function textOf(node) {
  if (!node || typeof node !== "object") return "";
  return `${typeof node.text === "string" ? node.text : ""}${Array.isArray(node.kids) ? node.kids.map(textOf).join("") : ""}`;
}

function handlerOf(node) {
  return Array.isArray(node?.on) && node.on.length === 1
    ? { name: node.on[0]?.message, arg: node.on[0]?.arg, event: node.on[0]?.event }
    : null;
}

function validateParentView(view, expected, path) {
  requireRecord(view, path);
  equal([1, "main", "keyed-module-parent", "compiled-module-parent"],
    [view.kind, view.tag, view.key, attrValue(view, "class")], `${path}.root`);
  const kids = requireArray(view.kids, `${path}.kids`);
  if (kids.length !== 8) fail(`${path}.kids`, `expected 8 parent projection groups, got ${kids.length}`);
  equal(["p", "module-parent-step", `Step: ${expected.parentState.step}`],
    [kids[0]?.tag, attrValue(kids[0], "class"), textOf(kids[0])], `${path}.stepLabel`);
  validateButton(kids[1], "Step −", "step.down", "", expected.parentState.step <= 1, `${path}.stepDown`, "module-step-down");
  validateButton(kids[2], "Step +", "step.up", "", expected.parentState.step >= 3, `${path}.stepUp`, "module-step-up");
  validateButton(kids[3], expected.parentState.locked ? "Locked" : "Unlocked", "lock.toggle", "", false, `${path}.lockToggle`, "module-lock-toggle");
  validateButton(kids[4], "Reset input", "input.reset", "", false, `${path}.inputReset`, "module-input-reset");
  const parentPublication = expected.parentState.publishedRevision > 0
    ? `Published count ${expected.parentState.publishedCount} at revision ${expected.parentState.publishedRevision}`
    : "No publication";
  equal(["p", "module-parent-publication", parentPublication],
    [kids[5]?.tag, attrValue(kids[5], "class"), textOf(kids[5])], `${path}.publicationLabel`);
  const controls = kids[6];
  equal(["section", "keyed-membership-controls", "keyed-membership-controls"],
    [controls?.tag, controls?.key, attrValue(controls, "class")], `${path}.membershipControls`);
  const buttons = requireArray(controls?.kids, `${path}.membershipControls.kids`);
  if (buttons.length !== 5) fail(`${path}.membershipControls.kids`, `expected 5 controls, got ${buttons.length}`);
  const byButton = [
    { name: "child.add", arg: "a", label: "Mount a", disabled: expected.controllerState.a.mounted || expected.controllerState.childCount >= 2 },
    { name: "child.remove", arg: "a", label: "Remove a", disabled: !expected.controllerState.a.mounted },
    { name: "child.add", arg: "b", label: "Mount b", disabled: expected.controllerState.b.mounted || expected.controllerState.childCount >= 2 },
    { name: "child.remove", arg: "b", label: "Remove b", disabled: !expected.controllerState.b.mounted },
    { name: "children.reorder", arg: expected.children.length === 2 ? `${expected.children[1].key},${expected.children[0].key}` :
      (expected.children[0]?.key === "a" ? "b,a" : "a,b"), label: "Reorder children", disabled: expected.controllerState.childCount !== 2 },
  ];
  for (let index = 0; index < byButton.length; index += 1) {
    const button = buttons[index];
    const want = byButton[index];
    equal(want.label, textOf(button), `${path}.membershipControls.kids[${index}].label`);
    equal({ name: want.name, arg: want.arg, event: "click" }, handlerOf(button), `${path}.membershipControls.kids[${index}].handler`);
    equal(want.disabled, isDisabled(button), `${path}.membershipControls.kids[${index}].disabled`);
  }
  const summaries = kids[7];
  equal(["section", "keyed-child-summaries", "keyed-child-summaries"],
    [summaries?.tag, summaries?.key, attrValue(summaries, "class")], `${path}.childSummaries`);
  const rows = requireArray(summaries?.kids, `${path}.childSummaries.kids`);
  equal(expected.children.map((child) => child.key), rows.map((row) => row.key), `${path}.childSummaries.order`);
  for (let index = 0; index < rows.length; index += 1) {
    const child = expected.children[index];
    const slot = expected.controllerState[child.key];
    const label = `${child.key} generation ${child.generation} publication count ${slot.publishedCount}` +
      (slot.publishedRevision > 0 ? ` at revision ${slot.publishedRevision}` : "");
    if (!textOf(rows[index]).includes(label)) fail(`${path}.childSummaries.kids[${index}]`, `missing ${JSON.stringify(label)}`);
  }
}

function validateChildView(view, expected, path) {
  requireRecord(view, path);
  equal([1, "section", "module-child", "compiled-module-child"],
    [view.kind, view.tag, view.key, attrValue(view, "class")], `${path}.root`);
  const text = textOf(view);
  const mustContain = [
    `Step: ${expected.input.step}; ${expected.input.locked ? "Locked" : "Unlocked"}; input revision: ${expected.input.revision}`,
    `Child publication count: ${expected.childState.count}`,
    `Count: ${expected.childState.count}`,
  ];
  for (const item of mustContain) if (!text.includes(item)) fail(path, `view text is missing ${JSON.stringify(item)}`);
  const kids = requireArray(view.kids, `${path}.kids`);
  if (kids.length !== 3) fail(`${path}.kids`, `expected input/publication/counter regions, got ${kids.length}`);
  equal("module-child-input", attrValue(kids[0], "class"), `${path}.inputClass`);
  equal("module-child-publication", attrValue(kids[1], "class"), `${path}.publicationClass`);
  const counter = kids[2];
  equal(["div", "counter"], [counter?.tag, attrValue(counter, "class")], `${path}.counterRoot`);
  const counterKids = requireArray(counter?.kids, `${path}.counter.kids`);
  if (counterKids.length !== 3) fail(`${path}.counter.kids`, `expected count/Add/Reset nodes, got ${counterKids.length}`);
  equal(`Count: ${expected.childState.count}`, textOf(counterKids[0]), `${path}.counter.count`);
  validateButton(counterKids[1], "+", "add", "", expected.childState.locked, `${path}.counter.add`, "add");
  validateButton(counterKids[2], "Reset", "reset", "", expected.childState.count === 0, `${path}.counter.reset`, undefined);
}

function validateButton(node, label, message, arg, disabled, path, className) {
  equal([1, "button", className], [node?.kind, node?.tag, attrValue(node, "class")], `${path}.identity`);
  equal(label, textOf(node), `${path}.label`);
  equal({ name: message, arg, event: "click" }, handlerOf(node), `${path}.handler`);
  equal(disabled, isDisabled(node), `${path}.disabled`);
}

function expectedMessage(model, event, index) {
  if (event.kind === "click") return messageFromClick(model, event, index);
  if (event.kind === "parent-message" || event.kind === "child-message") return event.message;
  if (event.kind === "stale-callback") return model.expectedMessages[event.sourceEvent] ?? null;
  return null;
}

function replayEvent(model, event, index) {
  let message = expectedMessage(model, event, index);
  let accepted = false;
  let publication = null;
  if (event.kind === "click") {
    accepted = !disabledClick(model, event, message, index);
    if (accepted && event.target === "parent") applyParentMessage(model, message);
    else if (accepted && event.target === "child") publication = applyChildMessage(model, event.key, event.generation, message);
  } else if (event.kind === "parent-message") {
    accepted = true;
    applyParentMessage(model, message);
  } else if (event.kind === "child-message") {
    const child = model.children.get(event.key);
    accepted = Boolean(child && child.generation === event.generation && model.slots[event.key]?.mounted);
    if (accepted) publication = applyChildMessage(model, event.key, event.generation, message);
  } else if (event.kind === "stale-callback") {
    accepted = false;
  } else if (event.kind === "publication") {
    const sourcePublication = event.sourceEvent !== undefined && event.sourceEvent !== null
      ? model.expectedPublications[event.sourceEvent]
      : event.publication;
    if (!sourcePublication) fail(`scenario.events[${index}]`, "publication source has no accepted child publication");
    publication = { key: event.key, generation: event.generation, count: sourcePublication.count, revision: sourcePublication.revision };
    accepted = applyPublication(model, event.key, event.generation, publication);
  } else {
    fail(`scenario.events[${index}].kind`, `unsupported event kind ${JSON.stringify(event.kind)}`);
  }
  model.expectedMessages[index] = message;
  model.expectedPublications[index] = publication;
  return { message, accepted, publication };
}

function compareStaticExpectation(model, result, index) {
  if (index >= CORE_EVENT_COUNT) return;
  const expected = SEMANTIC_EXPECTATIONS.events[index];
  equal(index, expected.index, `expectations.events[${index}].index`);
  equal(expected.accepted, result.accepted, `expectations.events[${index}].accepted`);
  const snapshot = snapshotModel(model);
  equal(expected.parent, {
    step: snapshot.parentState.step,
    locked: snapshot.parentState.locked,
    revision: snapshot.parentState.revision,
  }, `expectations.events[${index}].parent`);
  const order = snapshot.children.map((child) => `${child.key}:g${child.generation}`);
  equal(expected.order, order, `expectations.events[${index}].order`);
  const counts = Object.fromEntries(snapshot.children.map((child) => [`${child.key}:g${child.generation}`, child.childState.count]));
  equal(expected.counts, counts, `expectations.events[${index}].counts`);
  if (expected.retiredSlot) {
    const slot = snapshot.controllerState.a;
    equal(expected.retiredSlot.a, {
      generation: slot.generation,
      mounted: slot.mounted,
      publishedCount: slot.publishedCount,
      publishedRevision: slot.publishedRevision,
    }, `expectations.events[${index}].retiredSlot.a`);
  }
}

function nativeRowMeta(row, event, index, expected) {
  equal(index, row.index, `native.events[${index}].index`);
  equal(event.kind, row.kind, `native.events[${index}].kind`);
  for (const key of ["target", "key", "generation", "sourceEvent", "action"]) {
    if (event[key] !== undefined) equal(event[key], row[key], `native.events[${index}].${key}`);
  }
  equal(expected.accepted, row.accepted, `native.events[${index}].accepted`);
  if (expected.message) equal(expected.message, row.message, `native.events[${index}].message`);
  else if (row.message !== undefined && row.message !== null) fail(`native.events[${index}].message`, "unexpected message for this event");
  if (expected.publication) equal(expected.publication, row.publication, `native.events[${index}].publication`);
  else if (row.publication !== undefined && row.publication !== null && event.kind !== "child-message") {
    fail(`native.events[${index}].publication`, "unexpected publication for this event");
  }
  if (Array.isArray(row.bridgeCalls)) {
    if (event.kind === "stale-callback" && row.bridgeCalls.some((call) => /child\.(Update|Publication)|parent\.ReceiveKeyed/.test(call))) {
      fail(`native.events[${index}].bridgeCalls`, "stale callback reached a child update or publication bridge");
    }
    if (event.kind === "click" && !expected.accepted && row.bridgeCalls.length !== 0) {
      fail(`native.events[${index}].bridgeCalls`, "disabled action called an ABI bridge");
    }
  }
}

/** Independently replay the small keyed domain model and check actual native Go snapshots and trees. */
export function assertNativeKeyedCapture(native, scenario = literalKeyedScenario()) {
  requireRecord(native, "native");
  if (native.schema !== NATIVE_SCHEMA) fail("native.schema", `expected ${NATIVE_SCHEMA}`);
  const scenarioEvents = validateCoreScenario(scenario);
  equal(scenario.name, native.name, "native.name/scenario.name");
  const rows = requireArray(native.events, "native.events");
  equal(scenarioEvents.length, rows.length, "native.events.length/scenario.events.length");

  const model = emptyModel();
  compareNativeSnapshot(native.initial, model, "native.initial");
  const expectedRows = [];
  for (let index = 0; index < scenarioEvents.length; index += 1) {
    const event = scenarioEvents[index];
    const row = requireRecord(rows[index], `native.events[${index}]`);
    const expected = replayEvent(model, event, index);
    compareStaticExpectation(model, expected, index);
    nativeRowMeta(row, event, index, expected);
    compareNativeSnapshot(row.snapshot, model, `native.events[${index}].snapshot`);
    expectedRows.push({ eventIndex: index, kind: event.kind, accepted: expected.accepted });
  }
  return {
    status: "matched",
    scenarioName: scenario.name,
    eventCount: rows.length,
    snapshotsChecked: rows.length + 1,
    checks: ["native-parent-and-keyed-controller-state", "per-key-child-input-state-publications", "native-Go-view-tree", "generation-and-stale-message-fencing"],
    events: expectedRows,
  };
}

function lowerInput(input, path) {
  requireRecord(input, path);
  const step = input.step ?? input.Step;
  const locked = input.locked ?? input.Locked;
  const revision = input.revision ?? input.Revision;
  return { step, locked, revision };
}

function lowerChildState(state, path) {
  requireRecord(state, path);
  const count = state.count ?? state.Count ?? state.Counter?.count ?? state.Counter?.Count;
  const step = state.step ?? state.Step;
  const locked = state.locked ?? state.Locked;
  const inputRevision = state.inputRevision ?? state.InputRevision;
  return { count, step, locked, inputRevision };
}

function lowerPublication(publication, key, generation, path) {
  requireRecord(publication, path);
  return {
    key: publication.key ?? publication.Key ?? key,
    generation: publication.generation ?? publication.Generation ?? generation,
    count: publication.count ?? publication.Count,
    revision: publication.revision ?? publication.Revision,
  };
}

function lowerParentState(state, path) {
  requireRecord(state, path);
  if (state.Parent && typeof state.Parent === "object") state = state.Parent;
  return {
    step: state.step ?? state.Step,
    locked: state.locked ?? state.Locked,
    revision: state.revision ?? state.Revision,
    publishedCount: state.publishedCount ?? state.PublishedCount,
    publishedRevision: state.publishedRevision ?? state.PublishedRevision,
  };
}

function lowerControllerState(state, path) {
  requireRecord(state, path);
  if (state.A && state.B) {
    const parent = state.Parent ?? {};
    return {
      a: lowerSlot(state.A), b: lowerSlot(state.B),
      first: state.First, second: state.Second, childCount: state.ChildCount,
      parentState: lowerParentState(parent, `${path}.Parent`),
    };
  }
  return {
    a: lowerSlot(state.a ?? state.A), b: lowerSlot(state.b ?? state.B),
    first: state.first ?? state.First, second: state.second ?? state.Second,
    childCount: state.childCount ?? state.ChildCount,
  };
}

function lowerSlot(slot) {
  return {
    key: slot.key ?? slot.Key,
    generation: slot.generation ?? slot.Generation,
    mounted: slot.mounted ?? slot.Mounted,
    publishedCount: slot.publishedCount ?? slot.PublishedCount,
    publishedRevision: slot.publishedRevision ?? slot.PublishedRevision,
  };
}

function rendererSnapshots(capture, label) {
  requireRecord(capture, label);
  if (capture.schema && capture.schema !== "gobi.keyed-module-conformance-capture/v1" && capture.schema !== SNAPSHOT_SCHEMA) {
    // Harness wrappers may choose their own versioned capture schema. Schema identity is checked through
    // scenarioName, profile, backend, and the embedded runtime snapshots below.
    if (capture.schema.includes("keyed-module") === false) fail(`${label}.schema`, "does not identify a keyed-module capture");
  }
  return requireArray(capture.snapshots, `${label}.snapshots`);
}

function snapshotStateFields(snapshot, label) {
  requireRecord(snapshot, label);
  const parent = snapshot.parent ?? {};
  const parentStateRaw = snapshot.parentState ?? parent.state;
  const controllerRaw = snapshot.controllerState ?? parent.controllerState;
  if (!parentStateRaw) fail(`${label}.parentState`, "renderer capture omitted Go-owned parent state");
  if (!controllerRaw) fail(`${label}.controllerState`, "renderer capture omitted keyed membership/generation state");
  return {
    parentState: lowerParentState(parentStateRaw, `${label}.parentState`),
    controllerState: lowerControllerState(controllerRaw, `${label}.controllerState`),
    children: requireArray(snapshot.children, `${label}.children`).map((child, index) => ({
      key: child.key ?? child.Key,
      generation: child.generation ?? child.Generation,
      input: lowerInput(child.input, `${label}.children[${index}].input`),
      childState: lowerChildState(child.childState ?? child.state, `${label}.children[${index}].childState`),
      publication: lowerPublication(child.publication, child.key ?? child.Key, child.generation ?? child.Generation,
        `${label}.children[${index}].publication`),
    })),
    parentView: snapshot.parentView ?? parent.view,
    childrenView: requireArray(snapshot.children, `${label}.children`).map((child) => child.view),
    parentDOM: snapshot.parentDOM ?? parent.dom,
    childrenDOM: requireArray(snapshot.children, `${label}.children`).map((child) => child.dom),
  };
}

function compareRendererSnapshot(nativeSnapshot, captureSnapshot, path, browser) {
  const expected = {
    parentState: lowerParentState(nativeSnapshot.parentState, `${path}.native.parentState`),
    controllerState: lowerControllerState(nativeSnapshot.controllerState, `${path}.native.controllerState`),
    children: nativeSnapshot.children.map((child, index) => ({
      key: child.key, generation: child.generation,
      input: lowerInput(child.input, `${path}.native.children[${index}].input`),
      childState: lowerChildState(child.childState, `${path}.native.children[${index}].childState`),
      publication: lowerPublication(child.publication, child.key, child.generation, `${path}.native.children[${index}].publication`),
    })),
  };
  const actual = snapshotStateFields(captureSnapshot, `${path}.capture`);
  equal(expected.parentState, actual.parentState, `${path}.parentState`);
  equal(expected.controllerState, actual.controllerState, `${path}.controllerState`);
  equal(expected.children, actual.children, `${path}.children`);
  equal(nativeSnapshot.parentView, actual.parentView, `${path}.parent.view`);
  equal(nativeSnapshot.children.map((child) => child.view), actual.childrenView, `${path}.children.view`);
  if (browser) {
    if (actual.parentDOM === null || actual.parentDOM === undefined) fail(`${path}.parent.dom`, "browser capture is missing physical DOM evidence");
    for (let index = 0; index < actual.childrenDOM.length; index += 1) {
      if (actual.childrenDOM[index] === null || actual.childrenDOM[index] === undefined) fail(`${path}.children[${index}].dom`, "browser capture is missing physical DOM evidence");
    }
  }
  return actual;
}

function eventRows(capture, label) {
  if (Array.isArray(capture.events)) return capture.events;
  if (Array.isArray(capture.trace?.events)) return capture.trace.events;
  fail(`${label}.events`, "capture omitted actual renderer event rows");
}

function checkFenceEvents(capture, label) {
  const events = eventRows(capture, label);
  for (const kind of ["stale-callback", "stale-publication"]) {
    const selected = events.filter((event) => event.kind === kind || (kind === "stale-publication" && event.kind === "publication" && event.stale === true));
    if (selected.length < 2) fail(`${label}.events`, `expected at least two ${kind} probes, got ${selected.length}`);
    for (let index = 0; index < selected.length; index += 1) {
      const event = selected[index];
      if (event.stale !== true || event.dispatched !== false) fail(`${label}.${kind}[${index}]`, "stale record must be fenced before dispatch");
      if ((event.bridgeCalls ?? []).length !== 0 || (event.callOrder ?? []).length !== 0) fail(`${label}.${kind}[${index}]`, "stale record reached an ABI bridge or module function");
      if (event.callCountsBefore && event.callCountsAfter) equal(event.callCountsBefore, event.callCountsAfter, `${label}.${kind}[${index}].callCounts`);
      if (event.key !== "a" || event.generation !== 1) fail(`${label}.${kind}[${index}]`, "stale probe must refer to removed generation a:g1");
    }
  }
}

function scenarioIdentity(capture, native, scenario, label, expectedProfile) {
  equal(native.name, capture.scenarioName, `${label}.scenarioName`);
  if (capture.name !== undefined) equal(native.name, capture.name, `${label}.name`);
  if (capture.scenario !== undefined) equal(scenario, capture.scenario, `${label}.scenario`);
  const expectedScenarioHash = sha256(Buffer.from(`${JSON.stringify(scenario, null, 2)}\n`, "utf8"));
  for (const [field, scenarioHash] of [["scenarioSHA256", capture.scenarioSHA256], ["scenarioHash", capture.scenarioHash]]) {
    if (scenarioHash === undefined || scenarioHash === null) continue;
    if (typeof scenarioHash !== "string") fail(`${label}.${field}`, "must be a string when provided");
    equal(expectedScenarioHash, scenarioHash, `${label}.${field}`);
  }
  const expectedSeed = /^keyed-modules-seed-(\d+)$/.exec(scenario.name)?.[1];
  equal(expectedSeed ? Number(expectedSeed) : null, capture.seed ?? null, `${label}.seed`);
  if (typeof capture.backend !== "string" || !capture.backend) fail(`${label}.backend`, "must identify the actual renderer backend");
  equal(expectedProfile, capture.profile, `${label}.profile`);
  const expectedBackend = expectedProfile === "direct" ? capture.backend : expectedProfile === "swap" ? "dom" : expectedProfile;
  equal(expectedBackend, capture.backend, `${label}.backend`);
  if (capture.moduleBuildBackend !== undefined) equal(expectedBackend, capture.moduleBuildBackend, `${label}.moduleBuildBackend`);
}

function identityByLabel(browser, label) {
  const identity = browser.identity ?? browser.probes?.identity;
  requireRecord(identity, "browser.identity");
  if (identity.schema !== IDENTITY_SCHEMA) fail("browser.identity.schema", `expected ${IDENTITY_SCHEMA}`);
  const checkpoints = requireArray(identity.checkpoints, "browser.identity.checkpoints");
  const checkpoint = checkpoints.find((item) => item.label === label);
  if (!checkpoint) fail("browser.identity.checkpoints", `missing ${label}`);
  requireArray(checkpoint.children, `browser.identity.${label}.children`);
  return checkpoint;
}

function identityChildren(checkpoint, expectedOrder, label) {
  const children = checkpoint.children;
  equal(expectedOrder, children.map((child) => `${child.key}:g${child.generation}`), `${label}.order`);
  equal(["parent", ...expectedOrder.map((item) => item.slice(0, item.indexOf(":g")))], checkpoint.containerOrder, `${label}.containerOrder`);
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (typeof child.logicalInstanceId !== "string" || !child.logicalInstanceId) fail(`${label}.children[${index}].logicalInstanceId`, "missing logical keyed instance identity");
    if (typeof child.rootDOMId !== "string" || !child.rootDOMId) fail(`${label}.children[${index}].rootDOMId`, "missing actual root DOM identity");
    if (typeof child.addControlDOMId !== "string" || !child.addControlDOMId) fail(`${label}.children[${index}].addControlDOMId`, "missing actual Add control DOM identity");
  }
}

function assertBrowserIdentity(browser) {
  const initial = identityByLabel(browser, "initial");
  const identity = browser.identity ?? browser.probes?.identity;
  if (typeof identity.identityBasis !== "string" || !identity.identityBasis.includes("key+generation")) {
    fail("browser.identity.identityBasis", "must identify logical child instances by key and generation");
  }
  const reordered = identityByLabel(browser, "after-reorder");
  const removed = identityByLabel(browser, "after-remove-a");
  const remounted = identityByLabel(browser, "after-remount-a");
  identityChildren(initial, ["a:g1", "b:g1"], "browser.identity.initial");
  identityChildren(reordered, ["b:g1", "a:g1"], "browser.identity.after-reorder");
  identityChildren(removed, ["b:g1"], "browser.identity.after-remove-a");
  identityChildren(remounted, ["b:g1", "a:g2"], "browser.identity.after-remount-a");
  const initialByKey = new Map(initial.children.map((child) => [child.key, child]));
  const reorderedByKey = new Map(reordered.children.map((child) => [child.key, child]));
  const removedB = removed.children[0];
  const remountedA = remounted.children.find((child) => child.key === "a");
  for (const key of ["a", "b"]) {
    equal(initialByKey.get(key).logicalInstanceId, reorderedByKey.get(key).logicalInstanceId, `browser.identity.reorder.${key}.logicalId`);
    equal(initialByKey.get(key).rootDOMId, reorderedByKey.get(key).rootDOMId, `browser.identity.reorder.${key}.rootDOMId`);
    equal(initialByKey.get(key).addControlDOMId, reorderedByKey.get(key).addControlDOMId, `browser.identity.reorder.${key}.addControlDOMId`);
  }
  equal(initialByKey.get("b").logicalInstanceId, removedB.logicalInstanceId, "browser.identity.remove.b.logicalId");
  equal(initialByKey.get("b").rootDOMId, removedB.rootDOMId, "browser.identity.remove.b.rootDOMId");
  if (remountedA.logicalInstanceId === initialByKey.get("a").logicalInstanceId || remountedA.rootDOMId === initialByKey.get("a").rootDOMId ||
      remountedA.addControlDOMId === initialByKey.get("a").addControlDOMId) {
    fail("browser.identity.after-remount-a", "a:g2 must be a new logical child and new DOM instance");
  }
  for (const [beforeLabel, afterLabel, from, to] of [
    ["before-swap-dom-to-react", "after-swap-dom-to-react", "dom", "react"],
    ["before-swap-react-to-dom", "after-swap-react-to-dom", "react", "dom"],
  ]) {
    const before = identityByLabel(browser, beforeLabel);
    const after = identityByLabel(browser, afterLabel);
    equal(from, before.rendererBackend, `browser.identity.${beforeLabel}.rendererBackend`);
    equal(to, after.rendererBackend, `browser.identity.${afterLabel}.rendererBackend`);
    identityChildren(before, before.children.map((child) => `${child.key}:g${child.generation}`), `browser.identity.${beforeLabel}`);
    identityChildren(after, after.children.map((child) => `${child.key}:g${child.generation}`), `browser.identity.${afterLabel}`);
    equal(before.children.map((child) => `${child.key}:g${child.generation}`),
      after.children.map((child) => `${child.key}:g${child.generation}`), `browser.identity.${afterLabel}.logicalMembership`);
    for (let index = 0; index < before.children.length; index += 1) {
      const left = before.children[index]; const right = after.children[index];
      equal(left.logicalInstanceId, right.logicalInstanceId, `browser.identity.${afterLabel}[${index}].logicalId`);
      if (left.rootDOMId === right.rootDOMId || left.addControlDOMId === right.addControlDOMId) {
        fail(`browser.identity.${afterLabel}[${index}]`, "renderer replacement must replace physical DOM nodes");
      }
    }
    if (!Number.isSafeInteger(before.childInitCalls) || !Number.isSafeInteger(after.childInitCalls)) {
      fail(`browser.identity.${afterLabel}.childInitCalls`, "must prove compatible renderer swaps did not reinitialize Go child modules");
    }
    equal(before.childInitCalls, after.childInitCalls, `browser.identity.${afterLabel}.childInitCalls`);
  }
  return { checkpoints: 8, identitiesChecked: "logical-keyed-instance-and-physical-dom-lifetimes" };
}

/** Compare renderer snapshots with the actual native Go state and serialized view tree. */
export function assertKeyedCaptureParity({ native, direct, browser, scenario = literalKeyedScenario() }) {
  assertNativeKeyedCapture(native, scenario);
  if (native.scenarioHash !== undefined) {
    for (const [name, capture] of Object.entries(direct ?? {})) {
      if (capture?.scenarioHash !== undefined) equal(native.scenarioHash, capture.scenarioHash, `native/${name}.scenarioHash`);
    }
    if (browser?.scenarioHash !== undefined) equal(native.scenarioHash, browser.scenarioHash, "native/browser.scenarioHash");
  }
  const directProfiles = direct && !Array.isArray(direct)
    ? ["react", "dom"].filter((name) => direct[name]).map((name) => ({ name, capture: direct[name] }))
    : Array.isArray(direct) ? direct.map((capture) => ({ name: capture.backend, capture })) : [];
  if (!directProfiles.length || directProfiles.some((item) => !["react", "dom"].includes(item.name))) {
    fail("direct", "requires one or both direct captures keyed by react/dom compiled backend");
  }
  for (const { name, capture } of directProfiles) {
    scenarioIdentity(capture, native, scenario, `direct.${name}`, "direct");
    equal(name, capture.backend, `direct.${name}.backend`);
  }
  requireRecord(browser, "browser");
  if (browser.schema !== "gobi.keyed-module-browser/v1") fail("browser.schema", "unknown browser profile index schema");
  equal(native.name, browser.scenarioName, "browser.scenarioName");
  equal(browser.scenarioName, scenario.name, "browser/scenario.name");
  if (browser.scenario !== undefined) equal(scenario, browser.scenario, "browser.scenario");
  const expectedSeed = /^keyed-modules-seed-(\d+)$/.exec(scenario.name)?.[1];
  equal(expectedSeed ? Number(expectedSeed) : null, browser.seed ?? null, "browser.seed");
  const browserProfiles = requireRecord(browser.profiles, "browser.profiles");
  for (const profile of ["react", "dom", "swap"]) {
    const capture = requireRecord(browserProfiles[profile], `browser.profiles.${profile}`);
    scenarioIdentity(capture, native, scenario, `browser.${profile}`, profile);
  }
  for (const { name, capture } of directProfiles) {
    const browserCapture = browserProfiles[name];
    const directHash = capture.scenarioSHA256 ?? capture.scenarioHash;
    const browserHash = browserCapture.scenarioSHA256 ?? browserCapture.scenarioHash;
    if (directHash && browserHash) equal(directHash, browserHash, `capture.${name}.scenarioSHA256`);
    equal(name, browserCapture.moduleBuildBackend, `browser.${name}.moduleBuildBackend`);
  }
  const nativeSnapshots = [
    { eventIndex: -1, snapshot: native.initial },
    ...native.events.map((event) => ({ eventIndex: event.index, snapshot: event.snapshot })),
  ];
  const browserSnapshots = Object.fromEntries(["react", "dom", "swap"].map((profile) =>
    [profile, rendererSnapshots(browserProfiles[profile], `browser.${profile}`)]));
  for (const profile of ["react", "dom", "swap"]) {
    equal(nativeSnapshots.map((item) => item.eventIndex), browserSnapshots[profile].map((item) => item.eventIndex), `browser.${profile}.snapshotEventIndexes`);
  }
  for (const { name, capture } of directProfiles) {
    const directSnapshots = rendererSnapshots(capture, `direct.${name}`);
    equal(nativeSnapshots.map((item) => item.eventIndex), directSnapshots.map((item) => item.eventIndex), `direct.${name}.snapshotEventIndexes`);
    for (let index = 0; index < nativeSnapshots.length; index += 1) {
      const eventIndex = nativeSnapshots[index].eventIndex;
      compareRendererSnapshot(nativeSnapshots[index].snapshot, directSnapshots[index].snapshot,
        `direct.${name}.snapshots[eventIndex=${eventIndex}]`, false);
    }
    checkFenceEvents(capture, `direct.${name}`);
  }
  for (const profile of ["react", "dom", "swap"]) {
    for (let index = 0; index < nativeSnapshots.length; index += 1) {
      const eventIndex = nativeSnapshots[index].eventIndex;
      compareRendererSnapshot(nativeSnapshots[index].snapshot, browserSnapshots[profile][index].snapshot,
        `browser.${profile}.snapshots[eventIndex=${eventIndex}]`, true);
    }
  }
  for (const profile of ["react", "dom", "swap"]) checkFenceEvents(browserProfiles[profile], `browser.${profile}`);
  const identity = assertBrowserIdentity(browserProfiles.swap);
  const probes = browserProfiles.swap.probes?.rendererSwaps ?? browserProfiles.swap.rendererSwaps;
  if (!Array.isArray(probes) || probes.length < 2) fail("browser.probes.rendererSwaps", "expected DOM→React and React→DOM swap probes");
  for (const [index, probe] of probes.slice(0, 2).entries()) {
    const expectedSwap = index === 0 ? ["dom", "react"] : ["react", "dom"];
    equal(expectedSwap, [probe.from, probe.to], `browser.probes.rendererSwaps[${index}].backend`);
    if (probe.stateAndTreeUnchanged !== true && probe.stateTreeEqual !== true && probe.stateEqual !== true) {
      fail(`browser.probes.rendererSwaps[${index}]`, "swap did not preserve native state and tree");
    }
  }
  return {
    status: "matched",
    scenarioName: native.name,
    snapshotsCompared: nativeSnapshots.length,
    directProfiles: Object.fromEntries(directProfiles.map(({ name, capture }) => [name, eventRows(capture, `direct.${name}`).length])),
    browserEvents: Object.fromEntries(["react", "dom", "swap"].map((profile) => [profile, eventRows(browserProfiles[profile], `browser.${profile}`).length])),
    identity,
    checks: ["direct-state-tree-parity", "browser-state-tree-dom-parity", "renderer-swap-state-preservation", "retired-callback-publication-fencing"],
  };
}

function mustReject(id, action) {
  try { action(); } catch (error) {
    return { id, status: "rejected", message: String(error?.message ?? error) };
  }
  fail(`mutation.${id}`, "targeted mutation was not detected");
}

function eventAt(capture, index) {
  const result = capture.events?.find((event) => event.index === index || event.eventIndex === index);
  if (!result) fail("mutation.fixture", `missing event ${index}`);
  return result;
}

function rendererSnapshotAt(capture, index) {
  const item = capture.snapshots?.find((snapshot) => snapshot.eventIndex === index);
  if (!item) fail("mutation.fixture", `missing renderer snapshot ${index}`);
  return item.snapshot;
}

function pinPath(base, path, label) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail(`${label}.path`, "must be a safe relative artifact path");
  }
  const root = resolve(base);
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${root}${sep}`)) fail(`${label}.path`, "escapes its pinned artifact root");
  return absolute;
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function verifyFilePin(pin, base, label) {
  requireRecord(pin, label);
  const absolute = pinPath(base, pin.path, label);
  let bytes;
  try { bytes = readFileSync(absolute); } catch (error) { fail(label, `cannot read pinned file: ${error.message}`); }
  equal(pin.bytes, bytes.length, `${label}.bytes`);
  equal(pin.sha256, sha256(bytes), `${label}.sha256`);
  return { absolute, bytes };
}

function expectDescriptor(descriptor, backend, parentBuild, helper, label) {
  requireRecord(descriptor, label);
  equal("gobi.keyed-module-helpers/v1", descriptor.schema, `${label}.schema`);
  equal(backend, descriptor.backend, `${label}.backend`);
  equal(PARENT_PACKAGE, descriptor.packagePath, `${label}.packagePath`);
  equal(PARENT_PACKAGE, descriptor.componentId, `${label}.componentId`);
  equal({
    path: parentBuild.artifacts.appIR.path,
    bytes: parentBuild.artifacts.appIR.bytes,
    sha256: parentBuild.artifacts.appIR.sha256,
  }, descriptor.appIR, `${label}.appIR`);
  equal({
    path: parentBuild.artifacts.moduleABI.path,
    bytes: parentBuild.artifacts.moduleABI.bytes,
    sha256: parentBuild.artifacts.moduleABI.sha256,
    abiSHA256: parentBuild.artifacts.moduleABI.abiSHA256,
  }, descriptor.moduleABI, `${label}.moduleABI`);
  equal({ path: helper.path, bytes: helper.bytes, sha256: helper.sha256 }, descriptor.helperArtifact, `${label}.helperArtifact`);
  equal(helper.exportName, descriptor.exportName, `${label}.exportName`);
  equal(["children", "receiveKeyed", "isCurrent"], descriptor.members, `${label}.members`);
  equal(helper.sourceIdentity, descriptor.sourceIdentity, `${label}.sourceIdentity/index`);
  const signatures = [
    {
      name: "Children", symbol: `${PARENT_PACKAGE}.Children`,
      signature: { params: [`${PARENT_PACKAGE}.State`], results: [`[]${"github.com/samuelpmahan/gondola/fixtures/compiled/keyedmodulewire.ChildRef"}`] },
    },
    {
      name: "ReceiveKeyed", symbol: `${PARENT_PACKAGE}.ReceiveKeyed`,
      signature: { params: [`${PARENT_PACKAGE}.State`, "string", "int", "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire.Publication"], results: [`${PARENT_PACKAGE}.State`] },
    },
    {
      name: "IsCurrent", symbol: `${PARENT_PACKAGE}.IsCurrent`,
      signature: { params: [`${PARENT_PACKAGE}.State`, "string", "int"], results: ["bool"] },
    },
  ];
  equal(signatures, descriptor.symbols, `${label}.symbols`);
  requireRecord(descriptor.stateSemantics, `${label}.stateSemantics`);
  equal(true, descriptor.stateSemantics.pureStateHelpers, `${label}.stateSemantics.pureStateHelpers`);
  equal(false, descriptor.stateSemantics.usesSharedGlobalState, `${label}.stateSemantics.usesSharedGlobalState`);
  equal(true, descriptor.stateSemantics.receiveKeyedClonesPrimaryGoScriptState, `${label}.stateSemantics.receiveKeyedClonesPrimaryGoScriptState`);
  const reachability = descriptor.stateSemantics.analyzerReachability;
  if (typeof reachability !== "string" || !reachability.includes("ReceiveKeyed") || !reachability.includes("IsCurrent") ||
      !reachability.includes("not AppIR-reachability-admitted")) {
    fail(`${label}.stateSemantics.analyzerReachability`, "must retain the limitation that ReceiveKeyed/IsCurrent are not admitted by the shared AppIR reachability analyzer");
  }
  return true;
}

function verifyBuildRole(index, backend, role, expectedPackage, buildRoot, repoRoot) {
  const build = requireRecord(index.builds?.[backend]?.[role], `buildIndex.builds.${backend}.${role}`);
  equal(backend, build.backend, `buildIndex.builds.${backend}.${role}.backend`);
  equal(role, build.role, `buildIndex.builds.${backend}.${role}.role`);
  equal(expectedPackage, build.packagePath, `buildIndex.builds.${backend}.${role}.packagePath`);
  equal(expectedPackage, build.componentId, `buildIndex.builds.${backend}.${role}.componentId`);
  const manifestBytes = verifyFilePin({ path: build.manifestPath, ...build.manifest }, buildRoot,
    `buildIndex.builds.${backend}.${role}.manifestPath`);
  let manifest;
  try { manifest = JSON.parse(manifestBytes.bytes.toString("utf8")); } catch (error) { fail(`buildIndex.builds.${backend}.${role}.manifest`, `invalid JSON: ${error.message}`); }
  if (manifest.schema !== "gobi.build-manifest/v1" || manifest.apps?.length !== 1) fail(`buildIndex.builds.${backend}.${role}.manifest`, "must contain one compiled module app");
  const manifestApp = manifest.apps[0];
  equal(backend, manifestApp.backend, `buildIndex.builds.${backend}.${role}.manifestApp.backend`);
  equal(expectedPackage, manifestApp.packagePath, `buildIndex.builds.${backend}.${role}.manifestApp.packagePath`);
  equal(expectedPackage, manifestApp.componentId, `buildIndex.builds.${backend}.${role}.manifestApp.componentId`);

  const artifacts = requireRecord(build.artifacts, `buildIndex.builds.${backend}.${role}.artifacts`);
  let appIR; let moduleABI;
  for (const key of ["appIR", "module", "encoder", "components", "moduleABI"]) {
    const pin = verifyFilePin(artifacts[key], buildRoot, `buildIndex.builds.${backend}.${role}.artifacts.${key}`);
    if (key === "appIR") appIR = JSON.parse(pin.bytes.toString("utf8"));
    if (key === "moduleABI") moduleABI = JSON.parse(pin.bytes.toString("utf8"));
  }
  equal("gobi.app-ir/v1", appIR.schema, `buildIndex.builds.${backend}.${role}.appIR.schema`);
  equal(expectedPackage, appIR.packagePath, `buildIndex.builds.${backend}.${role}.appIR.packagePath`);
  if (appIR.components?.length !== 1) fail(`buildIndex.builds.${backend}.${role}.appIR.components`, "must describe one component");
  equal(expectedPackage, appIR.components[0].id, `buildIndex.builds.${backend}.${role}.appIR.componentId`);
  equal("gobi.module-abi/v1", moduleABI.schema, `buildIndex.builds.${backend}.${role}.moduleABI.schema`);
  equal(expectedPackage, moduleABI.packagePath, `buildIndex.builds.${backend}.${role}.moduleABI.packagePath`);
  equal(expectedPackage, moduleABI.componentID, `buildIndex.builds.${backend}.${role}.moduleABI.componentID`);
  equal(moduleABI.abiSHA256, artifacts.moduleABI.abiSHA256, `buildIndex.builds.${backend}.${role}.moduleABI.abiSHA256`);
  if (role === "parent") {
    const sourcePin = verifyFilePin({ ...index.builds[backend].parent.keyedHelper.sourceIdentity.fixtureSource }, repoRoot,
      `buildIndex.builds.${backend}.parent.keyedHelper.sourceIdentity.fixtureSource`);
    void sourcePin;
  }
  return build;
}

/** Validate build index, independent parent/child ABI identities, helper bytes, descriptor, and source pins. */
export function assertKeyedBuildIdentity(index, { buildRoot, repoRoot = DEFAULT_REPO_ROOT } = {}) {
  requireRecord(index, "buildIndex");
  if (index.schema !== "gobi.keyed-module-build-index/v1") fail("buildIndex.schema", "unknown keyed-module build index schema");
  if (typeof buildRoot !== "string" || !buildRoot) fail("buildRoot", "must be the directory containing build-index.json");
  const absoluteBuildRoot = resolve(buildRoot);
  const absoluteRepoRoot = resolve(repoRoot);
  equal(PARENT_PACKAGE, index.parentPackagePath, "buildIndex.parentPackagePath");
  equal(CHILD_PACKAGE, index.childPackagePath, "buildIndex.childPackagePath");
  requireRecord(index.builds, "buildIndex.builds");
  const validated = [];
  for (const backend of ["react", "dom"]) {
    const parentBuild = verifyBuildRole(index, backend, "parent", PARENT_PACKAGE, absoluteBuildRoot, absoluteRepoRoot);
    verifyBuildRole(index, backend, "child", CHILD_PACKAGE, absoluteBuildRoot, absoluteRepoRoot);
    const helper = requireRecord(parentBuild.keyedHelper, `buildIndex.builds.${backend}.parent.keyedHelper`);
    if (!Array.isArray(helper.members)) fail(`buildIndex.builds.${backend}.parent.keyedHelper.members`, "must be an array");
    const helperFile = verifyFilePin({ path: helper.path, bytes: helper.bytes, sha256: helper.sha256 }, absoluteBuildRoot,
      `buildIndex.builds.${backend}.parent.keyedHelper`);
    const descriptorFile = verifyFilePin({ path: helper.descriptorPath, bytes: helper.descriptorBytes, sha256: helper.descriptorSha256 }, absoluteBuildRoot,
      `buildIndex.builds.${backend}.parent.keyedHelper.descriptor`);
    let descriptor;
    try { descriptor = JSON.parse(descriptorFile.bytes.toString("utf8")); } catch (error) { fail(`buildIndex.builds.${backend}.parent.keyedHelper.descriptor`, `invalid JSON: ${error.message}`); }
    expectDescriptor(descriptor, backend, parentBuild, helper, `buildIndex.builds.${backend}.parent.keyedHelper.descriptor`);
    verifyFilePin(descriptor.appIR, absoluteBuildRoot, `buildIndex.${backend}.helper.appIR`);
    verifyFilePin(descriptor.moduleABI, absoluteBuildRoot, `buildIndex.${backend}.helper.moduleABI`);
    verifyFilePin(descriptor.helperArtifact, absoluteBuildRoot, `buildIndex.${backend}.helper.helperArtifact`);
    verifyFilePin(descriptor.sourceIdentity.fixtureSource, absoluteRepoRoot, `buildIndex.${backend}.helper.fixtureSource`);
    const emitted = requireArray(descriptor.sourceIdentity.emittedGoScriptSources, `buildIndex.${backend}.helper.emittedGoScriptSources`);
    equal(2, emitted.length, `buildIndex.${backend}.helper.emittedGoScriptSources.length`);
    for (let sourceIndex = 0; sourceIndex < emitted.length; sourceIndex += 1) {
      verifyFilePin(emitted[sourceIndex], absoluteBuildRoot, `buildIndex.${backend}.helper.emittedGoScriptSources[${sourceIndex}]`);
    }
    if (helper.path !== descriptor.helperArtifact.path || helper.descriptorPath === helper.path) {
      fail(`buildIndex.builds.${backend}.parent.keyedHelper`, "helper and descriptor paths must identify distinct pinned artifacts");
    }
    validated.push({ backend, packagePath: parentBuild.packagePath, childPackagePath: index.childPackagePath,
      helperSHA256: helper.sha256, descriptorSHA256: helper.descriptorSha256,
      abiSHA256: parentBuild.artifacts.moduleABI.abiSHA256 });
  }
  return {
    status: "matched",
    buildIndexSchema: index.schema,
    independentPairs: validated.length,
    validated,
    helperScopeCaveat: "Children is AppIR reachable through View; ReceiveKeyed and IsCurrent are exported, byte-pinned GoScript helpers but are not admitted by the unchanged shared AppIR reachability analyzer.",
  };
}

/** Exercise metadata and physical-file mutation controls without modifying the pinned build outputs. */
export function runKeyedBuildMutationControls(index, options) {
  assertKeyedBuildIdentity(index, options);
  const controls = [];
  const reject = (id, action) => controls.push(mustReject(id, action));
  const checkIndex = (mutant) => () => assertKeyedBuildIdentity(mutant, options);

  let mutant = structuredClone(index);
  mutant.builds.react.parent.keyedHelper.sha256 = "0".repeat(64);
  reject("helper-sidecar-bytes", checkIndex(mutant));

  mutant = structuredClone(index);
  mutant.builds.dom.parent.keyedHelper.descriptorSha256 = "0".repeat(64);
  reject("helper-descriptor-bytes", checkIndex(mutant));

  mutant = structuredClone(index);
  mutant.builds.react.parent.backend = "dom";
  reject("build-backend-identity", checkIndex(mutant));

  mutant = structuredClone(index);
  mutant.builds.dom.parent.packagePath = CHILD_PACKAGE;
  reject("build-package-identity", checkIndex(mutant));

  mutant = structuredClone(index);
  mutant.builds.react.parent.componentId = "wrong-component";
  reject("build-component-identity", checkIndex(mutant));

  mutant = structuredClone(index);
  mutant.builds.dom.parent.artifacts.moduleABI.abiSHA256 = "0".repeat(64);
  reject("module-abi-identity", checkIndex(mutant));

  mutant = structuredClone(index);
  mutant.builds.react.parent.artifacts.appIR.sha256 = "0".repeat(64);
  reject("app-ir-identity", checkIndex(mutant));

  mutant = structuredClone(index);
  mutant.builds.react.parent.keyedHelper.sourceIdentity.fixtureSource.sha256 = "0".repeat(64);
  reject("helper-fixture-source-identity", checkIndex(mutant));

  mutant = structuredClone(index);
  mutant.builds.dom.parent.keyedHelper.sourceIdentity.emittedGoScriptSources[0].sha256 = "0".repeat(64);
  reject("helper-emitted-source-identity", checkIndex(mutant));

  const loadDescriptor = (backend) => {
    const helper = index.builds[backend].parent.keyedHelper;
    const file = pinPath(options.buildRoot, helper.descriptorPath, `builds.${backend}.descriptor`);
    return JSON.parse(readFileSync(file, "utf8"));
  };
  for (const mutation of [
    ["descriptor-backend", (value) => { value.backend = "dom"; }],
    ["descriptor-package", (value) => { value.packagePath = CHILD_PACKAGE; }],
    ["descriptor-component", (value) => { value.componentId = "wrong-component"; }],
    ["descriptor-module-abi", (value) => { value.moduleABI.abiSHA256 = "0".repeat(64); }],
    ["descriptor-app-ir", (value) => { value.appIR.sha256 = "0".repeat(64); }],
    ["descriptor-fixture-source", (value) => { value.sourceIdentity.fixtureSource.sha256 = "0".repeat(64); }],
    ["descriptor-emitted-source", (value) => { value.sourceIdentity.emittedGoScriptSources[1].sha256 = "0".repeat(64); }],
    ["descriptor-helper-reachability", (value) => { value.stateSemantics.analyzerReachability = "ReceiveKeyed and IsCurrent are AppIR-reachability-admitted"; }],
  ]) {
    const [id, mutate] = mutation;
    const descriptor = loadDescriptor("react");
    mutate(descriptor);
    reject(id, () => expectDescriptor(descriptor, "react", index.builds.react.parent, index.builds.react.parent.keyedHelper,
      `mutatedDescriptor.${id}`));
  }
  return { status: "detected", mutationControlsDetected: controls.length, controls };
}

/** Run mismatch controls only after the actual healthy native/direct/browser baseline passes. */
export function runKeyedMutationControls({ native, direct, browser, scenario = literalKeyedScenario() }) {
  assertNativeKeyedCapture(native, scenario);
  assertKeyedCaptureParity({ native, direct, browser, scenario });
  const controls = [];

  let mutant = structuredClone(native);
  mutant.events[0].snapshot.children.find((child) => child.key === "b").childState.count += 1;
  controls.push(mustReject("native-sibling-counter-isolation", () => assertNativeKeyedCapture(mutant, scenario)));

  mutant = structuredClone(native);
  mutant.events[5].snapshot.children.find((child) => child.key === "b").childState.count = 0;
  controls.push(mustReject("native-reset-only-target", () => assertNativeKeyedCapture(mutant, scenario)));

  mutant = structuredClone(native);
  const reordered = mutant.events[9].snapshot.children;
  [reordered[0].childState.count, reordered[1].childState.count] = [reordered[1].childState.count, reordered[0].childState.count];
  controls.push(mustReject("native-reorder-preserves-keyed-state", () => assertNativeKeyedCapture(mutant, scenario)));

  mutant = structuredClone(native);
  mutant.events[10].snapshot.controllerState.a.mounted = true;
  controls.push(mustReject("native-removal-tombstone", () => assertNativeKeyedCapture(mutant, scenario)));

  mutant = structuredClone(native);
  mutant.events[13].snapshot.controllerState.a.generation = 1;
  mutant.events[13].snapshot.children.find((child) => child.key === "a").generation = 1;
  controls.push(mustReject("native-remount-new-generation", () => assertNativeKeyedCapture(mutant, scenario)));

  mutant = structuredClone(native);
  mutant.events[15].accepted = true;
  controls.push(mustReject("native-stale-callback-fence", () => assertNativeKeyedCapture(mutant, scenario)));

  mutant = structuredClone(native);
  mutant.events[16].snapshot.controllerState.a.publishedCount += 1;
  controls.push(mustReject("native-stale-publication-fence", () => assertNativeKeyedCapture(mutant, scenario)));

  let rendererMutant = structuredClone(direct);
  const directReact = rendererMutant.react;
  const directA = rendererSnapshotAt(directReact, 9).children.find((child) => child.key === "a");
  directA.view.key = "wrong-key";
  controls.push(mustReject("direct-react-tree-mutation", () => assertKeyedCaptureParity({ native, direct: rendererMutant, browser, scenario })));

  rendererMutant = structuredClone(browser);
  rendererSnapshotAt(rendererMutant.profiles.dom, -1).children[0].dom = null;
  controls.push(mustReject("browser-dom-capture-omission", () => assertKeyedCaptureParity({ native, direct, browser: rendererMutant, scenario })));

  rendererMutant = structuredClone(browser);
  const beforeSwap = identityByLabel(rendererMutant.profiles.swap, "before-swap-dom-to-react");
  const afterSwap = identityByLabel(rendererMutant.profiles.swap, "after-swap-dom-to-react");
  afterSwap.children[0].logicalInstanceId = "wrong-logical-instance";
  controls.push(mustReject("renderer-swap-logical-instance-loss", () => assertKeyedCaptureParity({ native, direct, browser: rendererMutant, scenario })));

  rendererMutant = structuredClone(browser);
  const before = identityByLabel(rendererMutant.profiles.swap, "before-swap-react-to-dom");
  const after = identityByLabel(rendererMutant.profiles.swap, "after-swap-react-to-dom");
  after.children[0].rootDOMId = before.children[0].rootDOMId;
  controls.push(mustReject("renderer-swap-physical-node-retained", () => assertKeyedCaptureParity({ native, direct, browser: rendererMutant, scenario })));

  return {
    status: "detected",
    mutationControlsDetected: controls.length,
    controls,
  };
}

