import test from "node:test";
import assert from "node:assert/strict";
import { mountKeyedDOM } from "./dom.mjs";

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});

function makeSnapshot(rows, messages = []) {
  const bindings = [];
  const rowNodes = rows.map((row, index) => {
    const base = `row-${row.id}`;
    const path = `2/${index}`;
    bindings.push({
      Path: `${path}/0`, Event: "input", Message: `edit/${row.id}`, Source: "target.value",
    });
    return element("div", base, {
      Attrs: [attr("class", "row")],
      Kids: [
        element("input", `${base}-input`, {
          Attrs: [attr("type", "text"), attr("value", row.draft), attr("aria-label", `Row ${row.id}`)],
        }),
        element("p", `${base}-saved`, { Kids: [text(`Saved: ${row.saved}`)] }),
        element("p", `${base}-status`, { Kids: [text(`Status: ${row.status ?? "idle"}`)] }),
        element("button", `${base}-save`, {
          Attrs: [attr("class", "save"), ...(row.draft === "" ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "save", Arg: String(row.id) }],
          Kids: [text("Save")],
        }),
      ],
    });
  });
  return {
    state: { rows: rows.map((row) => ({ ...row })) },
    tree: element("div", "collection", {
      Attrs: [attr("class", "collection")],
      Kids: [
        element("button", "add", {
          Attrs: [attr("class", "add")], On: [{ Event: "click", Message: "add", Arg: "" }], Kids: [text("Add row")],
        }),
        element("button", "reset", {
          Attrs: [attr("class", "reset"), ...(rows.length === 0 ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "reset", Arg: "" }], Kids: [text("Reset")],
        }),
        element("div", "rows", { Attrs: [attr("class", "rows")], Kids: rowNodes.length ? rowNodes : null }),
      ],
    }),
    bindings,
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

  appendChild(node) { return this.insertBefore(node, null); }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error("node is not a child");
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    if (this.ownerDocument.activeElement && (node === this.ownerDocument.activeElement || node.contains?.(this.ownerDocument.activeElement))) {
      this.ownerDocument.activeElement = null;
    }
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of [...this.childNodes]) this.removeChild(child);
    for (const node of nodes) this.appendChild(node);
  }

  contains(node) {
    return node === this || this.childNodes.some((child) => child === node || child.contains?.(node));
  }

  get innerHTML() { return this.childNodes.map(serialize).join(""); }
}

class FakeText extends FakeNode {
  constructor(value, ownerDocument) { super(3, ownerDocument); this.nodeValue = value; }
}

class FakeElement extends FakeNode {
  constructor(tag, ownerDocument) {
    super(1, ownerDocument);
    this.localName = tag;
    this._attributes = new Map();
    this._listeners = new Map();
    this._value = "";
    this.valueAssignments = 0;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.selectionDirection = "none";
  }

  get attributes() { return [...this._attributes].map(([name, value]) => ({ name, value })); }
  get value() { return this._value; }
  set value(next) { this._value = String(next); this.valueAssignments += 1; }
  get disabled() { return this._attributes.has("disabled"); }
  hasAttribute(name) { return this._attributes.has(name); }
  getAttribute(name) { return this._attributes.get(name) ?? null; }

  setAttribute(name, value) {
    const had = this._attributes.has(name);
    this._attributes.set(name, String(value));
    if (name === "value" && !had) this._value = String(value);
  }

  removeAttribute(name) { this._attributes.delete(name); }
  addEventListener(name, listener) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(listener);
  }
  removeEventListener(name, listener) { this._listeners.get(name)?.delete(listener); }
  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    for (const listener of [...(this._listeners.get(event.type) ?? [])]) listener(event);
    event.currentTarget = null;
    return true;
  }
  click() {
    if (!this.disabled) this.dispatchEvent({ type: "click", target: null, currentTarget: null });
  }
  focus() { this.ownerDocument.activeElement = this; }
  setSelectionRange(start, end, direction = "none") {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }
}

class FakeDocument {
  constructor() { this.activeElement = null; }
  createElement(tag) { return new FakeElement(tag, this); }
  createTextNode(value) { return new FakeText(value, this); }
}

function escape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function serialize(node) {
  if (node.nodeType === 3) return escape(node.nodeValue ?? "");
  const attrs = node.attributes.map(({ name, value }) => ` ${name}="${escape(value).replaceAll('"', "&quot;")}"`).join("");
  if (node.localName === "input") return `<input${attrs}>`;
  return `<${node.localName}${attrs}>${node.childNodes.map(serialize).join("")}</${node.localName}>`;
}

function makeRoot() {
  const document = new FakeDocument();
  return { document, root: new FakeElement("root", document) };
}

function elementAt(root, path) {
  let current = root;
  for (const index of path.split("/")) current = current.childNodes[Number(index)];
  return current;
}

function rowNodes(root) { return root.childNodes[0].childNodes[2].childNodes; }

function makeRuntime(rows) {
  let current = makeSnapshot(rows);
  const steps = [];
  let initCalls = 0;
  return {
    steps,
    get initCalls() { return initCalls; },
    setSnapshot(snapshot) { current = snapshot; },
    runtime: {
      init() { initCalls += 1; return current; },
      dispatch(step) {
        steps.push({ ...step });
        current = makeSnapshot(current.state.rows.map((row) => ({
          ...row,
          ...(step.Event === "input" && step.Key === `row-${row.id}-input` ? { draft: step.Value } : {}),
          ...(step.Event === "click" && step.Message === "unused" ? { status: "clicked" } : {}),
        })));
        return current;
      },
    },
  };
}

const rows12 = [
  { id: 1, draft: "alpha", saved: "old-a", status: "idle" },
  { id: 2, draft: "bravo", saved: "old-b", status: "idle" },
];

test("retains keyed row and input identity across reorder/update and preserves focused selection", () => {
  const { root, document } = makeRoot();
  const { runtime } = makeRuntime(rows12);
  const renderer = mountKeyedDOM(root, runtime);
  const [row1, row2] = rowNodes(root);
  const input1 = row1.childNodes[0];
  const input2 = row2.childNodes[0];
  const afterMountAssignments = input2.valueAssignments;
  input2.focus();
  input2.setSelectionRange(1, 4, "backward");

  renderer.update(makeSnapshot([
    { ...rows12[1], saved: "fresh-b", status: "saved" },
    rows12[0],
  ]));

  assert.equal(rowNodes(root)[0], row2);
  assert.equal(rowNodes(root)[1], row1);
  assert.equal(elementAt(root, "0/2/0/0"), input2);
  assert.equal(elementAt(root, "0/2/1/0"), input1);
  assert.equal(document.activeElement, input2);
  assert.deepEqual([input2.selectionStart, input2.selectionEnd, input2.selectionDirection], [1, 4, "backward"]);
  assert.equal(input2.value, "bravo");
  assert.equal(input2.valueAssignments, afterMountAssignments, "unchanged controlled values are not assigned");
  assert.match(renderer.domSnapshot().html, /aria-label="Row 2" type="text" value="bravo"/);
  assert.doesNotMatch(renderer.domSnapshot().html, /data-key/);
  renderer.unmount();
});

test("events use current path/key after keyed movement and preserve target.value", () => {
  const { root } = makeRoot();
  const fixture = makeRuntime(rows12);
  const { runtime, steps } = fixture;
  const renderer = mountKeyedDOM(root, runtime);
  const input2 = rowNodes(root)[1].childNodes[0];
  const reordered = makeSnapshot([rows12[1], rows12[0]]);
  fixture.setSnapshot(reordered);
  renderer.update(reordered);
  input2.value = "typed&<雪";
  input2.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.deepEqual(steps.at(-1), {
    Path: "2/0/0", Event: "input", Value: "typed&<雪", Key: "row-2-input",
  });
  const save2 = elementAt(root, "0/2/0/3");
  save2.click();
  assert.deepEqual(steps.at(-1), { Path: "2/0/3", Event: "click", Value: "2", Key: "row-2-save" });
  assert.equal(renderer.snapshot().state.rows[0].draft, "typed&<雪");
  renderer.unmount();
});

test("removed or manually detached controls and their handlers cannot dispatch at a reused path", () => {
  const { root } = makeRoot();
  const { runtime, steps } = makeRuntime(rows12);
  const renderer = mountKeyedDOM(root, runtime);
  const staleRow = rowNodes(root)[0];
  const staleInput = staleRow.childNodes[0];
  const staleButton = staleRow.childNodes[3];

  renderer.update(makeSnapshot([rows12[1]]));
  renderer.update(makeSnapshot([{ id: 3, draft: "new", saved: "", status: "idle" }]));
  staleInput.value = "stale edit";
  staleInput.dispatchEvent({ type: "input", target: null, currentTarget: null });
  staleButton.click();
  assert.deepEqual(steps, []);

  const currentInput = elementAt(root, "0/2/0/0");
  currentInput.value = "current";
  currentInput.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.deepEqual(steps, [{ Path: "2/0/0", Event: "input", Value: "current", Key: "row-3-input" }]);

  const detached = rowNodes(root)[0].childNodes[0];
  rowNodes(root)[0].removeChild(detached);
  detached.value = "detached";
  detached.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.equal(steps.length, 1);
  renderer.unmount();
});

test("captures and restores focus by logical key across backend replacement", () => {
  const first = makeRoot();
  const firstRenderer = mountKeyedDOM(first.root, { init: () => makeSnapshot(rows12), dispatch: () => makeSnapshot(rows12) });
  const firstInput = elementAt(first.root, "0/2/1/0");
  firstInput.focus();
  firstInput.setSelectionRange(2, 4, "forward");
  const focus = firstRenderer.focusState();
  assert.deepEqual(focus, {
    key: "row-2-input", selectionStart: 2, selectionEnd: 4, selectionDirection: "forward",
  });
  firstRenderer.unmount();

  const second = makeRoot();
  const secondRenderer = mountKeyedDOM(second.root, { init: () => makeSnapshot(rows12), dispatch: () => makeSnapshot(rows12) });
  secondRenderer.restoreFocus(focus);
  const secondInput = elementAt(second.root, "0/2/1/0");
  assert.notEqual(secondInput, firstInput);
  assert.equal(second.document.activeElement, secondInput);
  assert.deepEqual([secondInput.selectionStart, secondInput.selectionEnd, secondInput.selectionDirection], [2, 4, "forward"]);
  secondRenderer.restoreFocus({ ...focus, key: "removed-row-input" });
  assert.equal(second.document.activeElement, secondInput, "missing keys do not focus a different row");
  secondRenderer.unmount();
});

test("deleting the focused row does not transfer focus to another keyed input", () => {
  const { root, document } = makeRoot();
  const { runtime } = makeRuntime(rows12);
  const renderer = mountKeyedDOM(root, runtime);
  const focused = rowNodes(root)[1].childNodes[0];
  focused.focus();
  focused.setSelectionRange(1, 3, "backward");

  renderer.update(makeSnapshot([rows12[0]]));
  assert.notEqual(document.activeElement, rowNodes(root)[0].childNodes[0]);
  assert.equal(document.activeElement, null, "removing the active node leaves the document unfocused");
  renderer.unmount();
});

test("disabled controls are reported and do not dispatch or receive logical focus", () => {
  const { root, document } = makeRoot();
  const empty = [{ id: 3, draft: "", saved: "", status: "idle" }];
  const { runtime, steps } = makeRuntime(empty);
  const renderer = mountKeyedDOM(root, runtime);
  const save = elementAt(root, "0/2/0/3");
  const input = elementAt(root, "0/2/0/0");
  assert.deepEqual(renderer.domSnapshot().disabled, ["2/0/3"]);
  renderer.click("2/0/3");
  assert.deepEqual(steps, []);

  save.focus();
  assert.equal(renderer.focusState(), null, "buttons do not produce a logical input selection");
  input.focus();
  input.setSelectionRange(0, 0);
  assert.equal(renderer.focusState().key, "row-3-input");
  renderer.unmount();
});

test("invalid update is rejected before accepted snapshot or DOM changes", () => {
  const { root } = makeRoot();
  const { runtime } = makeRuntime(rows12);
  const renderer = mountKeyedDOM(root, runtime);
  const beforeSnapshot = renderer.snapshot();
  const beforeHTML = renderer.domSnapshot().html;
  const invalid = makeSnapshot(rows12);
  invalid.tree.Kids[2].Kids[1].Key = invalid.tree.Kids[2].Kids[0].Key;

  assert.throws(() => renderer.update(invalid), /duplicate element key/);
  assert.deepEqual(renderer.snapshot(), beforeSnapshot);
  assert.equal(renderer.domSnapshot().html, beforeHTML);
  renderer.unmount();
});

test("native event patch failures notify the host after fencing the renderer", () => {
  const { root } = makeRoot();
  const reported = [];
  const initialRows = [{ id: 1, draft: "draft", saved: "", status: "idle" }];
  let dispatchCalls = 0;
  const runtime = {
    init: () => makeSnapshot(initialRows),
    dispatch(step) {
      dispatchCalls += 1;
      return makeSnapshot([{ ...initialRows[0], draft: step.Value, saved: "updated" }]);
    },
    rendererFailed(error) { reported.push(error); },
  };
  const renderer = mountKeyedDOM(root, runtime);
  const savedText = rowNodes(root)[0].childNodes[1].childNodes[0];
  let value = savedText.nodeValue;
  Object.defineProperty(savedText, "nodeValue", {
    configurable: true,
    get() { return value; },
    set(next) {
      if (next === "Saved: updated") throw new Error("synthetic DOM patch failure");
      value = next;
    },
  });

  const input = rowNodes(root)[0].childNodes[0];
  input.value = "draft";
  input.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.equal(dispatchCalls, 1);
  assert.equal(reported.length, 1);
  assert.match(reported[0].message, /synthetic DOM patch failure/);
  assert.match(renderer.lastError().message, /synthetic DOM patch failure/);

  input.value = "must remain fenced";
  input.dispatchEvent({ type: "input", target: null, currentTarget: null });
  assert.equal(dispatchCalls, 1, "later native events do not reach a renderer after a failed patch");
  renderer.unmount();
});
