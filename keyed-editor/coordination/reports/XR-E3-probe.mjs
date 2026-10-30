// Negative host probe for the React native-event failure path. Set
// GONDOLA_REPO_ROOT to any checkout containing keyed-editor/host.mjs.
// A React event handler catches renderer.update() errors locally; this probe
// models that catch while using the real host facade and pump.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const repo = process.env.GONDOLA_REPO_ROOT;
assert.ok(repo, "set GONDOLA_REPO_ROOT to the checkout root");
const { createKeyedHost } = await import(pathToFileURL(resolve(repo, "keyed-editor/host.mjs")));
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, Kids = null) => ({ Kind: 1, Tag, Key, Attrs: null, On: null, Kids, Text: "" });

let version = 0;
let effectDrained = false;
let effectsCalls = 0;
let started = 0;
let settledError = null;
const runtime = {
  init() {
    return { state: { version }, tree: element("div", "root", [text(String(version))]), bindings: [], messages: [] };
  },
  dispatch() {
    version += 1;
    return { state: { version }, tree: element("div", "root", [text(String(version))]), bindings: [], messages: [] };
  },
  complete() { throw new Error("unused"); },
  effects() {
    effectsCalls += 1;
    if (effectDrained) return [];
    effectDrained = true;
    return [{ Kind: "start", ID: 1, Value: "save" }];
  },
  audit() { return []; },
};

const root = { replaceChildren() {} };
let facade;
let api;
let rendererUnmounts = 0;
let rendererError = null;
let rendererActive = true;
const mount = (_root, nextFacade) => {
  facade = nextFacade;
  facade.init();
  api = {
    update() { throw new Error("synthetic DOM commit failure"); },
    snapshot() { return null; },
    domSnapshot() { return { html: "", disabled: [] }; },
    focusState() { return null; },
    restoreFocus() {},
    click() {},
    // Mirrors React's native event catch in react.mjs, including reporting
    // its local update failure to the host facade.
    simulateReactNativeEvent() {
      try {
        api.update(facade.dispatch({ Path: "", Event: "click", Value: "", Key: "root" }));
      } catch (error) {
        rendererError = error;
        rendererActive = false;
        facade.rendererFailed(error);
      }
    },
    unmount() { rendererUnmounts += 1; },
  };
  return api;
};

const host = createKeyedHost(root, runtime, { react: mount }, { start() { started += 1; }, cancel() {} }, "react");
api.simulateReactNativeEvent();
try { await host.settled(); } catch (error) { settledError = error; }
let hostUsable = true;
let hostSnapshotBlocked = false;
try { host.backendName(); } catch { hostUsable = false; }
try { host.snapshot(); } catch { hostSnapshotBlocked = true; }
const result = {
  rendererError: rendererError?.message,
  rendererFenced: rendererActive === false,
  hostUsable,
  hostSnapshotBlocked,
  committedRuntimeVersion: version,
  settledError: settledError?.message,
  effectsCalls,
  effectsStartedAfterPaintFailure: started,
  hostUnmountedRenderer: rendererUnmounts > 0,
};

assert.equal(result.rendererFenced, true);
assert.equal(result.hostUsable, false);
assert.equal(result.hostSnapshotBlocked, true);
assert.equal(result.committedRuntimeVersion, 1);
assert.match(result.settledError, /keyed host queued work failed/);
assert.equal(result.effectsCalls, 0);
assert.equal(result.effectsStartedAfterPaintFailure, 0);
assert.equal(result.hostUnmountedRenderer, true);
console.log(JSON.stringify(result, null, 2));
host.unmount();
