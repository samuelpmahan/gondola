import test from "node:test";
import assert from "node:assert/strict";

const registryModule = await import("./registry.mjs").catch(() => null);
const keyedHostModule = await import("../keyed-editor/host.mjs");

const manifest = {
  protocol: "gobi.keyed-renderer",
  version: 1,
  capabilities: ["keyed-update", "controlled-input", "disabled-controls", "logical-focus", "failure-notification"],
  methods: ["update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount"],
  tags: ["div", "p", "input", "button"],
  attributes: ["class", "type", "value", "aria-label", "disabled"],
  events: ["click", "input"],
  nodeKinds: [1, 2],
  keyPattern: "^[A-Za-z][A-Za-z0-9-]{0,63}$",
  maxDepth: 64,
  maxNodes: 4096,
  messageBlankRunes: "\t\n\v\f\r \u0085\u00a0\u1680" +
    "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a" +
    "\u2028\u2029\u202f\u205f\u3000\ufeff",
};

function snapshot(tree = { Kind: 1, Tag: "div", Key: "root", Attrs: null, On: null, Kids: null, Text: "" }) {
  return { state: {}, tree, bindings: [], messages: [] };
}

function runtime(initial = snapshot()) {
  const calls = { init: 0, dispatch: 0, complete: 0, effects: 0, audit: 0 };
  return {
    calls,
    init() { calls.init += 1; return initial; },
    dispatch() { calls.dispatch += 1; return initial; },
    complete() { calls.complete += 1; return initial; },
    effects() { calls.effects += 1; return []; },
    audit() { calls.audit += 1; return []; },
  };
}

function root() { return { replaceChildren() {} }; }
function transport(calls) {
  return {
    start() { calls.starts += 1; },
    cancel() { calls.cancels += 1; },
  };
}
function renderer() {
  const current = snapshot();
  return {
    update() {}, snapshot() { return current; }, domSnapshot() { return { html: "<div></div>", disabled: [] }; },
    click() {}, focusState() { return null; }, restoreFocus() {}, unmount() {},
  };
}

test("metadata negotiation rejects protocol, version, capability, and method defects before runtime or transport activity", () => {
  assert.equal(typeof registryModule?.descriptor, "function", "registry must expose a descriptor factory");
  assert.equal(typeof registryModule?.createNegotiatedHost, "function", "registry must expose negotiated host construction");
  assert.equal(typeof registryModule?.validateNegotiation, "function", "registry must expose side-effect-free admission");
  const mountCalls = { count: 0 };
  const mount = () => { mountCalls.count += 1; return renderer(); };
  const malformed = [
    (item) => { item.protocol = "other.protocol"; },
    (item) => { item.version = 2; },
    (item) => { item.capabilities = item.capabilities.filter((value) => value !== "logical-focus"); },
    (item) => { item.methods = item.methods.filter((value) => value !== "snapshot"); },
  ];

  for (const alter of malformed) {
    const candidate = registryModule.descriptor("dom", mount, manifest);
    alter(candidate);
    const go = runtime();
    const transportCalls = { starts: 0, cancels: 0 };
    assert.throws(() => registryModule.createNegotiatedHost(
      root(), go, [candidate], transport(transportCalls), "dom", manifest,
    ));
    assert.equal(go.calls.init, 0, "descriptor rejection precedes application runtime init");
    assert.equal(mountCalls.count, 0, "descriptor rejection precedes renderer mount");
    assert.deepEqual(transportCalls, { starts: 0, cancels: 0 }, "descriptor rejection precedes transport activity");
  }
});

test("unsupported generated manifest protocol or version is rejected before application initialization", () => {
  assert.equal(typeof registryModule?.createNegotiatedHost, "function", "registry must expose negotiated host construction");
  for (const unsupported of [
    { ...manifest, protocol: "other.protocol" },
    { ...manifest, version: 2 },
  ]) {
    const go = runtime();
    const candidate = registryModule.descriptor("dom", () => renderer(), manifest);
    assert.throws(() => registryModule.createNegotiatedHost(
      root(), go, [candidate], transport({ starts: 0, cancels: 0 }), "dom", unsupported,
    ));
    assert.equal(go.calls.init, 0);
  }
});

test("manifest snapshot limits are applied before any candidate renderer is mounted", () => {
  assert.equal(typeof registryModule?.createNegotiatedHost, "function", "registry must expose negotiated host construction");
  const fragment = {
    Kind: 3, Tag: "", Key: "", Attrs: null, On: null,
    Kids: [{ Kind: 1, Tag: "div", Key: "root", Attrs: null, On: null, Kids: null, Text: "" }], Text: "",
  };
  const go = runtime(snapshot(fragment));
  let mounts = 0;
  const candidate = registryModule.descriptor("dom", () => { mounts += 1; return renderer(); }, manifest);
  assert.throws(() => registryModule.createNegotiatedHost(
    root(), go, [candidate], transport({ starts: 0, cancels: 0 }), "dom", manifest,
  ), /kind/i);
  assert.equal(go.calls.init, 1, "snapshot validation follows successful metadata negotiation");
  assert.equal(mounts, 0, "invalid snapshot is rejected before DOM or renderer mutation");
});

test("a descriptor cannot bypass mounted renderer API shape checks", () => {
  assert.equal(typeof registryModule?.createNegotiatedHost, "function", "registry must expose negotiated host construction");
  const go = runtime();
  let mounts = 0;
  const candidate = registryModule.descriptor("dom", () => {
    mounts += 1;
    return { update() {}, snapshot() { return snapshot(); } };
  }, manifest);
  assert.throws(() => registryModule.createNegotiatedHost(
    root(), go, [candidate], transport({ starts: 0, cancels: 0 }), "dom", manifest,
  ), /API|domSnapshot|click/i);
  assert.equal(go.calls.init, 1, "runtime starts only after declared metadata passes");
  assert.equal(mounts, 1, "the actual implementation is checked after mount");
});

test("negotiated hosts preserve the keyed host's singleton runtime lease", () => {
  assert.equal(typeof registryModule?.createNegotiatedHost, "function", "registry must expose negotiated host construction");
  const go = runtime();
  let mounts = 0;
  const candidate = registryModule.descriptor("dom", () => { mounts += 1; return renderer(); }, manifest);
  const transportCalls = { starts: 0, cancels: 0 };
  const first = registryModule.createNegotiatedHost(
    root(), go, [candidate], transport(transportCalls), "dom", manifest,
  );
  assert.throws(() => registryModule.createNegotiatedHost(
    root(), go, [candidate], transport(transportCalls), "dom", manifest,
  ), /already has a live/i);
  assert.equal(go.calls.init, 1, "the second host is rejected before a second runtime init");
  assert.equal(mounts, 1, "the second host is rejected before a second renderer mount");
  first.unmount();

  const second = registryModule.createNegotiatedHost(
    root(), go, [candidate], transport(transportCalls), "dom", manifest,
  );
  assert.equal(go.calls.init, 2, "the runtime can be reused after unmount releases its lease");
  second.unmount();
});

test("legacy and negotiated hosts share the original runtime lease in both creation orders", () => {
  assert.equal(typeof registryModule?.createNegotiatedHost, "function", "registry must expose negotiated host construction");
  const candidateMounts = { count: 0 };
  const candidate = registryModule.descriptor("dom", () => {
    candidateMounts.count += 1;
    return renderer();
  }, manifest);

  const legacyFirst = runtime();
  const legacy = keyedHostModule.createKeyedHost(root(), legacyFirst, { dom: () => renderer() },
    transport({ starts: 0, cancels: 0 }), "dom");
  assert.throws(() => registryModule.createNegotiatedHost(
    root(), legacyFirst, [candidate], transport({ starts: 0, cancels: 0 }), "dom", manifest,
  ), /already has a live keyed host/i);
  assert.equal(legacyFirst.calls.init, 1, "a rejected negotiated host cannot reset the live legacy runtime");
  assert.equal(candidateMounts.count, 0);
  legacy.unmount();

  const negotiatedFirst = runtime();
  const negotiated = registryModule.createNegotiatedHost(
    root(), negotiatedFirst, [candidate], transport({ starts: 0, cancels: 0 }), "dom", manifest,
  );
  assert.throws(() => keyedHostModule.createKeyedHost(
    root(), negotiatedFirst, { dom: () => renderer() }, transport({ starts: 0, cancels: 0 }), "dom",
  ), /already has a live keyed host/i);
  assert.equal(negotiatedFirst.calls.init, 1, "a rejected legacy host cannot reset the negotiated runtime");
  negotiated.unmount();
});
