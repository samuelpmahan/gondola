import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

let referenceModule = {};
try { referenceModule = await import("./reference.mjs"); }
catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

const createSessionTreeReference = referenceModule.createSessionTreeReference;
const mountTreeReferenceCollection = referenceModule.mountTreeReferenceCollection;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const requireFromInteraction = createRequire(resolve(ROOT, "interaction/package.json"));

function send(manager, id, Path, Event, Value, Key) {
  return manager.dispatch(id, { Path, Event, Value, Key });
}

function pendingSave(manager, id, value, rowID = 1, rowIndex = 0) {
  while (manager.snapshot(id).state.Rows.length < rowID) {
    send(manager, id, "0", "click", "", "add");
  }
  send(manager, id, `2/${rowIndex}/0`, "input", value, `row-${rowID}-input`);
  send(manager, id, `2/${rowIndex}/5`, "click", "", `row-${rowID}-save`);
}

test("session-tree reference exports a Go-manager-shaped independent model", () => {
  assert.equal(typeof createSessionTreeReference, "function",
    "session-tree/reference.mjs must export createSessionTreeReference()");
  const manager = createSessionTreeReference();
  assert.deepEqual(manager.tree(), []);
  assert.deepEqual(manager.list(), []);

  const root = manager.create();
  const child = manager.createChild(root);
  const sibling = manager.create();
  const grandchild = manager.createChild(child);
  assert.deepEqual(manager.tree(), [
    { SessionID: root, ParentID: 0, Depth: 1 },
    { SessionID: child, ParentID: root, Depth: 2 },
    { SessionID: sibling, ParentID: 0, Depth: 1 },
    { SessionID: grandchild, ParentID: child, Depth: 3 },
  ]);
  assert.deepEqual(manager.list(), [root, child, sibling, grandchild]);

  const returnedTree = manager.tree();
  returnedTree[0].ParentID = 77;
  returnedTree.pop();
  assert.deepEqual(manager.tree()[0], { SessionID: root, ParentID: 0, Depth: 1 },
    "tree records and backing arrays are defensive copies");

  pendingSave(manager, child, "child-only draft");
  const detached = manager.snapshot(child);
  detached.state.Rows[0].Draft = "mutated by caller";
  assert.equal(manager.snapshot(child).state.Rows[0].Draft, "child-only draft");
  assert.deepEqual(manager.snapshot(sibling).state.Rows, [], "sibling sessions own independent models");
});

test("child allocation rejects zero, unknown, dead, and over-depth parents without consuming IDs", () => {
  assert.equal(typeof createSessionTreeReference, "function",
    "session-tree/reference.mjs must export createSessionTreeReference()");
  const manager = createSessionTreeReference();
  assert.throws(() => manager.createChild(0), /parent|session|unknown/i);
  assert.throws(() => manager.createChild(99), /parent|session|unknown/i);

  const root = manager.create();
  let deepest = root;
  for (let depth = 2; depth <= 32; depth++) deepest = manager.createChild(deepest);
  assert.equal(manager.tree().at(-1).Depth, 32);
  assert.throws(() => manager.createChild(deepest), /depth|maximum/i);

  const anotherRoot = manager.create();
  assert.equal(anotherRoot, deepest + 1, "failed allocations do not advance the session ID counter");
  const leaf = manager.createChild(anotherRoot);
  assert.deepEqual(manager.dispose(leaf), []);
  assert.throws(() => manager.createChild(leaf), /parent|session|unknown/i,
    "a disposed session cannot parent a new child");
});

test("leaf dispose rejects a live child before draining queued effects or changing state", () => {
  assert.equal(typeof createSessionTreeReference, "function",
    "session-tree/reference.mjs must export createSessionTreeReference()");
  const manager = createSessionTreeReference();
  const root = manager.create();
  const child = manager.createChild(root);
  pendingSave(manager, root, "root pending");
  pendingSave(manager, child, "child pending");
  const before = manager.snapshot(root);
  assert.throws(() => manager.dispose(root), /child|leaf/i);
  assert.deepEqual(manager.snapshot(root), before);
  assert.deepEqual(manager.effects(root), [{ Kind: "start", ID: 1, Value: "root pending" }],
    "rejected leaf disposal must leave queued starts available");
  assert.equal(manager.snapshot(child).state.Rows[0].Draft, "child pending");
});

test("disposeTree emits exact postorder cancellation bundles and preserves unrelated branches", () => {
  assert.equal(typeof createSessionTreeReference, "function",
    "session-tree/reference.mjs must export createSessionTreeReference()");
  const manager = createSessionTreeReference();
  const root = manager.create();
  const unrelated = manager.create();
  const childA = manager.createChild(root);
  const childB = manager.createChild(root);
  const grandchildA = manager.createChild(childA);
  const grandchildB = manager.createChild(childA);

  pendingSave(manager, root, "root one", 1, 0);
  pendingSave(manager, root, "root two", 2, 1);
  pendingSave(manager, childA, "child A one", 1, 0);
  pendingSave(manager, childA, "child A two", 2, 1);
  manager.effects(childA);
  send(manager, childA, "2/0/8", "click", "", "row-1-cancel");
  pendingSave(manager, childB, "child B");
  pendingSave(manager, grandchildA, "grandchild A");
  pendingSave(manager, unrelated, "unrelated root");

  const bundles = manager.disposeTree(root);
  assert.deepEqual(bundles, [
    { SessionID: grandchildA, Commands: [{ Kind: "cancel", ID: 1, Value: "" }] },
    { SessionID: grandchildB, Commands: [] },
    { SessionID: childA, Commands: [{ Kind: "cancel", ID: 1, Value: "" }, { Kind: "cancel", ID: 2, Value: "" }] },
    { SessionID: childB, Commands: [{ Kind: "cancel", ID: 1, Value: "" }] },
    { SessionID: root, Commands: [{ Kind: "cancel", ID: 1, Value: "" }, { Kind: "cancel", ID: 2, Value: "" }] },
  ]);
  assert.equal(Object.hasOwn(bundles[0].Commands[0], "Value"), true,
    "empty cancellation Value is preserved exactly as it is on the Go JSON wire");

  bundles[0].SessionID = 99;
  bundles[0].Commands[0].ID = 99;
  assert.deepEqual(manager.tree(), [{ SessionID: unrelated, ParentID: 0, Depth: 1 }]);
  assert.deepEqual(manager.list(), [unrelated]);
  assert.equal(manager.snapshot(unrelated).state.Rows[0].Draft, "unrelated root");
  for (const id of [root, childA, childB, grandchildA, grandchildB]) {
    assert.throws(() => manager.snapshot(id), /unknown|disposed|session/i);
    assert.throws(() => manager.dispatch(id, { Path: "0", Event: "click", Value: "", Key: "add" }), /unknown|disposed|session/i);
    assert.throws(() => manager.complete(id, { ID: 1, Value: "late", Error: "" }), /unknown|disposed|session/i);
  }
});

test("pinned React reference uses independent snapshots and preserves keyed input focus", {
  timeout: 45_000,
}, async () => {
  assert.equal(typeof mountTreeReferenceCollection, "function",
    "session-tree/reference.mjs must export mountTreeReferenceCollection()");
  const { build } = requireFromInteraction("esbuild");
  const { chromium } = requireFromInteraction("playwright");
  const built = await build({
    entryPoints: [resolve(HERE, "reference.mjs")],
    absWorkingDir: ROOT,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });
  const bundle = built.outputFiles[0].text;
  const html = `<!doctype html><html><body><main id="view"></main>
<script type="module">
import { createSessionTreeReference, mountTreeReferenceCollection,
  referenceReactDOMVersion, referenceReactVersion } from "/reference.bundle.mjs";
const manager = createSessionTreeReference();
const id = manager.create();
const runtime = {
  init: () => manager.snapshot(id),
  dispatch: (step) => manager.dispatch(id, step),
  complete: (reply) => manager.complete(id, reply),
  effects: () => manager.effects(id),
  audit: () => manager.audit(id),
};
window.__rendererVersions = { react: referenceReactVersion, reactDOM: referenceReactDOMVersion };
window.__manager = manager;
window.__runtime = runtime;
window.__reference = mountTreeReferenceCollection(document.querySelector("#view"), runtime, runtime.init());
window.__ready = true;
</script></body></html>`;
  const server = createServer((request, response) => {
    if (request.url === "/reference.bundle.mjs") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error?.stack ?? error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__ready === true);
    assert.deepEqual(await page.evaluate(() => window.__rendererVersions), { react: "19.3.1", reactDOM: "19.3.1" });
    assert.deepEqual(await page.evaluate(() => window.__reference.snapshot().state), {
      Rows: [], NextID: 0, NextRequestID: 0,
    });
    assert.deepEqual(await page.evaluate(() => window.__reference.domSnapshot().disabled), ["1"]);

    await page.evaluate(() => window.__reference.click("0"));
    const input = page.locator('input[aria-label="Row 1"]');
    await input.evaluate((element) => {
      element.value = "logical focus";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.focus();
      element.setSelectionRange(2, 7, "forward");
      window.__savedTreeReferenceInput = element;
    });
    await page.evaluate(() => window.__reference.update(window.__manager.snapshot(1)));
    assert.deepEqual(await page.evaluate(() => ({
      draft: window.__reference.snapshot().state.Rows[0].Draft,
      sameInput: window.__savedTreeReferenceInput === window.__reference.inputForKey("row-1-input"),
      focus: window.__reference.focusState(),
      hasDataKey: window.__reference.domSnapshot().html.includes("data-key"),
    })), {
      draft: "logical focus",
      sameInput: true,
      focus: { Key: "row-1-input", Path: "2/0/0", SelectionStart: 2, SelectionEnd: 7, SelectionDirection: "forward" },
      hasDataKey: false,
    });

    await page.evaluate(() => window.__reference.click("2/0/5"));
    assert.deepEqual(await page.evaluate(() => window.__manager.effects(1)), [
      { Kind: "start", ID: 1, Value: "logical focus" },
    ]);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
