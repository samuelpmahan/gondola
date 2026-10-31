import assert from "node:assert/strict";
import test from "node:test";
import { createQualificationDecorator } from "./qualification-decorator.mjs";

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.nodeName = "#text";
    this.textContent = text;
    this.parentNode = null;
  }

  get isConnected() { return Boolean(this.parentNode?.isConnected); }
}

class FakeElement {
  constructor(tag, { className = "", disabled = false, text = "" } = {}) {
    this.nodeType = 1;
    this.nodeName = tag.toUpperCase();
    this.localName = tag;
    this.className = className;
    this.disabled = disabled;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = new Map();
    if (disabled) this.attributes.set("disabled", "");
    this.value = "";
    if (text) this.appendChild(new FakeText(text));
  }

  get children() { return this.childNodes.filter((item) => item.nodeType === 1); }
  get firstElementChild() { return this.children[0] ?? null; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get isConnected() { return this.parentNode ? this.parentNode.isConnected : false; }
  get textContent() { return this.childNodes.map((item) => item.textContent).join(""); }
  set textContent(value) {
    this.childNodes = [];
    if (value !== "") this.appendChild(new FakeText(String(value)));
  }
  get outerHTML() {
    const attrs = [...this.attributes].map(([name, value]) => ` ${name}="${value}"`).join("");
    return `<${this.localName}${attrs}>${this.childNodes.map((item) => item.outerHTML ?? escapeText(item.textContent)).join("")}</${this.localName}>`;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = this.childNodes.indexOf(before);
    if (index < 0) return this.appendChild(child);
    child.parentNode = this;
    this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

  querySelector(selector) {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      if (this.className.split(/\s+/).includes(className)) return this;
    }
    if (selector === "button" && this.localName === "button") return this;
    for (const child of this.children) {
      const result = child.querySelector(selector);
      if (result) return result;
    }
    return null;
  }

  querySelectorAll(selector) {
    const tags = selector.split(",").map((item) => item.trim());
    const result = [];
    if (tags.includes(this.localName)) result.push(this);
    for (const child of this.children) result.push(...child.querySelectorAll(selector));
    return result;
  }
}

class FakeContainer extends FakeElement {
  constructor(root) {
    super("div");
    this.appendChild(root);
    this.listeners = new Map();
  }

  get firstElementChild() { return this.children[0] ?? null; }

  addEventListener(name, callback, capture) {
    this.listeners.set(`${name}:${capture}`, callback);
  }

  removeEventListener(name, callback, capture) {
    if (this.listeners.get(`${name}:${capture}`) === callback) this.listeners.delete(`${name}:${capture}`);
  }

  click(target) { this.listeners.get("click:true")?.({ type: "click", target }); }
}

function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function initialDOM() {
  const root = new FakeElement("main");
  root.appendChild(new FakeElement("p", { text: "Parent generation 1" }));
  const rows = new FakeElement("div", { className: "children" });
  rows.appendChild(new FakeElement("section", { text: "Child oak generation 2" }));
  rows.appendChild(new FakeElement("section", { text: "Child elm generation 3" }));
  root.appendChild(rows);
  root.appendChild(new FakeElement("button", { disabled: true, text: "Set input step 1" }));
  return { root, rows, container: new FakeContainer(root) };
}

function afterInitialUpdate(decorator, container, backend = "react", getActiveEventIndex = () => null) {
  decorator.rendererDecorator.afterUpdate({
    backend,
    rendererId: 1,
    updateIndex: 0,
    container,
    core: {},
    view: {},
    getActiveEventIndex,
    getActiveAction: () => null,
  });
}

for (const [fault, expected] of [
  ["text-corruption", { tag: "#text", changed: true }],
  ["key-order", { tag: "div", changed: true }],
  ["enabled-control", { tag: "button", changed: true }],
]) {
  test(`${fault} mutates only the actual initial DOM and records activation`, () => {
    const { root, rows, container } = initialDOM();
    const reported = [];
    const decorator = createQualificationDecorator({ fault, onActivation: (record) => reported.push(record) });
    afterInitialUpdate(decorator, container);
    const [activation] = decorator.activationRecords();

    assert.equal(activation.fault, fault);
    assert.equal(activation.backend, "react");
    assert.equal(activation.eventIndex, null);
    assert.equal(activation.target.tag, expected.tag);
    assert.ok(activation.target.before);
    assert.ok(activation.target.after);
    assert.equal(reported.length, 1);
    assert.deepEqual(decorator.callbackInvocations(), {
      rendererDispatch: 0, rendererStale: 0, forwardedDispatch: 0, forwardedStale: 0,
    });
    if (fault === "text-corruption") assert.match(root.textContent, /qualification text fault/);
    if (fault === "key-order") assert.match(rows.children[0].textContent, /elm/);
    if (fault === "enabled-control") assert.equal(root.querySelector("button").disabled, false);
    assert.notDeepEqual(activation.target.before, activation.target.after);
    assert.equal(decorator.dispose().listenerRemoved, true);
  });
}

for (const [fault, expectedForwarded] of [["drop-click", 0], ["duplicate-click", 2]]) {
  test(`${fault} records one physical click and intercepts actual renderer callbacks`, () => {
    const { container, root } = initialDOM();
    const target = root.querySelector("button");
    let eventIndex = null;
    let baseDispatches = 0;
    const reported = [];
    const decorator = createQualificationDecorator({ fault, onActivation: (record) => reported.push(record) });
    afterInitialUpdate(decorator, container, "react", () => eventIndex);
    const callbacks = {
      dispatch() { baseDispatches += 1; return { accepted: true }; },
      onStaleAction() { return { accepted: false }; },
    };
    const wrapped = decorator.rendererDecorator.wrapCallbacks({
      backend: "react",
      rendererId: 1,
      callbacks,
      getActiveEventIndex: () => eventIndex,
      container,
    });

    eventIndex = 0;
    const before = decorator.callbackInvocations();
    container.click(target);
    const result = wrapped.dispatch({ path: "0", event: "click", value: "" }, { name: "counter.add", arg: "oak" });
    const after = decorator.callbackInvocations();
    const [activation] = decorator.activationRecords();

    assert.equal(activation.eventIndex, 0);
    assert.equal(activation.target.path, "2");
    assert.equal(activation.callbackInvocationsBefore.rendererDispatch, before.rendererDispatch);
    assert.equal(activation.callbackInvocationsAfter.rendererDispatch, after.rendererDispatch);
    assert.equal(activation.callbackInvocationsAfter.forwardedDispatch, expectedForwarded);
    assert.equal(baseDispatches, expectedForwarded);
    assert.equal(reported.length, 1);
    assert.equal(after.rendererDispatch, 1);
    assert.equal(after.forwardedDispatch, expectedForwarded);
    if (fault === "drop-click") assert.equal(result, undefined);
    if (fault === "duplicate-click") assert.equal(result.accepted, true);
    assert.equal(decorator.dispose().listenerRemoved, true);
    assert.equal(decorator.dispose().disposed, true);
  });
}

test("unknown fault profiles fail closed; no-fault decorator only forwards once", () => {
  assert.throws(() => createQualificationDecorator({ fault: "generic-error" }), /unknown qualification fault/);
  const decorator = createQualificationDecorator();
  const { root, container } = initialDOM();
  const initialHTML = root.outerHTML;
  afterInitialUpdate(decorator, container);
  assert.equal(root.outerHTML, initialHTML);
  assert.deepEqual(decorator.activationRecords(), []);
  let calls = 0;
  const callbacks = { dispatch() { calls += 1; return "forwarded"; }, onStaleAction() { return "stale"; } };
  const wrapped = decorator.rendererDecorator.wrapCallbacks({
    backend: "dom", callbacks, getActiveEventIndex: () => 0, container: initialDOM().container,
  });
  assert.equal(wrapped.dispatch({}, {}), "forwarded");
  assert.equal(calls, 1);
  assert.deepEqual(decorator.activationRecords(), []);
  assert.deepEqual(decorator.callbackInvocations(), {
    rendererDispatch: 1, rendererStale: 0, forwardedDispatch: 1, forwardedStale: 0,
  });
});
