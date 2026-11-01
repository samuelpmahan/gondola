import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadKeyedModuleBuilds } from "../conformance/module-loader.mjs";
import { mountCompiledKeyedModules } from "./runtime.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const defaultBuildIndex = resolve(here, "../build/output/E-BUILD-final/build-index.json");
const buildIndexPath = resolve(process.env.GOBI_KEYED_BUILD_INDEX ?? defaultBuildIndex);
const CHILD_ADD = Object.freeze({ path: "2/1", event: "click", value: "" });
const PARENT_REORDER = Object.freeze({ path: "6/4", event: "click", value: "" });
const PARENT_REMOVE_A = Object.freeze({ path: "6/1", event: "click", value: "" });
const PARENT_MOUNT_A = Object.freeze({ path: "6/0", event: "click", value: "" });

function list(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.slice();
  return value.backing.slice(value.offset, value.offset + value.length);
}

function nodeRecord(node) {
  return {
    kind: node.Kind,
    tag: node.Tag,
    key: node.Key,
    attrs: node.Attrs === null ? null : list(node.Attrs).map((attr) => ({
      name: attr.Name,
      value: attr.Value,
      flag: attr.Flag,
      style: attr.Style === null ? null : list(attr.Style).map((style) => ({ property: style.Property, value: style.Value })),
    })),
    on: node.On === null ? null : list(node.On).map((handler) => ({ event: handler.Event, message: handler.Message, arg: handler.Arg })),
    kids: node.Kids === null ? null : list(node.Kids).map(nodeRecord),
    text: node.Text,
  };
}

class FakeElement {
  constructor(ownerDocument, tag = "div") {
    this.nodeType = 1;
    this.localName = tag;
    this.ownerDocument = ownerDocument;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  get firstElementChild() { return this.childNodes.find((node) => node.nodeType === 1) ?? null; }
  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    for (const child of nodes) {
      if (child.parentNode) child.parentNode.replaceChildren(...child.parentNode.childNodes.filter((node) => node !== child));
      child.parentNode = this;
      this.childNodes.push(child);
    }
  }
  remove() {
    if (this.parentNode) this.parentNode.replaceChildren(...this.parentNode.childNodes.filter((node) => node !== this));
  }
}

function testDOM() {
  const document = { createElement(tag) { return new FakeElement(document, tag); } };
  return { document, container: document.createElement("main") };
}

function rendererRegistry(created) {
  function factory(backend) {
    return ({ container }) => {
      let view = null;
      let callbacks = null;
      let active = true;
      const renderer = {
        viewCapabilities: ["view.node", "binding.value", "binding.checked"],
        update(nextView, nextCallbacks) { view = nextView; callbacks = nextCallbacks; },
        viewRecord() {
          if (!view) return null;
          const tree = Object.hasOwn(view, "Tree") ? view.Tree : view;
          const bindings = Object.hasOwn(view, "Bindings") ? list(view.Bindings).map((binding) => ({
            path: binding.Path, event: binding.Event, message: binding.Message, source: binding.Source,
          })) : [];
          return { tree: nodeRecord(tree), bindings };
        },
        domSnapshot() { return { normalization: "outerHTML-v1", html: "", controls: [] }; },
        unmount() { active = false; view = null; },
        get callbacks() { return callbacks; },
        get active() { return active; },
        container,
        backend,
      };
      created.push(renderer);
      return renderer;
    };
  }
  return { dom: factory("dom"), react: factory("react") };
}

async function loadDOMBuild() {
  const loaded = await loadKeyedModuleBuilds(buildIndexPath);
  return loaded.builds.dom;
}

function withInitCounter(side) {
  let calls = 0;
  const initID = `${side.componentId}.Init`;
  const original = side.module.symbols[initID];
  return {
    side: { ...side, module: { ...side.module, symbols: { ...side.module.symbols, [initID](...args) { calls += 1; return original(...args); } } } },
    calls: () => calls,
  };
}

async function validatesHelperAdmission() {
  const build = await loadDOMBuild();
  const mutations = [
    ["bytes", (pin) => { pin.bytes[0] ^= 1; }],
    ["backend", (pin) => { pin.backend = "react"; }],
    ["packagePath", (pin) => { pin.packagePath += ".wrong"; }],
    ["componentId", (pin) => { pin.componentId += ".wrong"; }],
    ["moduleABI", (pin) => { pin.moduleABI = "0".repeat(64); }],
    ["appIR", (pin) => { pin.appIR = "0".repeat(64); }],
  ];
  for (const [name, mutate] of mutations) {
    const parent = withInitCounter(build.parent);
    const sidecar = { ...parent.side.keyedSidecar, bytes: new Uint8Array(parent.side.keyedSidecar.bytes) };
    mutate(sidecar);
    const side = { ...parent.side, keyedSidecar: sidecar };
    const { container } = testDOM();
    const created = [];
    await assert.rejects(mountCompiledKeyedModules({ parent: side, child: build.child, renderers: rendererRegistry(created), backend: "dom", container }),
      new RegExp(name === "bytes" ? "digest" : "pin|identity|backend|component|ABI|AppIR", "i"));
    assert.deepEqual(created, [], `${name}: renderer factories must not run before keyed helper admission`);
    assert.equal(parent.calls(), 0, `${name}: parent Init must not run before keyed helper admission`);
    assert.equal(container.childNodes.length, 0, `${name}: the outer container must remain untouched`);
  }
}

test("keeps keyed states and DOM roots by identity, and fences removed, remounted, and swapped callbacks", async () => {
  const loaded = await loadKeyedModuleBuilds(buildIndexPath);
  for (const backend of ["dom", "react"]) {
  const build = loaded.builds[backend];
  const { container } = testDOM();
  const created = [];
  const host = await mountCompiledKeyedModules({ parent: build.parent, child: build.child,
    renderers: rendererRegistry(created), backend, container });
  assert.deepEqual(host.snapshot().children.map(({ key, generation }) => [key, generation]), [["a", 1], ["b", 1]]);
  const initial = host.mountedHandles();
  const originalA = initial.children.find((item) => item.key === "a");
  const originalACallbacks = originalA.renderer.callbacks;

  assert.equal(originalACallbacks.dispatch(CHILD_ADD, { Name: "add", Arg: "" }).accepted, true);
  assert.equal(host.snapshot().children.find((item) => item.key === "a").childState.count, 1);
  assert.equal(host.snapshot().children.find((item) => item.key === "b").childState.count, 0);

  assert.equal(host.dispatchParent(PARENT_REORDER, { Name: "children.reorder", Arg: "b,a" }).accepted, true);
  const reordered = host.mountedHandles();
  const movedA = reordered.children.find((item) => item.key === "a");
  assert.equal(movedA.root, originalA.root, "reorder must retain the child root element");
  assert.equal(host.snapshot().children.find((item) => item.key === "a").domIdentity.root,
    host.trace().initial.children.find((item) => item.key === "a").domIdentity.root);

  const retainedA = movedA.renderer.callbacks;
  assert.equal(host.dispatchParent(PARENT_REMOVE_A, { Name: "child.remove", Arg: "a" }).accepted, true);
  const beforeStale = structuredClone(host.trace().callCounts);
  assert.equal(retainedA.dispatch(CHILD_ADD, { Name: "add", Arg: "" }).stale, true);
  assert.equal(retainedA.publish({ Count: 100, Revision: 1 }).stale, true);
  assert.deepEqual(host.trace().callCounts, beforeStale, "removed callbacks and publications must not call Go or publish");

  assert.equal(host.dispatchParent(PARENT_MOUNT_A, { Name: "child.add", Arg: "a" }).accepted, true);
  assert.equal(host.snapshot().children.find((item) => item.key === "a").generation, 2);
  assert.equal(host.snapshot().children.find((item) => item.key === "a").childState.count, 0, "remount must initialize only the new child state");
  assert.notEqual(host.mountedHandles().children.find((item) => item.key === "a").root, originalA.root);
  assert.equal(host.mountedHandles().children.find((item) => item.key === "b").renderer, initial.children.find((item) => item.key === "b").renderer);
  const beforeRemountStale = structuredClone(host.trace().callCounts);
  assert.equal(originalACallbacks.dispatch(CHILD_ADD, { Name: "add", Arg: "" }).stale, true);
  assert.equal(originalACallbacks.publish({ Count: 100, Revision: 1 }).stale, true);
  assert.deepEqual(host.trace().callCounts, beforeRemountStale, "old generations must be fenced after remount");
  assert.equal(host.dispatchChild("a", CHILD_ADD, { Name: "add", Arg: "" }).accepted, true);
  assert.equal(host.snapshot().children.find((item) => item.key === "a").childState.count, 1);
  assert.equal(host.snapshot().children.find((item) => item.key === "b").childState.count, 0);

  const preSwap = host.snapshot();
  const oldRendererCallbacks = host.mountedHandles().children.find((item) => item.key === "a").renderer.callbacks;
  host.replaceBackend(backend === "dom" ? "react" : "dom");
  assert.deepEqual(host.snapshot().children.map((item) => item.childState), preSwap.children.map((item) => item.childState));
  const beforeSwapStale = structuredClone(host.trace().callCounts);
  assert.equal(oldRendererCallbacks.dispatch(CHILD_ADD, { Name: "add", Arg: "" }).stale, true);
  assert.equal(oldRendererCallbacks.publish({ Count: 100, Revision: 1 }).stale, true);
  assert.deepEqual(host.trace().callCounts, beforeSwapStale, "old renderer epochs must be fenced independently of key generation");
  assert.equal(host.trace().events.at(-1).kind, "stale-publication");
  host.unmount();
  assert.deepEqual(host.trace().mounted, []);
  }
});

test("validates helper bytes and source identity before renderer factories or Go roles", validatesHelperAdmission);
