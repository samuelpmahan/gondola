import test from "node:test";
import assert from "node:assert/strict";
import { mountEditorDOM } from "./dom.mjs";

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key: "", Attrs, On, Kids, Text: "",
});

function editorSnapshot(state, messages = []) {
  const empty = state.Draft === "" && state.Saved === "" && state.Saves === 0;
  return {
    state: { ...state },
    tree: element("div", {
      Attrs: [attr("class", "editor")],
      Kids: [
        element("input", {
          Attrs: [attr("type", "text"), attr("value", state.Draft), attr("aria-label", "Draft")],
        }),
        element("p", { Kids: [text(`Saved: ${state.Saved}`)] }),
        element("p", { Kids: [text(`Saves: ${state.Saves}`)] }),
        element("button", {
          Attrs: [attr("class", "save"), ...(state.Draft === "" ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "save", Arg: "" }],
          Kids: [text("Save")],
        }),
        element("button", {
          Attrs: [attr("class", "reset"), ...(empty ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "reset", Arg: "" }],
          Kids: [text("Reset")],
        }),
      ],
    }),
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: messages.map((message) => ({ ...message })),
  };
}

class FakeNode {
  constructor(nodeType, ownerDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }

  insertBefore(node, reference) {
    if (node === reference) return node;
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = reference == null ? this.childNodes.length : this.childNodes.indexOf(reference);
    if (index < 0) throw new Error("reference is not a child");
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }

  appendChild(node) {
    return this.insertBefore(node, null);
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error("node is not a child");
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of [...this.childNodes]) this.removeChild(child);
    for (const node of nodes) this.appendChild(node);
  }

  contains(node) {
    if (node === this) return true;
    return this.childNodes.some((child) => child === node || child.contains?.(node));
  }

  get innerHTML() {
    return this.childNodes.map(serialize).join("");
  }
}

class FakeText extends FakeNode {
  constructor(textValue, ownerDocument) {
    super(3, ownerDocument);
    this.nodeValue = textValue;
  }
}

class FakeElement extends FakeNode {
  constructor(tag, ownerDocument) {
    super(1, ownerDocument);
    this.localName = tag;
    this._attributes = new Map();
    this._listeners = new Map();
    this._value = "";
    this._valueDirty = false;
  }

  get attributes() {
    return [...this._attributes].map(([name, value]) => ({ name, value }));
  }

  get value() { return this._value; }
  set value(next) {
    this._value = String(next);
    this._valueDirty = true;
  }

  get disabled() { return this._attributes.has("disabled"); }

  hasAttribute(name) { return this._attributes.has(name); }
  getAttribute(name) { return this._attributes.get(name) ?? null; }

  setAttribute(name, value) {
    const had = this._attributes.has(name);
    this._attributes.set(name, String(value));
    if (name === "value" && !this._valueDirty && !had) this._value = String(value);
  }

  removeAttribute(name) {
    this._attributes.delete(name);
    if (name === "value" && !this._valueDirty) this._value = "";
  }

  addEventListener(eventName, listener) {
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, new Set());
    this._listeners.get(eventName).add(listener);
  }

  removeEventListener(eventName, listener) {
    this._listeners.get(eventName)?.delete(listener);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    for (const listener of [...(this._listeners.get(event.type) ?? [])]) listener(event);
    event.currentTarget = null;
    return true;
  }

  click() {
    if (this.disabled) return;
    this.dispatchEvent({ type: "click", target: null, currentTarget: null });
  }

  focus() { this.ownerDocument.activeElement = this; }
}

class FakeDocument {
  constructor() { this.activeElement = null; }
  createElement(tag) { return new FakeElement(tag, this); }
  createTextNode(value) { return new FakeText(value, this); }
}

function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', "&quot;");
}

function serialize(node) {
  if (node.nodeType === 3) return escapeText(node.nodeValue ?? "");
  const attrs = node.attributes.map(({ name, value }) => ` ${name}="${escapeAttribute(value)}"`).join("");
  if (node.localName === "input") return `<input${attrs}>`;
  return `<${node.localName}${attrs}>${node.childNodes.map(serialize).join("")}</${node.localName}>`;
}

function makeRoot() {
  const document = new FakeDocument();
  const root = new FakeElement("root", document);
  return { root, document };
}

function makeRuntime(initial = { Draft: "", Saved: "", Saves: 0 }) {
  let state = { ...initial };
  const messages = [];
  const steps = [];
  let initCalls = 0;
  const runtime = {
    init() {
      initCalls += 1;
      return editorSnapshot(state, messages);
    },
    dispatch(step) {
      steps.push({ ...step });
      const message = step.Event === "input"
        ? { Name: "edit", Arg: step.Value }
        : { Name: step.Path === "3" ? "save" : "reset", Arg: step.Value };
      messages.push(message);
      if (step.Event === "input") state = { ...state, Draft: step.Value };
      if (message.Name === "save" && state.Draft !== "") {
        state = { ...state, Saved: state.Draft, Saves: state.Saves + 1 };
      }
      if (message.Name === "reset") state = { Draft: "", Saved: "", Saves: 0 };
      return editorSnapshot(state, messages);
    },
  };
  return { runtime, steps, get initCalls() { return initCalls; } };
}

function inputAt(root) { return root.childNodes[0].childNodes[0]; }

test("mounts once and patches text input in place while preserving focus and currentTarget value", () => {
  const { root, document } = makeRoot();
  const fixture = makeRuntime();
  const { runtime, steps } = fixture;
  const renderer = mountEditorDOM(root, runtime);
  const input = inputAt(root);
  input.focus();

  for (const value of ["a", "ab", "ab&<雪"]) {
    input.value = value;
    input.dispatchEvent({ type: "input", target: null, currentTarget: null });
    assert.equal(inputAt(root), input, "ordinary typing should preserve the input element");
    assert.equal(document.activeElement, input, "ordinary typing should preserve focus");
    assert.equal(input.value, value);
  }

  assert.equal(fixture.initCalls, 1);
  assert.deepEqual(steps.map(({ Path, Event, Value }) => ({ Path, Event, Value })), [
    { Path: "0", Event: "input", Value: "a" },
    { Path: "0", Event: "input", Value: "ab" },
    { Path: "0", Event: "input", Value: "ab&<雪" },
  ]);
  assert.equal(renderer.snapshot().state.Draft, "ab&<雪");
  assert.match(renderer.domSnapshot().html, /aria-label="Draft" type="text" value="ab&amp;&lt;雪"/);
  assert.deepEqual(renderer.domSnapshot().disabled, []);
  renderer.unmount();
});

test("literal clicks transport their declared Arg unchanged and disabled clicks are suppressed", () => {
  const { root } = makeRoot();
  const { runtime, steps } = makeRuntime();
  const renderer = mountEditorDOM(root, runtime);

  renderer.click("3");
  assert.deepEqual(steps, []);
  assert.deepEqual(renderer.domSnapshot().disabled, ["3", "4"]);

  const input = inputAt(root);
  input.value = "draft";
  input.dispatchEvent({ type: "input", target: null, currentTarget: null });
  renderer.click("3");
  assert.deepEqual(steps.at(-1), { Path: "3", Event: "click", Value: "" });
  assert.equal(renderer.snapshot().state.Saved, "draft");
  renderer.unmount();
});

test("invalid dispatch snapshots fail closed before the renderer changes its accepted snapshot", () => {
  const { root } = makeRoot();
  const good = editorSnapshot({ Draft: "", Saved: "", Saves: 0 });
  let calls = 0;
  const runtime = {
    init: () => good,
    dispatch() {
      calls += 1;
      return { error: "bad response" };
    },
  };
  const renderer = mountEditorDOM(root, runtime);
  const input = inputAt(root);
  const oldHTML = renderer.domSnapshot().html;
  input.value = "invalid-next-snapshot";
  input.dispatchEvent({ type: "input", target: null, currentTarget: null });

  assert.equal(calls, 1);
  assert.equal(renderer.snapshot().state.Draft, "");
  assert.equal(renderer.domSnapshot().html, oldHTML);
  assert.match(renderer.lastError().message, /runtime returned an error/);
  assert.throws(() => renderer.click("4"), /fenced after an error/);
  renderer.unmount();
});

test("a null dispatch result is invalid and fences later input events", () => {
  const { root } = makeRoot();
  const initial = editorSnapshot({ Draft: "", Saved: "", Saves: 0 });
  let calls = 0;
  const runtime = {
    init: () => initial,
    dispatch() {
      calls += 1;
      return null;
    },
  };
  const renderer = mountEditorDOM(root, runtime);
  const input = inputAt(root);
  const oldHTML = renderer.domSnapshot().html;

  input.value = "invalid-null-response";
  input.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.equal(calls, 1);
  assert.ok(renderer.lastError());
  assert.match(renderer.lastError().message, /snapshot must be an object/);
  assert.equal(renderer.snapshot().state.Draft, "");
  assert.equal(renderer.domSnapshot().html, oldHTML);

  input.value = "must stay fenced";
  input.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.equal(calls, 1, "later input events must not call a runtime after its invalid null response");
  assert.equal(renderer.snapshot().state.Draft, "");
  assert.equal(renderer.domSnapshot().html, oldHTML);
  renderer.unmount();
});

test("detached and unmounted native input elements cannot dispatch stale events", () => {
  const { root } = makeRoot();
  const { runtime, steps } = makeRuntime();
  const renderer = mountEditorDOM(root, runtime);
  const outer = root.childNodes[0];
  const staleInput = inputAt(root);

  outer.removeChild(staleInput);
  staleInput.value = "detached";
  staleInput.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.equal(steps.length, 0);

  renderer.unmount();
  staleInput.value = "after unmount";
  staleInput.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.equal(steps.length, 0);
  assert.equal(root.childNodes.length, 0);
});

test("invalid initial snapshots leave preexisting root children untouched", () => {
  const { root, document } = makeRoot();
  const sentinel = document.createElement("p");
  root.appendChild(sentinel);
  assert.throws(() => mountEditorDOM(root, { init: () => ({ error: "bad init" }), dispatch() {} }), /invalid snapshot/);
  assert.equal(root.childNodes[0], sentinel);
});
