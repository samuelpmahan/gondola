import test from "node:test";
import assert from "node:assert/strict";
import {
  bindingAt,
  clone,
  isDisabled,
  keyAtPath,
  literalHandlerAt,
  nodeAtPath,
  normalizePath,
  pathForKey,
  validateSnapshot,
} from "./protocol.mjs";

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});

function fixture() {
  return {
    state: { rows: [{ id: 1, draft: "draft" }] },
    tree: element("div", "collection", {
      Attrs: [attr("class", "collection")],
      Kids: [
        element("input", "row-1-input", {
          Attrs: [attr("type", "text"), attr("value", "draft"), attr("aria-label", "Row 1")],
        }),
        element("p", "row-1-status", { Kids: [text("Status: idle")] }),
        element("button", "row-1-save", {
          Attrs: [attr("class", "save")],
          On: [{ Event: "click", Message: "save", Arg: "1" }],
          Kids: [text("Save")],
        }),
      ],
    }),
    bindings: [{ Path: "0", Event: "input", Message: "edit/1", Source: "target.value" }],
    messages: [],
  };
}

test("validates unique element keys and retains them in cloned snapshots", () => {
  const snapshot = fixture();
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.equal(keyAtPath(snapshot.tree, "0"), "row-1-input");
  assert.equal(pathForKey(snapshot.tree, "row-1-status"), "1");
  assert.equal(pathForKey(snapshot.tree, "missing"), null);
  assert.equal(nodeAtPath(snapshot.tree, normalizePath([2])).Key, "row-1-save");
  assert.equal(bindingAt(snapshot, "0", "input").Message, "edit/1");
  assert.equal(literalHandlerAt(snapshot.tree, "2", "click").Arg, "1");
  assert.equal(isDisabled(nodeAtPath(snapshot.tree, "2")), false);

  const copied = clone(snapshot);
  copied.tree.Kids[0].Key = "changed-input";
  assert.equal(snapshot.tree.Kids[0].Key, "row-1-input");
  assert.equal(validateSnapshot(snapshot).tree.Kids[0].Key, "row-1-input");
});

test("rejects absent, malformed, duplicate, and text-node keys", () => {
  const missing = fixture();
  missing.tree.Kids[0].Key = "";
  assert.throws(() => validateSnapshot(missing), /element key/);

  const malformed = fixture();
  malformed.tree.Kids[0].Key = "row_1";
  assert.throws(() => validateSnapshot(malformed), /key.*ASCII token/);

  const duplicate = fixture();
  duplicate.tree.Kids[1].Key = duplicate.tree.Kids[0].Key;
  assert.throws(() => validateSnapshot(duplicate), /duplicate element key/);

  const textKey = fixture();
  textKey.tree.Kids[1].Kids[0].Key = "text-key";
  assert.throws(() => validateSnapshot(textKey), /text Node.*empty key/);
});

test("keyed validation preserves the controlled-input schema checks", () => {
  const unsupported = fixture();
  unsupported.tree.Kids[0].Attrs.push(attr("onclick", "bad"));
  assert.throws(() => validateSnapshot(unsupported), /unsupported attribute/);

  const badBinding = fixture();
  badBinding.bindings[0].Path = "1";
  assert.throws(() => validateSnapshot(badBinding), /requires input/);

  const badShape = fixture();
  badShape.extra = [];
  assert.throws(() => validateSnapshot(badShape), /exactly bindings/);
});

test("contains exotic getter failures from untrusted snapshots", () => {
  const snapshot = fixture();
  Object.defineProperty(snapshot.tree, "Kids", {
    enumerable: true,
    get() { throw new Error("hostile getter"); },
  });
  assert.throws(() => validateSnapshot(snapshot), /hostile getter/);
});
