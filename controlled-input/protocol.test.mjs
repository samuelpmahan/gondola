import test from "node:test";
import assert from "node:assert/strict";
import {
  bindingAt,
  clone,
  isDisabled,
  literalHandlerAt,
  nodeAtPath,
  normalizePath,
  validateSnapshot,
} from "./protocol.mjs";

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, { Attrs = null, On = null, Kids = null, Key = "" } = {}) => ({
  Kind: 1,
  Tag,
  Key,
  Attrs,
  On,
  Kids,
  Text: "",
});

function fixture() {
  return {
    state: { arbitrary: { userDefined: true } },
    tree: element("div", {
      Attrs: [attr("class", "editor")],
      Kids: [
        element("input", { Attrs: [attr("type", "text"), attr("value", "draft"), attr("aria-label", "Draft")] }),
        element("p", { Kids: [text("Saved: draft")] }),
        element("button", {
          Attrs: [attr("class", "save"), attr("disabled", "", true)],
          On: [{ Event: "click", Message: "application-specific-save", Arg: "" }],
          Kids: [text("Save")],
        }),
      ],
    }),
    bindings: [{ Path: "0", Event: "input", Message: "application-specific-edit", Source: "target.value" }],
    messages: [{ Name: "application-specific-message", Arg: "arbitrary payload" }],
  };
}

test("validates the shared snapshot and resolves canonical paths, bindings and literal arguments", () => {
  const snapshot = fixture();
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.equal(normalizePath([0]), "0");
  assert.equal(normalizePath(""), "");
  assert.equal(nodeAtPath(snapshot.tree, "0").Tag, "input");
  assert.equal(bindingAt(snapshot, "0", "input").Message, "application-specific-edit");
  assert.equal(bindingAt(snapshot, "0", "change"), null);
  assert.equal(literalHandlerAt(snapshot.tree, "2", "click").Arg, "");
  assert.equal(isDisabled(nodeAtPath(snapshot.tree, "2")), true);

  const copied = clone(snapshot);
  copied.tree.Kids[0].Attrs[1].Value = "changed";
  assert.equal(snapshot.tree.Kids[0].Attrs[1].Value, "draft");
});

test("keeps browser protocol generic about state and application message names", () => {
  const snapshot = fixture();
  snapshot.state = { anyApplicationShape: [1, "two", null] };
  snapshot.bindings[0].Message = "another-app-edit-message";
  snapshot.tree.Kids[2].On[0].Message = "yet-another-app-click-message";
  snapshot.messages[0].Name = "an-unlisted-message-is-valid";
  assert.doesNotThrow(() => validateSnapshot(snapshot));
});

test("rejects malformed snapshot envelopes, runtime errors, messages and tree nodes", () => {
  const missing = fixture();
  delete missing.bindings;
  assert.throws(() => validateSnapshot(missing), /exactly bindings/);

  const errored = { error: "Go dispatch failed" };
  assert.throws(() => validateSnapshot(errored), /runtime returned an error/);

  const extra = fixture();
  extra.effects = [];
  assert.throws(() => validateSnapshot(extra), /exactly bindings/);

  const malformedMessage = fixture();
  malformedMessage.messages[0].Arg = 3;
  assert.throws(() => validateSnapshot(malformedMessage), /Name and Arg must be strings/);

  const keyed = fixture();
  keyed.tree.Key = "unstable";
  assert.throws(() => validateSnapshot(keyed), /keyed reconciliation/);

  const script = fixture();
  script.tree.Kids[1].Tag = "script";
  assert.throws(() => validateSnapshot(script), /unsupported HTML element/);
});

test("rejects unsupported tags, attributes, styles, and literal event names", () => {
  const source = fixture();
  source.tree.Attrs.push(attr("src", "https://example.test"));
  assert.throws(() => validateSnapshot(source), /unsupported attribute/);

  const style = fixture();
  style.tree.Attrs[0].Style = [{ Property: "color", Value: "red" }];
  assert.throws(() => validateSnapshot(style), /structured styles are unsupported/);

  const handler = fixture();
  handler.tree.Kids[2].On[0].Event = "mouseover";
  assert.throws(() => validateSnapshot(handler), /non-empty Event and Message/);

  const inline = fixture();
  inline.tree.Attrs.push(attr("onclick", "alert(1)"));
  assert.throws(() => validateSnapshot(inline), /unsupported attribute/);
});

test("rejects malformed and ambiguous value bindings", () => {
  const duplicate = fixture();
  duplicate.bindings.push({ ...duplicate.bindings[0] });
  assert.throws(() => validateSnapshot(duplicate), /duplicate binding/);

  const colliding = fixture();
  colliding.tree.Kids[0].On = [{ Event: "input", Message: "literal", Arg: "fixed" }];
  assert.throws(() => validateSnapshot(colliding));

  const source = fixture();
  source.bindings[0].Source = "target.checked";
  assert.throws(() => validateSnapshot(source), /unsupported binding/);

  const event = fixture();
  event.bindings[0].Event = "change";
  assert.throws(() => validateSnapshot(event), /unsupported binding/);

  const path = fixture();
  path.bindings[0].Path = "00";
  assert.throws(() => validateSnapshot(path), /canonical/);

  const wrongTarget = fixture();
  wrongTarget.bindings[0].Path = "1";
  assert.throws(() => validateSnapshot(wrongTarget), /requires input/);

  const missingValue = fixture();
  missingValue.tree.Kids[0].Attrs = [attr("type", "text")];
  assert.throws(() => validateSnapshot(missingValue), /exactly one value attribute/);

  const duplicateValue = fixture();
  duplicateValue.tree.Kids[0].Attrs.push(attr("value", "other"));
  assert.throws(() => validateSnapshot(duplicateValue), /duplicate attribute/);
});

test("rejects malformed child paths before lookup", () => {
  assert.throws(() => normalizePath("1//2"), /canonical child indexes/);
  assert.throws(() => normalizePath([0, -1]), /non-negative child indexes/);
  assert.throws(() => nodeAtPath(fixture().tree, "9"), /no Node exists/);
});
