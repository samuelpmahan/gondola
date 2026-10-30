import test from "node:test";
import assert from "node:assert/strict";

import { goSliceValues, recordGoNode, resolveDirectMessage } from "./direct-js.mjs";

const emptyView = (node) => ({ tree: node, bindings: [] });
const node = ({ kind = 1, tag = "button", key = "", attrs = [], on = [], kids = [], text = "" } = {}) => ({
  Kind: kind, Tag: tag, Key: key, Attrs: attrs, On: on, Kids: kids, Text: text,
});

test("reads exact offset/length from the pinned GoScript slice wrapper", () => {
  const backing = ["sentinel", "first", "second", "tail"];
  assert.deepEqual(goSliceValues({ backing, offset: 1, length: 2, capacity: 3, target: "string" }), ["first", "second"]);
  assert.deepEqual(goSliceValues({ backing, offset: 2, length: 0, capacity: 2, target: "string" }), []);
  assert.equal(goSliceValues(null), null);
  assert.deepEqual(goSliceValues([]), []);
});

test("serializes Node slices losslessly, including nil and empty distinctions", () => {
  const root = node({
    attrs: { backing: [
      { Name: "ignored", Value: "prefix", Flag: false, Style: null },
      { Name: "class", Value: "x", Flag: false, Style: [] },
      { Name: "ignored", Value: "suffix", Flag: false, Style: null },
    ], offset: 1, length: 1, capacity: 2, target: "gobi.Attr" },
    on: null,
    kids: [],
  });
  assert.deepEqual(recordGoNode(root), {
    kind: 1, tag: "button", key: "", attrs: [{ name: "class", value: "x", flag: false, style: [] }],
    on: null, kids: [], text: "",
  });
});

test("direct event mapping keeps a literal target.value argument distinct from Action.value", () => {
  const button = node({ on: [{ Event: "click", Message: "literal", Arg: "target.value" }] });
  assert.deepEqual(resolveDirectMessage(emptyView(button), {
    path: "", event: "click", value: "must not replace literal",
  }), { name: "literal", arg: "target.value", source: "literal" });
});

test("bindings use the attempted target value while stale or disabled targets do not dispatch", () => {
  const input = node({ tag: "input" });
  assert.deepEqual(resolveDirectMessage({
    tree: node({ tag: "div", kids: [input] }),
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
  }, { path: "0", event: "input", value: "draft" }), { name: "edit", arg: "draft", source: "binding" });
  assert.equal(resolveDirectMessage(emptyView(node()), { path: "2/1/0", event: "input", value: "old" }), null);
  const disabled = node({ attrs: [{ Name: "disabled", Value: "", Flag: true, Style: null }], on: [{ Event: "click", Message: "reset", Arg: "" }] });
  assert.equal(resolveDirectMessage(emptyView(disabled), { path: "", event: "click", value: "" }), null);
});
