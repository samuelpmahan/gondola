import assert from "node:assert/strict";
import test from "node:test";
import * as oracle from "./oracle.mjs";
import { literalKeyedScenario } from "../conformance/scenarios.mjs";

const scenario = literalKeyedScenario();

function attr(name, value) { return { name, value, flag: false, style: null }; }

function element(tag, key, className, kids = []) {
  return { kind: 1, tag, key, attrs: className ? [attr("class", className)] : [], on: null, kids, text: "" };
}

function textNode(text) { return { kind: 2, tag: "", key: "", attrs: null, on: null, kids: null, text }; }

function button(label, message, arg, disabled = false, className = undefined) {
  const attrs = className ? [attr("class", className)] : [];
  if (disabled) attrs.push({ name: "disabled", value: "", flag: true, style: null });
  return { kind: 1, tag: "button", key: "", attrs, on: [{ event: "click", message, arg }], kids: [textNode(label)], text: "" };
}

function state(parent, children, index) {
  parent = { ...parent, publishedCount: 0, publishedRevision: 0 };
  const slots = {};
  for (const key of ["a", "b"]) {
    const child = children.find((entry) => entry.key === key);
    const generation = child?.generation ?? (key === "a" && index >= 14 ? 2 : 1);
    const removedA = key === "a" && index >= 11 && index < 14;
    slots[key] = {
      key, generation, mounted: Boolean(child),
      publishedCount: child?.count ?? (removedA ? 1 : 0),
      publishedRevision: child ? parent.revision : (removedA ? 3 : 0),
    };
  }
  const parentViewKids = [
    element("p", "", "module-parent-step", [textNode(`Step: ${parent.step}`)]),
    button("Step −", "step.down", "", parent.step <= 1, "module-step-down"),
    button("Step +", "step.up", "", parent.step >= 3, "module-step-up"),
    button(parent.locked ? "Locked" : "Unlocked", "lock.toggle", "", false, "module-lock-toggle"),
    button("Reset input", "input.reset", "", false, "module-input-reset"),
    element("p", "", "module-parent-publication", [textNode("No publication")]),
  ];
  const controls = [
    button("Mount a", "child.add", "a", slots.a.mounted || children.length >= 2, "keyed-a-child.add"),
    button("Remove a", "child.remove", "a", !slots.a.mounted, "keyed-a-child.remove"),
    button("Mount b", "child.add", "b", slots.b.mounted || children.length >= 2, "keyed-b-child.add"),
    button("Remove b", "child.remove", "b", !slots.b.mounted, "keyed-b-child.remove"),
    button("Reorder children", "children.reorder", children.length === 2 ? `${children[1].key},${children[0].key}` : "a,b",
      children.length !== 2, "keyed-reorder-children"),
  ];
  parentViewKids.push(element("section", "keyed-membership-controls", "keyed-membership-controls", controls));
  parentViewKids.push(element("section", "keyed-child-summaries", "keyed-child-summaries",
    children.map((child) => element("p", child.key, "keyed-child-summary", [textNode(
      `${child.key} generation ${child.generation ?? 1} publication count ${child.count ?? 0}` +
      `${(child.revision ?? parent.revision) > 0 ? ` at revision ${child.revision ?? parent.revision}` : ""}`,
    )]))));
  return {
    parentState: structuredClone(parent),
    controllerState: {
      a: slots.a, b: slots.b,
      first: children[0]?.key ?? "", second: children[1]?.key ?? "", childCount: children.length,
    },
    children: children.map(({ key, generation = 1, count = 0, revision = parent.revision }) => ({
      key,
      generation,
      input: { step: parent.step, locked: parent.locked, revision: parent.revision },
      childState: { count, step: parent.step, locked: parent.locked, inputRevision: parent.revision },
      publication: { key, generation, count, revision },
      view: element("section", "module-child", "compiled-module-child", [
        element("p", "", "module-child-input", [textNode(`Step: ${parent.step}; ${parent.locked ? "Locked" : "Unlocked"}; input revision: ${parent.revision}`)]),
        element("p", "", "module-child-publication", [textNode(`Child publication count: ${count}`)]),
        element("div", "", "counter", [
          element("p", "", "", [textNode(`Count: ${count}`)]),
          button("+", "add", "", parent.locked, "add"),
          button("Reset", "reset", "", count === 0),
        ]),
      ]),
    })),
    parentView: element("main", "keyed-module-parent", "compiled-module-parent", parentViewKids),
  };
}

function nativeFixture() {
  const expected = [
    { parent: { step: 1, locked: false, revision: 1 }, children: [{ key: "a", count: 0 }, { key: "b", count: 0 }] },
    { parent: { step: 1, locked: false, revision: 1 }, children: [{ key: "a", count: 1 }, { key: "b", count: 0 }] },
    { parent: { step: 1, locked: false, revision: 1 }, children: [{ key: "a", count: 1 }, { key: "b", count: 1 }] },
    { parent: { step: 1, locked: true, revision: 2 }, children: [{ key: "a", count: 1 }, { key: "b", count: 1 }] },
    { parent: { step: 1, locked: true, revision: 2 }, children: [{ key: "a", count: 1 }, { key: "b", count: 1 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "a", count: 1 }, { key: "b", count: 1 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "a", count: 0 }, { key: "b", count: 1 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "a", count: 0 }, { key: "b", count: 1 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "a", count: 0 }, { key: "b", count: 2 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }, { key: "a", count: 0 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }, { key: "a", count: 1 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }, { key: "a", generation: 2, count: 0 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }, { key: "a", generation: 2, count: 1 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }, { key: "a", generation: 2, count: 1 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 2 }, { key: "a", generation: 2, count: 1 }] },
    { parent: { step: 1, locked: false, revision: 3 }, children: [{ key: "b", count: 0 }, { key: "a", generation: 2, count: 1 }] },
  ];
  const accepted = [true, true, true, false, true, true, false, true, true, true, true, false, false, true, true, false, false, true];
  function messageFor(event, eventIndex) {
    if (event.kind === "stale-callback") return { name: "add", arg: "" };
    if (event.kind !== "click") return undefined;
    const path = event.action.path;
    if (event.target === "child") return { name: path === "2/1" ? "add" : "reset", arg: "" };
    const byPath = {
      "1": { name: "step.down", arg: "" }, "2": { name: "step.up", arg: "" },
      "3": { name: "lock.toggle", arg: "" }, "4": { name: "input.reset", arg: "" },
      "6/0": { name: "child.add", arg: "a" }, "6/1": { name: "child.remove", arg: "a" },
      "6/2": { name: "child.add", arg: "b" }, "6/3": { name: "child.remove", arg: "b" },
      "6/4": { name: "children.reorder", arg: eventIndex === 8 ? "b,a" : "a,b" },
    };
    return byPath[path];
  }
  function publicationFor(event, eventIndex) {
    let sourceIndex = eventIndex;
    if (event.kind === "publication") sourceIndex = event.sourceEvent;
    if (event.kind === "publication") {
      const sourceState = expected[sourceIndex + 1];
      const sourceChild = sourceState.children.find((child) => child.key === event.key);
      return sourceChild ? { key: sourceChild.key, generation: sourceChild.generation ?? 1, count: sourceChild.count ?? 0, revision: sourceChild.revision ?? sourceState.parent.revision } : undefined;
    }
    if (event.kind === "click" && event.target === "child" && accepted[eventIndex]) {
      const child = expected[eventIndex + 1].children.find((candidate) => candidate.key === event.key);
      if (child) return { key: child.key, generation: child.generation ?? 1, count: child.count ?? 0, revision: child.revision ?? expected[eventIndex + 1].parent.revision };
    }
    return undefined;
  }
  return {
    schema: "gobi.keyed-module-native/v1",
    name: scenario.name,
    initial: state(expected[0].parent, expected[0].children, 0),
    events: scenario.events.map((event, eventIndex) => {
      const result = {
        ...structuredClone(event), index: eventIndex, accepted: accepted[eventIndex],
        snapshot: state(expected[eventIndex + 1].parent, expected[eventIndex + 1].children, eventIndex + 1),
      };
      const message = messageFor(event, eventIndex);
      if (message) result.message = message;
      const publication = publicationFor(event, eventIndex);
      if (publication) result.publication = publication;
      return result;
    }),
  };
}

test("native oracle accepts two-key state isolation, reset, reorder, and generation fencing", () => {
  assert.equal(typeof oracle.assertNativeKeyedCapture, "function");
  const native = nativeFixture();
  assert.equal(oracle.assertNativeKeyedCapture(native, scenario).status, "matched");

  const siblingBleed = structuredClone(native);
  siblingBleed.events[5].snapshot.children[1].childState.count = 0;
  assert.throws(() => oracle.assertNativeKeyedCapture(siblingBleed, scenario), /children|state|count/i);

  const remountReusesGeneration = structuredClone(native);
  remountReusesGeneration.events[13].snapshot.children[1].generation = 1;
  assert.throws(() => oracle.assertNativeKeyedCapture(remountReusesGeneration, scenario), /generation/i);

  const staleCallbackMutatesChild = structuredClone(native);
  staleCallbackMutatesChild.events[15].accepted = true;
  staleCallbackMutatesChild.events[15].snapshot.children[1].childState.count++;
  assert.throws(() => oracle.assertNativeKeyedCapture(staleCallbackMutatesChild, scenario), /accepted|stale|state|count/i);
});

function rendererSnapshot(source, backend, browser) {
  const parentDOM = browser ? { html: "<main>keyed module</main>" } : null;
  const children = source.children.map((child) => ({
    key: child.key,
    generation: child.generation,
    input: structuredClone(child.input),
    childState: structuredClone(child.childState),
    state: structuredClone(child.childState),
    publication: structuredClone(child.publication),
    view: structuredClone(child.view),
    dom: browser ? { html: `<section>Count: ${child.childState.count}</section>` } : null,
  }));
  return {
    schema: "gobi.keyed-module-snapshot/v1",
    backend,
    parentState: structuredClone(source.parentState),
    controllerState: structuredClone(source.controllerState),
    parent: {
      state: structuredClone(source.parentState),
      controllerState: structuredClone(source.controllerState),
      view: structuredClone(source.parentView),
      dom: parentDOM,
    },
    children,
    parentView: structuredClone(source.parentView),
    parentDOM,
  };
}

function fencedEvents() {
  return [11, 12, 15, 16].map((eventIndex) => {
    const callback = eventIndex === 11 || eventIndex === 15;
    return {
      eventIndex,
      kind: callback ? "stale-callback" : "stale-publication",
      key: "a", generation: 1, stale: true, dispatched: false,
      bridgeCalls: [], callOrder: [], callCountsBefore: { childUpdate: 2 }, callCountsAfter: { childUpdate: 2 },
    };
  });
}

function identityChildren(order, { remounted = false, backend = "dom" } = {}) {
  return order.map((key) => {
    const generation = key === "a" && remounted ? 2 : 1;
    const logical = `${key}:g${generation}`;
    const rendererTag = backend === "dom" ? "d" : "r";
    return {
      key, generation, logicalInstanceId: logical,
      rootDOMId: `${rendererTag}-${key}-g${generation}-root`,
      addControlDOMId: `${rendererTag}-${key}-g${generation}-add`,
    };
  });
}

function identityCheckpoint(label, eventIndex, order, options = {}) {
  const backend = options.backend ?? "dom";
  return { label, eventIndex, rendererBackend: backend, containerOrder: ["parent", ...order],
    childInitCalls: options.childInitCalls ?? (options.remounted ? 3 : 2), children: identityChildren(order, options) };
}

function capturePair(native, profile, backend = profile === "direct" ? "react" : "dom") {
  const browser = profile !== "direct";
  const sourceSnapshots = [
    { eventIndex: -1, snapshot: native.initial },
    ...native.events.map((event) => ({ eventIndex: event.index, snapshot: event.snapshot })),
  ];
  const capture = {
    schema: "gobi.keyed-module-conformance-capture/v1",
    scenarioName: scenario.name,
    scenario: structuredClone(scenario),
    seed: null,
    profile,
    backend,
    moduleBuildBackend: backend,
    snapshots: sourceSnapshots.map((row) => ({ ...row, snapshot: rendererSnapshot(row.snapshot, backend, browser) })),
    events: fencedEvents(),
  };
  if (profile === "swap") {
    const beforeDOMReact = identityCheckpoint("before-swap-dom-to-react", 8, ["b", "a"], { backend: "dom" });
    const afterDOMReact = identityCheckpoint("after-swap-dom-to-react", 8, ["b", "a"], { backend: "react" });
    const beforeReactDOM = identityCheckpoint("before-swap-react-to-dom", 17, ["b", "a"], { backend: "react", remounted: true, childInitCalls: 3 });
    const afterReactDOM = identityCheckpoint("after-swap-react-to-dom", 17, ["b", "a"], { backend: "dom", remounted: true, childInitCalls: 3 });
    const checkpoints = [
      identityCheckpoint("initial", -1, ["a", "b"]),
      identityCheckpoint("after-reorder", 8, ["b", "a"]),
      identityCheckpoint("after-remove-a", 10, ["b"]),
      identityCheckpoint("after-remount-a", 13, ["b", "a"], { remounted: true, childInitCalls: 3 }),
      beforeDOMReact, afterDOMReact, beforeReactDOM, afterReactDOM,
    ];
    // The same keyed module instance survives a renderer swap; physical DOM ids are renderer-owned.
    afterDOMReact.children.forEach((child) => { child.rootDOMId = `r-${child.key}-g${child.generation}-root`; child.addControlDOMId = `r-${child.key}-g${child.generation}-add`; });
    afterReactDOM.children.forEach((child) => { child.rootDOMId = `d-${child.key}-g${child.generation}-root-2`; child.addControlDOMId = `d-${child.key}-g${child.generation}-add-2`; });
    capture.identity = { schema: "gobi.keyed-module-dom-identity/v1", identityBasis: "logical instance identity uses key+generation", checkpoints };
    capture.probes = { rendererSwaps: [
      { from: "dom", to: "react", stateAndTreeUnchanged: true },
      { from: "react", to: "dom", stateAndTreeUnchanged: true },
    ] };
  }
  return capture;
}

test("direct and browser parity checks detect tree, DOM, and renderer-lifetime mutations", () => {
  const native = nativeFixture();
  const direct = {
    react: capturePair(native, "direct", "react"),
    dom: capturePair(native, "direct", "dom"),
  };
  const browser = {
    schema: "gobi.keyed-module-browser/v1",
    scenarioName: scenario.name,
    seed: null,
    profiles: {
      react: capturePair(native, "react", "react"),
      dom: capturePair(native, "dom", "dom"),
      swap: capturePair(native, "swap", "dom"),
    },
  };
  const parity = oracle.assertKeyedCaptureParity({ native, direct, browser, scenario });
  assert.equal(parity.status, "matched");

  const controls = oracle.runKeyedMutationControls({ native, direct, browser, scenario });
  assert.equal(controls.status, "detected");
  assert.ok(controls.mutationControlsDetected >= 10);

  const wrongSeed = structuredClone(browser);
  wrongSeed.seed = 123;
  assert.throws(() => oracle.assertKeyedCaptureParity({ native, direct, browser: wrongSeed, scenario }), /seed/i);

  const wrongScenario = structuredClone(direct);
  wrongScenario.react.scenarioName = "keyed-modules-seed-5";
  assert.throws(() => oracle.assertKeyedCaptureParity({ native, direct: wrongScenario, browser, scenario }), /scenarioName/i);

  const wrongScenarioHash = structuredClone(direct);
  wrongScenarioHash.react.scenarioSHA256 = "0".repeat(64);
  assert.throws(() => oracle.assertKeyedCaptureParity({ native, direct: wrongScenarioHash, browser, scenario }), /scenarioSHA256/i);

  const wrongDirectBackend = structuredClone(direct);
  wrongDirectBackend.react.backend = "dom";
  assert.throws(() => oracle.assertKeyedCaptureParity({ native, direct: wrongDirectBackend, browser, scenario }), /backend/i);

  const wrongBrowserBackend = structuredClone(browser);
  wrongBrowserBackend.profiles.dom.backend = "react";
  assert.throws(() => oracle.assertKeyedCaptureParity({ native, direct, browser: wrongBrowserBackend, scenario }), /backend/i);
});

