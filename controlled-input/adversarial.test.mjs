import test from "node:test";
import assert from "node:assert/strict";
import { bindingAt, literalHandlerAt, validateSnapshot } from "./protocol.mjs";
import { runAdversarial } from "./adversarial.mjs";

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({
  Kind: 2,
  Tag: "",
  Key: "",
  Attrs: null,
  On: null,
  Kids: null,
  Text,
});
const element = (Tag, Attrs = null, On = null, Kids = null) => ({
  Kind: 1,
  Tag,
  Key: "",
  Attrs,
  On,
  Kids,
  Text: "",
});

function validSnapshot() {
  return {
    state: { Draft: "", Saved: "", Saves: 0 },
    tree: element("div", [attr("class", "editor")], null, [
      element("input", [attr("type", "text"), attr("value"), attr("aria-label", "Draft")]),
      element("p", null, null, [text("Saved: "), text("")]),
      element("p", null, null, [text("Saves: "), text("0")]),
      element("button", [attr("class", "save"), attr("disabled", "", true)],
        [{ Event: "click", Message: "save", Arg: "" }], [text("Save")]),
      element("button", [attr("class", "reset"), attr("disabled", "", true)],
        [{ Event: "click", Message: "reset", Arg: "" }], [text("Reset")]),
    ]),
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: [],
  };
}

test("the complete controlled-input snapshot and its separate literal click handler validate", () => {
  const snapshot = validSnapshot();
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.deepEqual(bindingAt(snapshot, "0", "input"), {
    Path: "0", Event: "input", Message: "edit", Source: "target.value",
  });
  assert.deepEqual(literalHandlerAt(snapshot.tree, "3", "click"), {
    Event: "click", Message: "save", Arg: "",
  });
});

test("browser protocol rejects duplicate path/event bindings", () => {
  const duplicate = validSnapshot();
  duplicate.bindings.push(structuredClone(duplicate.bindings[0]));
  assert.throws(() => validateSnapshot(duplicate), /duplicate binding for "0" "input"/i);
});

test("browser protocol rejects an input Node.On event at a bound path by its click-only rule", () => {
  const inputHandler = validSnapshot();
  inputHandler.tree.Kids[0].On = [{ Event: "input", Message: "edit", Arg: "literal" }];
  assert.throws(() => validateSnapshot(inputHandler),
    /Node\.On at 0 must contain non-empty Event and Message and string Arg fields/i);
});

test("browser protocol rejects unsupported event and source semantics", () => {
  const unsupportedSource = validSnapshot();
  unsupportedSource.bindings[0].Source = "target.checked";
  assert.throws(() => validateSnapshot(unsupportedSource), /unsupported binding/i);

  const unsupportedEvent = validSnapshot();
  unsupportedEvent.bindings[0].Event = "change";
  assert.throws(() => validateSnapshot(unsupportedEvent), /unsupported binding/i);
});

test("target.value requires a text input with exactly one value attribute", () => {
  const wrongType = validSnapshot();
  wrongType.tree.Kids[0].Attrs[0].Value = "checkbox";
  assert.throws(() => validateSnapshot(wrongType), /input|target\.value/i);

  const missingValue = validSnapshot();
  missingValue.tree.Kids[0].Attrs = missingValue.tree.Kids[0].Attrs.filter(({ Name }) => Name !== "value");
  assert.throws(() => validateSnapshot(missingValue), /input|target\.value/i);

  const duplicateValue = validSnapshot();
  duplicateValue.tree.Kids[0].Attrs.push(attr("value", "second"));
  assert.throws(() => validateSnapshot(duplicateValue), /duplicate attribute/i);
});

test("browser protocol rejects malformed and non-canonical binding paths", () => {
  const malformed = validSnapshot();
  malformed.bindings[0].Path = "0/";
  assert.throws(() => validateSnapshot(malformed), /path/i);

  const nonCanonical = validSnapshot();
  nonCanonical.bindings[0].Path = "00";
  assert.throws(() => validateSnapshot(nonCanonical), /canonical/i);
});

test("runAdversarial requires the Playwright keyboard and locator APIs", async () => {
  await assert.rejects(
    runAdversarial({ evaluate() {}, locator() {}, keyboard: {} }),
    /Playwright-compatible page/,
  );
});
