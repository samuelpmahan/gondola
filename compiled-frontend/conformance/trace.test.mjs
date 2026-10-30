import test from "node:test";
import assert from "node:assert/strict";

import { assertExactTraceValue } from "./compare.mjs";
import { assertTraceMatch, ContractViolation, validateHostScript, validateTrace, validateTypedValue } from "./trace.mjs";

const app = {
  components: [{ id: "form", stateType: "State" }],
  types: [
    { id: "bool", kind: "bool", jsRepresentation: "direct" },
    { id: "string", kind: "string", jsRepresentation: "direct" },
    { id: "[]string", kind: "slice", elemType: "string", jsRepresentation: "array-or-goscript-slice" },
    { id: "State", kind: "struct", fields: [
      { name: "Text", type: "string" },
      { name: "Enabled", type: "bool" },
      { name: "Rows", type: "[]string" },
    ], jsRepresentation: "class" },
  ],
};

function state(text = "", enabled = false, rows = null) {
  return {
    typeId: "State", kind: "struct", fields: [
      { name: "Text", value: { typeId: "string", kind: "string", string: text } },
      { name: "Enabled", value: { typeId: "bool", kind: "bool", bool: enabled } },
      { name: "Rows", value: { typeId: "[]string", kind: "slice", isNil: rows === null, items: (rows ?? [])
        .map((value) => ({ typeId: "string", kind: "string", string: value })) } },
    ],
  };
}

const view = {
  tree: { kind: 1, tag: "div", key: "", attrs: [], on: [], kids: [], text: "" },
  bindings: [],
};

const initialTick = {
  index: 0, action: null, message: null, dispatchId: null, state: state(),
  requestedEffects: [], completedEffects: [], view, dom: null,
};

function effectTrace() {
  const request = {
    dispatchId: "dispatch-action", effectIndex: 0,
    effect: { kind: "test", name: "load", arg: "one", reply: "Loaded" },
  };
  const reply = { name: "Loaded", arg: "ok" };
  return {
    schema: "gobi.trace/v1", appId: "form", ticks: [
      initialTick,
      { index: 1, action: { path: "1", event: "click", value: "" }, message: { name: "Load", arg: "" }, dispatchId: "dispatch-action",
        state: state("pending"), requestedEffects: [request], completedEffects: [], view, dom: null },
      { index: 2, action: null, message: reply, dispatchId: "dispatch-reply", state: state("loaded"), requestedEffects: [],
        completedEffects: [{ dispatchId: request.dispatchId, effectIndex: request.effectIndex, message: reply }], view, dom: null },
    ],
  };
}

test("accepts exact contract trace with a correlated request and reply", () => {
  const trace = effectTrace();
  assert.equal(validateTrace(trace, app), true);
  assert.equal(validateHostScript({ schema: "gobi.host-script/v1", steps: [
    { request: trace.ticks[1].requestedEffects[0], completion: { name: "Loaded", arg: "ok" } },
  ] }, trace), true);
});

test("rejects wrong schema, missing fields, extra fields, and reordered or missing ticks", () => {
  const trace = effectTrace();
  assert.throws(() => validateTrace({ ...trace, schema: "gobi.trace/v2" }, app), /expected gobi.trace\/v1/);
  const missing = structuredClone(trace);
  delete missing.ticks[1].dispatchId;
  assert.throws(() => validateTrace(missing, app), /closed fields differ/);
  const extra = structuredClone(trace);
  extra.ticks[1].mystery = true;
  assert.throws(() => validateTrace(extra, app), /closed fields differ/);
  const badStateType = structuredClone(trace);
  badStateType.ticks[1].state = { typeId: "string", kind: "string", string: "wrong type" };
  assert.throws(() => validateTrace(badStateType, app), /expected component state type State/);
  const reordered = structuredClone(trace);
  [reordered.ticks[1], reordered.ticks[2]] = [reordered.ticks[2], reordered.ticks[1]];
  assert.throws(() => validateTrace(reordered, app), /contiguous tick index/);
  const omitted = structuredClone(trace);
  omitted.ticks.pop();
  assert.throws(() => validateHostScript({ schema: "gobi.host-script/v1", steps: [
    { request: trace.ticks[1].requestedEffects[0], completion: { name: "Loaded", arg: "ok" } },
  ] }, omitted), /\$\.hostScript\.completedEffects/);
});

test("rejects invalid tagged types, field order, nil markers, and float bit encodings", () => {
  assert.throws(() => validateTypedValue({ typeId: "State", kind: "struct", fields: [] }, app.types), /struct field count differs/);
  const swapped = state();
  [swapped.fields[0], swapped.fields[1]] = [swapped.fields[1], swapped.fields[0]];
  assert.throws(() => validateTypedValue(swapped, app.types), /declaration-order/);
  const nilSlice = state().fields[2].value;
  assert.equal(nilSlice.isNil, true);
  assert.equal(validateTypedValue({ ...nilSlice, isNil: false }, app.types), true);
  assert.throws(() => assertExactTraceValue(nilSlice, { ...nilSlice, isNil: false }), /\.isNil/);
  const floatInfo = [{ id: "f", kind: "float64", jsRepresentation: "number" }];
  assert.equal(validateTypedValue({ typeId: "f", kind: "float64", float64Bits: "8000000000000000" }, floatInfo), true);
  assert.throws(() => validateTypedValue({ typeId: "f", kind: "float64", float64Bits: "7ff8000000000000" }, floatInfo), /non-finite/);
  assert.throws(() => validateTypedValue({ typeId: "f", kind: "float64", float64Bits: "800000000000000A" }, floatInfo), /lower-case/);
  const integerTypes = [
    { id: "int32", kind: "int", bits: 32, jsRepresentation: "number" },
    { id: "uint64", kind: "uint", bits: 64, jsRepresentation: "bigint" },
  ];
  assert.equal(validateTypedValue({ typeId: "int32", kind: "int", integer: "-2147483648" }, integerTypes), true);
  assert.equal(validateTypedValue({ typeId: "uint64", kind: "uint", integer: "9007199254740993" }, integerTypes), true);
  assert.throws(() => validateTypedValue({ typeId: "int32", kind: "int", integer: "2147483648" }, integerTypes), /outside int32 range/);
});

test("requires the pinned ABI representation on every declared AppIR type", () => {
  const trace = effectTrace();
  const missing = structuredClone(app);
  delete missing.types[0].jsRepresentation;
  assert.throws(() => validateTrace(trace, missing), /closed fields differ.*jsRepresentation/);
  const invalid = structuredClone(app);
  invalid.types[0].jsRepresentation = "unknown";
  assert.throws(() => validateTrace(trace, invalid), /invalid bool representation/);
});

test("rejects mismatched request order and completion correlation", () => {
  const trace = effectTrace();
  const wrongScript = structuredClone({ schema: "gobi.host-script/v1", steps: [
    { request: trace.ticks[1].requestedEffects[0], completion: { name: "Loaded", arg: "ok" } },
  ] });
  wrongScript.steps[0].request.effect.arg = "different";
  assert.throws(() => validateHostScript(wrongScript, trace), /requestedEffects/);
  const wrongCompletion = structuredClone(trace);
  wrongCompletion.ticks[2].completedEffects[0].dispatchId = "other";
  assert.throws(() => validateTrace(wrongCompletion, app), /unknown or not-yet-requested/);
  const duplicate = structuredClone(trace);
  duplicate.ticks[2].completedEffects.push(duplicate.ticks[2].completedEffects[0]);
  assert.throws(() => validateTrace(duplicate, app), /at most once/);
  const wrongName = structuredClone(trace);
  wrongName.ticks[2].completedEffects[0].message.name = "Other";
  wrongName.ticks[2].message.name = "Other";
  assert.throws(() => validateTrace(wrongName, app), /reply message name differs/);

  const twoRequests = structuredClone(trace);
  const first = twoRequests.ticks[1].requestedEffects[0];
  const second = structuredClone(first);
  second.effectIndex = 1;
  second.effect.name = "second";
  twoRequests.ticks[1].requestedEffects.push(second);
  assert.equal(validateTrace(twoRequests, app), true);
  const reorderedRequests = structuredClone(twoRequests);
  reorderedRequests.ticks[1].requestedEffects.reverse();
  assert.throws(() => validateTrace(reorderedRequests, app), /indices must follow request order/);
  const reorderedScript = { schema: "gobi.host-script/v1", steps: [
    { request: second, completion: null }, { request: first, completion: { name: "Loaded", arg: "ok" } },
  ] };
  assert.throws(() => validateHostScript(reorderedScript, twoRequests), /requestedEffects/);
});

test("preserves tree and DOM evidence; browser matching requires independent DOM snapshots", () => {
  const expected = effectTrace();
  const actual = structuredClone(expected);
  actual.ticks[1].view.tree.kids.push({ kind: 2, text: "hidden" });
  assert.throws(() => assertTraceMatch(expected, actual), /view\.tree\.kids\.length/);

  const browser = structuredClone(expected);
  const dom = { normalization: "outerHTML-v1", html: "<div></div>", controls: [] };
  browser.ticks.forEach((tick) => { tick.dom = structuredClone(dom); });
  assert.throws(() => assertTraceMatch(expected, browser), /ticks\[0\]\.dom/);
  assert.throws(() => assertTraceMatch(expected, browser, { domSnapshots: [dom, null, dom] }), /oracle must provide/);
  assert.doesNotThrow(() => assertTraceMatch(expected, browser, { domSnapshots: [dom, dom, dom] }));
  browser.ticks[1].dom.controls.push({ path: "0", key: null, tag: "input", type: "text", value: "wrong", checked: false, disabled: false });
  assert.throws(() => assertTraceMatch(expected, browser, { domSnapshots: [dom, dom, dom] }), /dom\.controls\.length/);
});

test("retains literal handler text and explicit target binding source as distinct fields", () => {
  const literal = { event: "click", message: "Literal", arg: "target.value" };
  const binding = { path: "0", event: "input", message: "Changed", source: "target.value" };
  assertExactTraceValue({ literal, binding }, { binding, literal });
  assert.equal(Object.hasOwn(literal, "source"), false);
  assert.equal(Object.hasOwn(binding, "arg"), false);
  const trace = structuredClone(effectTrace());
  trace.ticks = [{ ...initialTick, view: {
    tree: { ...view.tree, on: [literal] }, bindings: [binding],
  } }];
  assert.equal(validateTrace(trace, app), true);
});
