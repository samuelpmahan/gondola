import assert from "node:assert/strict";
import { mountCompiledApp } from "../../../../../compiled-frontend/frontend/runtime/runtime.mjs";

function moduleFor(capabilities = ["view.node", "effect.request-reply"]) {
  let initCalls = 0;
  const compiled = {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      components: [{
        id: "probe", stateType: "probe.State", messageType: "probe.Message",
        init: "probe.Init", update: "probe.Update", view: "probe.View", capabilities,
      }],
      symbols: [{
        id: "probe.Update", signature: { results: ["probe.State", "[]gobi.Effect"] },
      }],
      types: [],
    },
    symbols: {
      "probe.Init"() { initCalls += 1; return { count: 0 }; },
      "probe.Update"(state) { return [state, []]; },
      "probe.View"() { return { text: "probe" }; },
    },
  };
  return { compiled, initCalls: () => initCalls };
}

function renderer(viewCapabilities = ["view.node"]) {
  return {
    viewCapabilities,
    commits: 0,
    update() { this.commits += 1; },
    viewRecord() { return { tree: {}, bindings: [] }; },
    domSnapshot() { return { normalization: "outerHTML-v1", html: "<div></div>", controls: [] }; },
    unmount() { this.unmounted = true; },
  };
}

function encoder() {
  return { gobiEncodeState(_state, typeId) { return { typeId, kind: "struct", fields: [] }; } };
}

const badProfiles = [
  ["sparse", new Array(1)],
  ["unknown", ["effect.unknown"]],
  ["duplicate", ["effect.request-reply", "effect.request-reply"]],
  ["extra own key", Object.assign(["effect.request-reply"], { extra: true })],
];
const hostResults = [];
for (const [name, profile] of badProfiles) {
  const app = moduleFor();
  assert.throws(() => mountCompiledApp({
    module: app.compiled, componentId: "probe", encoder: encoder(), renderer: renderer(),
    hostCapabilities: profile,
  }), TypeError, `host ${name}`);
  assert.equal(app.initCalls(), 0, `host ${name} rejected before Init`);
  hostResults.push({ name, rejectedBeforeInit: true });
}
{
  const app = moduleFor();
  let getterCalls = 0;
  const profile = ["effect.request-reply"];
  Object.defineProperty(profile, "0", { enumerable: true, get() { getterCalls += 1; return "effect.request-reply"; } });
  assert.throws(() => mountCompiledApp({
    module: app.compiled, componentId: "probe", encoder: encoder(), renderer: renderer(),
    hostCapabilities: profile,
  }), TypeError, "host accessor item");
  assert.equal(getterCalls, 0);
  assert.equal(app.initCalls(), 0);
  hostResults.push({ name: "accessor item", rejectedBeforeInit: true, getterCalls });
}

const viewBadProfiles = [
  ["sparse", new Array(1)],
  ["unknown", ["view.unknown"]],
  ["duplicate", ["view.node", "view.node"]],
  ["extra own key", Object.assign(["view.node"], { extra: true })],
];
const viewResults = [];
for (const [name, profile] of viewBadProfiles) {
  const app = moduleFor();
  const target = renderer();
  const candidate = renderer(profile);
  const runtime = mountCompiledApp({
    module: app.compiled, componentId: "probe", encoder: encoder(), renderer: target,
  });
  const before = runtime.trace();
  assert.throws(() => runtime.replaceRenderer(candidate), TypeError, `renderer ${name}`);
  assert.equal(target.unmounted, undefined, `renderer ${name} preserves old renderer`);
  assert.equal(candidate.commits, 0, `renderer ${name} never commits candidate`);
  assert.deepEqual(runtime.trace(), before, `renderer ${name} preserves trace`);
  assert.equal(target.callbacks, undefined);
  viewResults.push({ name, preservesOldRendererAndTrace: true });
}
{
  const app = moduleFor();
  const target = renderer();
  const runtime = mountCompiledApp({
    module: app.compiled, componentId: "probe", encoder: encoder(), renderer: target,
  });
  let getterCalls = 0;
  const candidate = renderer();
  Object.defineProperty(candidate, "viewCapabilities", {
    enumerable: true,
    get() { getterCalls += 1; return ["view.node"]; },
  });
  assert.throws(() => runtime.replaceRenderer(candidate), TypeError, "renderer profile accessor");
  assert.equal(getterCalls, 0);
  assert.equal(target.unmounted, undefined);
  assert.equal(candidate.commits, 0);
  viewResults.push({ name: "profile accessor", getterCalls, preservesOldRendererAndTrace: true });
}

console.log(JSON.stringify({ hostResults, viewResults }, null, 2));
