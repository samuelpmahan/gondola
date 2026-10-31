import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const EXPECTED_STATES = Object.freeze([
  [0, 0, false, 0],
  [0, 1, false, 0],
  [0, 2, false, 0],
  [0, 2, false, 2],
  [0, 3, false, 2],
  [2, 3, false, 2],
  [2, 0, false, 2],
  [2, 0, false, 2],
  [2, 1, false, 2],
  [2, 1, true, 2],
  [2, 1, true, 2],
  [2, 1, true, 2],
  [3, 1, true, 2],
  [3, 1, true, 1],
  [1, 1, true, 1],
  [1, 1, false, 1],
  [1, 2, false, 1],
  [0, 2, false, 1],
  [0, 2, false, 1],
].map(([parent, child, readOnly, savedChild]) => Object.freeze({ parent, child, readOnly, savedChild })));

const ACTIONS = Object.freeze([
  ["1/1", "childAdd", false],
  ["1/1", "childAdd", false],
  ["4", "captureChild", false],
  ["1/1", "childAdd", false],
  ["5", "publishSaved", false],
  ["1/2", "childReset", false],
  ["1/2", null, true],
  ["1/1", "childAdd", false],
  ["2", "toggleReadOnly", false],
  ["1/1", null, true],
  ["1/2", null, true],
  ["0/1", "parentAdd", false],
  ["4", "captureChild", false],
  ["5", "publishSaved", false],
  ["2", "toggleReadOnly", false],
  ["1/1", "childAdd", false],
  ["0/2", "parentReset", false],
  ["0/2", null, true],
].map(([path, message, disabled]) => Object.freeze({ path, message, disabled })));

const DISABLED_ACTIONS = Object.freeze([6, 9, 10, 17]);
const METHODS_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/methods";
const COUNTER_PACKAGE = "github.com/samuelpmahan/gondola/counter";

function float64Wire(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(value);
  return { typeId: "float64", kind: "float64", float64Bits: bytes.toString("hex") };
}

function expectedGoState(state) {
  return {
    typeId: `${METHODS_PACKAGE}.State`,
    kind: "struct",
    fields: [
      { name: "Parent", value: { typeId: `${COUNTER_PACKAGE}.State`, kind: "struct", fields: [{ name: "Count", value: float64Wire(state.parent) }] } },
      { name: "Child", value: { typeId: `${COUNTER_PACKAGE}.State`, kind: "struct", fields: [{ name: "Count", value: float64Wire(state.child) }] } },
      { name: "ReadOnly", value: { typeId: "bool", kind: "bool", bool: state.readOnly } },
      { name: "SavedChild", value: float64Wire(state.savedChild) },
    ],
  };
}

function textNode(text) {
  return { kind: 2, tag: "", key: "", attrs: null, on: null, kids: null, text: String(text) };
}

function classAttr(value) {
  return { name: "class", value, flag: false, style: null };
}

function disabledAttr() {
  return { name: "disabled", value: "", flag: true, style: null };
}

function click(message) {
  return [{ event: "click", message, arg: "" }];
}

function element(tag, key, attrs, on, kids) {
  return { kind: 1, tag, key, attrs, on, kids, text: "" };
}

function button(key, label, message, disabled = false) {
  return element("button", key, disabled ? [disabledAttr()] : null, click(message), [textNode(label)]);
}

function expectedGoTree(state) {
  const root = element("div", "methods", [classAttr("method-composition")], null, [
    element("div", "parent", [classAttr("parent-counter")], null, [
      element("p", "", null, null, [textNode("Parent: "), textNode(state.parent)]),
      button("parent-add", "Parent +", "parentAdd"),
      button("parent-reset", "Parent Reset", "parentReset", state.parent === 0),
    ]),
    element("div", "child", [classAttr("child-counter")], null, [
      element("p", "", null, null, [textNode("Child: "), textNode(state.child)]),
      button("child-add", "Child +", "childAdd", state.readOnly),
      button("child-reset", "Child Reset", "childReset", state.readOnly || state.child === 0),
    ]),
    button("readonly-toggle", state.readOnly ? "Unlock child" : "Lock child", "toggleReadOnly"),
    element("p", "", null, null, [textNode("Saved child: "), textNode(state.savedChild)]),
    button("capture-child", "Capture child", "captureChild"),
    button("publish-saved", "Publish saved to parent", "publishSaved"),
  ]);
  return root;
}

function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll("\"", "&quot;");
}

function serializeOuterHTML(node) {
  if (node.kind === 2) return escapeText(node.text);
  const attrs = (node.attrs ?? []).map((attr) => attr.flag
    ? ` ${attr.name}=""`
    : ` ${attr.name}="${escapeAttribute(attr.value)}"`).join("");
  return `<${node.tag}${attrs}>${(node.kids ?? []).map(serializeOuterHTML).join("")}</${node.tag}>`;
}

function expectedControls(tree) {
  const controls = [];
  const visit = (node, path) => {
    if (node.kind !== 1) return;
    if (node.tag === "button") {
      controls.push({
        path,
        key: node.key,
        tag: "button",
        type: "submit",
        value: "",
        checked: false,
        disabled: (node.attrs ?? []).some((attr) => attr.name === "disabled"),
      });
    }
    (node.kids ?? []).forEach((kid, index) => visit(kid, path ? `${path}/${index}` : String(index)));
  };
  visit(tree, "");
  return controls;
}

function expectedSnapshot(state) {
  const tree = expectedGoTree(state);
  return {
    normalization: "outerHTML-v1",
    html: serializeOuterHTML(tree),
    controls: expectedControls(tree),
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || !argv[index + 1]) throw new Error(`invalid option near ${key}`);
    result[key.slice(2)] = argv[++index];
  }
  for (const required of ["browser", "native", "direct", "output"]) {
    if (!result[required]) throw new Error(`missing --${required}`);
  }
  result.stage ??= "unclassified";
  return result;
}

const args = parseArgs(process.argv.slice(2));
const inputFiles = Object.fromEntries(["browser", "native", "direct"].map((name) => [name, resolve(args[name])]));
const [browser, native, direct] = await Promise.all(["browser", "native", "direct"].map(async (name) =>
  JSON.parse(await readFile(inputFiles[name], "utf8"))));

function checkTrace(trace, label, checkDOM) {
  assert.equal(trace.schema, "gobi.trace/v1", `${label} trace schema`);
  assert.equal(trace.appId, METHODS_PACKAGE, `${label} app ID`);
  assert.equal(trace.ticks.length, EXPECTED_STATES.length, `${label} trace tick count`);
  for (let tickIndex = 0; tickIndex < EXPECTED_STATES.length; tickIndex += 1) {
    const tick = trace.ticks[tickIndex];
    const state = EXPECTED_STATES[tickIndex];
    assert.deepEqual(tick.state, expectedGoState(state), `${label} tick ${tickIndex} encoded Go state`);
    assert.deepEqual(tick.view?.tree, expectedGoTree(state), `${label} tick ${tickIndex} Go View tree`);
    assert.deepEqual(tick.view?.bindings, [], `${label} tick ${tickIndex} view bindings`);
    assert.deepEqual(tick.requestedEffects, [], `${label} tick ${tickIndex} requested effects`);
    assert.deepEqual(tick.completedEffects, [], `${label} tick ${tickIndex} completed effects`);
    if (checkDOM) assert.deepEqual(tick.dom, expectedSnapshot(state), `${label} tick ${tickIndex} trace DOM`);
  }
}

checkTrace(native, "native", false);
checkTrace(direct, "direct", false);
assert.equal(browser.schema, "gobi.methods-browser-conformance/v1");
const profileSummaries = {};
for (const backend of ["react", "dom", "swap"]) {
  const profile = browser.profiles?.[backend];
  assert.ok(profile, `missing ${backend} profile`);
  assert.equal(profile.backend, backend);
  checkTrace(profile.trace, `${backend} browser`, true);
  for (const field of ["domOracle", "physicalDOMSnapshots"]) {
    assert.equal(profile[field]?.length, EXPECTED_STATES.length, `${backend}.${field} tick count`);
    for (let tickIndex = 0; tickIndex < EXPECTED_STATES.length; tickIndex += 1) {
      const record = profile[field][tickIndex];
      const state = EXPECTED_STATES[tickIndex];
      assert.equal(record.tickIndex, tickIndex, `${backend}.${field}[${tickIndex}] tick index`);
      assert.deepEqual(record.state, state, `${backend}.${field}[${tickIndex}] plain Go state`);
      assert.deepEqual(record.snapshot, expectedSnapshot(state), `${backend}.${field}[${tickIndex}] physical/oracle HTML and controls`);
    }
  }
  assert.equal(profile.actions?.length, ACTIONS.length, `${backend} action record count`);
  for (let actionIndex = 0; actionIndex < ACTIONS.length; actionIndex += 1) {
    const expected = ACTIONS[actionIndex];
    const record = profile.actions[actionIndex];
    assert.equal(record.actionIndex, actionIndex, `${backend} action index ${actionIndex}`);
    assert.deepEqual(record.action, { path: expected.path, event: "click", value: "" }, `${backend} action ${actionIndex} source path`);
    assert.equal(record.expectedMessage === null, expected.message === null, `${backend} action ${actionIndex} expected message presence`);
    if (expected.message !== null) assert.deepEqual(record.expectedMessage, { name: expected.message, arg: "" }, `${backend} action ${actionIndex} message`);
    assert.equal(record.target?.disabled, expected.disabled, `${backend} action ${actionIndex} live target disabled property`);
    assert.equal(Boolean(record.physicalClick?.disabled), expected.disabled, `${backend} action ${actionIndex} physical click disabled property`);
    assert.equal(record.physicalClick?.attempted, true, `${backend} action ${actionIndex} physical click evidence`);
  }
  assert.deepEqual(DISABLED_ACTIONS, ACTIONS.map((action, index) => action.disabled ? index : -1).filter((index) => index >= 0));
  profileSummaries[backend] = {
    ticks: profile.trace.ticks.length,
    domOracleSnapshots: profile.domOracle.length,
    physicalDOMSnapshots: profile.physicalDOMSnapshots.length,
    physicalDisabledIntents: ACTIONS.map((action, index) => action.disabled ? index : -1).filter((index) => index >= 0),
    noEffects: true,
  };
}

const swapProfile = browser.profiles.swap;
assert.equal(swapProfile.swaps.length, ACTIONS.length, "swap physical snapshot count");
for (let actionIndex = 0; actionIndex < ACTIONS.length; actionIndex += 1) {
  const afterTick = actionIndex + 1;
  const state = EXPECTED_STATES[afterTick];
  const swap = swapProfile.swaps[actionIndex];
  assert.equal(swap.actionIndex, actionIndex, `swap action index ${actionIndex}`);
  assert.equal(swap.newSnapshot?.oracle?.tickIndex, afterTick, `swap oracle snapshot tick ${actionIndex}`);
  assert.deepEqual(swap.newSnapshot?.oracle?.snapshot, expectedSnapshot(state), `swap oracle snapshot ${actionIndex}`);
  assert.equal(swap.newSnapshot?.physical?.tickIndex, afterTick, `swap physical snapshot tick ${actionIndex}`);
  assert.deepEqual(swap.newSnapshot?.physical?.snapshot, expectedSnapshot(state), `swap physical snapshot ${actionIndex}`);
}

const inputHashes = {};
for (const [name, path] of Object.entries(inputFiles)) inputHashes[name] = createHash("sha256").update(await readFile(path)).digest("hex");
const result = {
  schema: "gobi.ci-dom-independent-audit/v1",
  status: "passed",
  stage: args.stage,
  sourceCommit: args["source-commit"] ?? null,
  artifactReference: args["artifact-reference"] ?? null,
  oracle: "Hand-authored fixed Go value state and node tree; independent outerHTML-v1 serializer and button live-control projection.",
  fixture: "compiled-value-method-composition-child-readonly-snapshot",
  appId: METHODS_PACKAGE,
  stateSnapshots: EXPECTED_STATES.length,
  profiles: profileSummaries,
  swapPhysicalSnapshots: swapProfile.swaps.length,
  inputSha256: inputHashes,
  sourceIndependent: true,
  checks: [
    "native and direct traces match all 19 literal Go state and View tree expectations",
    "React, DOM, and swap traces match all 19 literal Go state and View tree expectations",
    "all 19 per-profile DOM oracle and physical snapshots match independently serialized HTML and live button properties",
    "the four disabled physical intents are exactly indexes 6, 9, 10, and 17",
    "all trace ticks have empty requested/completed effects",
    "all 18 replacement physical snapshots match the expected post-action state",
  ],
};
const outputPath = resolve(args.output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
