import test from "node:test";
import assert from "node:assert/strict";
import { compareSnapshots } from "./check.mjs";

const gobiModel = () => ({
  state: { Count: 1 },
  tree: {
    Kind: 1,
    Tag: "div",
    Key: "",
    Attrs: [{ Name: "class", Value: "counter", Flag: false, Style: null }],
    On: null,
    Kids: [{ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text: "1" }],
    Text: "",
  },
  messages: [{ Name: "add", Arg: "" }],
});

const gobiDOM = () => ({
  html: '<div class="counter"><p>Count: 1</p><button class="add">+</button><button>Reset</button></div>',
  root: '<div class="counter"><p>Count: 1</p><button class="add">+</button><button>Reset</button></div>',
  disabled: [],
});

test("matching snapshots have no differences", () => {
  assert.deepEqual(compareSnapshots(gobiModel(), gobiDOM(), gobiModel(), gobiDOM()), []);
});

test("the comparator catches state drift", () => {
  const react = gobiModel();
  react.state.Count = 2;
  assert.deepEqual(compareSnapshots(gobiModel(), gobiDOM(), react, gobiDOM()).map((item) => item.field), ["state"]);
});

test("the comparator catches full Node tree drift", () => {
  const react = gobiModel();
  react.tree.Attrs[0].Value = "other";
  assert.deepEqual(compareSnapshots(gobiModel(), gobiDOM(), react, gobiDOM()).map((item) => item.field), ["tree"]);
});

test("the comparator catches ordered message-log drift", () => {
  const left = gobiModel();
  const right = gobiModel();
  left.messages.push({ Name: "reset", Arg: "" });
  right.messages.push({ Name: "add", Arg: "" });
  assert.deepEqual(compareSnapshots(left, gobiDOM(), right, gobiDOM()).map((item) => item.field), ["messages"]);
});

test("the comparator checks serialized DOM and disabled state separately", () => {
  const expectedDOM = gobiDOM();
  const actualDOM = gobiDOM();
  expectedDOM.html = '<div class="counter"><p>Count: 1</p><button disabled="">Reset</button></div>';
  expectedDOM.disabled = ["2"];
  assert.deepEqual(compareSnapshots(gobiModel(), actualDOM, gobiModel(), expectedDOM).map((item) => item.field), ["dom.html", "dom.disabled"]);
});
