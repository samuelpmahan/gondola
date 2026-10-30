import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireFromInteraction = createRequire(resolve(process.cwd(), "interaction/package.json"));
const esbuild = requireFromInteraction("esbuild");
const { chromium } = requireFromInteraction("playwright");

function attr(Name, Value = "", Flag = false) {
  return { Name, Value, Flag, Style: null };
}

function text(Text) {
  return { Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text };
}

function element(Tag, Key, Attrs = null, On = null, Kids = null) {
  return { Kind: 1, Tag, Key, Attrs, On, Kids, Text: "" };
}

function twoRowSnapshot() {
  const rows = [
    { id: 1, draft: "one", disabled: false },
    { id: 2, draft: "two", disabled: false },
  ];
  return {
    state: { rows: rows.map(({ id, draft }) => ({ id, draft })) },
    tree: element("div", "collection", [attr("class", "collection")], null, [
      element("div", "rows", [attr("class", "rows")], null,
        rows.map(({ id, draft, disabled }) => element("div", `row-${id}`, [attr("class", "row")], null, [
          element("input", `row-${id}-input`, [
            attr("type", "text"), attr("value", draft), attr("aria-label", `Row ${id}`),
            ...(disabled ? [attr("disabled", "", true)] : []),
          ]),
          element("p", `row-${id}-status`, null, null, [text(`Status ${id}`)]),
        ])),
      ),
    ]),
    bindings: rows.map(({ id }, index) => ({
      Path: `0/${index}/0`, Event: "input", Message: `edit/${id}`, Source: "target.value",
    })),
    messages: [],
  };
}

test("keyed React keeps moved input identity, updates event paths, and restores logical selection", {
  timeout: 60_000,
}, async () => {
  const temp = await mkdtemp(join(tmpdir(), "gobi-keyed-react-"));
  const bundlePath = join(temp, "react.bundle.mjs");
  const sourcePath = fileURLToPath(new URL("./react.mjs", import.meta.url));
  await esbuild.build({ entryPoints: [sourcePath], bundle: true, format: "esm", platform: "browser", outfile: bundlePath });
  const bundle = await readFile(bundlePath);
  const { mountKeyedReact } = await import(`${new URL(`file://${bundlePath}`).href}?t=${Date.now()}`);

  const invalidRoot = {
    nodeType: 1,
    ownerDocument: {},
    innerHTML: "existing markup",
    contains: () => false,
  };
  const malformed = twoRowSnapshot();
  malformed.tree.Kids[0].Kids[1].Key = "row-1-input";
  assert.throws(() => mountKeyedReact(invalidRoot, { init: () => malformed, dispatch() {} }), /duplicate element key/);
  assert.equal(invalidRoot.innerHTML, "existing markup", "invalid keys fail before React claims the root");

  const html = `<!doctype html><html><body><div id="root"></div>
<script type="module">
import { mountKeyedReact } from "/react.bundle.mjs";
const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, Attrs = null, On = null, Kids = null) => ({ Kind: 1, Tag, Key, Attrs, On, Kids, Text: "" });
const state = { rows: [{ id: 1, draft: "one" }, { id: 2, draft: "two" }] };
const messages = [];
const calls = [];
function snapshot() {
  const bindings = [];
  const rows = state.rows.map((row, index) => {
    bindings.push({ Path: '0/' + index + '/0', Event: 'input', Message: 'edit/' + row.id, Source: 'target.value' });
    return element('div', 'row-' + row.id, [attr('class', 'row')], null, [
      element('input', 'row-' + row.id + '-input', [attr('type', 'text'), attr('value', row.draft), attr('aria-label', 'Row ' + row.id)]),
      element('p', 'row-' + row.id + '-status', null, null, [text('Status ' + row.id)]),
    ]);
  });
  return { state: { rows: state.rows.map(({ id, draft }) => ({ id, draft })) },
    tree: element('div', 'collection', [attr('class', 'collection')], null, [
      element('div', 'rows', [attr('class', 'rows')], null, rows),
    ]), bindings, messages: messages.map((message) => ({ ...message })) };
}
const runtime = {
  init() { return snapshot(); },
  dispatch(step) {
    calls.push({ ...step });
    const expected = ['Event', 'Key', 'Path', 'Value'];
    if (Object.keys(step).sort().join('|') !== expected.join('|')) throw new Error('dispatch shape changed');
    const row = state.rows.find(({ id }) => step.Key === 'row-' + id + '-input');
    if (!row || step.Event !== 'input') throw new Error('unknown keyed input');
    const index = state.rows.indexOf(row);
    if (step.Path !== '0/' + index + '/0') throw new Error('stale path/key pair');
    row.draft = step.Value;
    messages.push({ Name: 'edit/' + row.id, Arg: step.Value });
    return snapshot();
  },
};
try {
  const root = document.querySelector('#root');
  window.__runtime = runtime;
  window.__state = state;
  window.__calls = calls;
  window.__mounted = mountKeyedReact(root, runtime);
  window.__oldRow2 = root.querySelector('[aria-label="Row 2"]');
  window.__oldRow2.focus();
  window.__oldRow2.setSelectionRange(1, 2, 'backward');
  window.__savedFocus = window.__mounted.focusState();

  window.__mounted.unmount();
  root.replaceChildren();
  window.__mounted = mountKeyedReact(root, runtime);
  window.__mounted.restoreFocus(window.__savedFocus);
  window.__afterSwapRow2 = root.querySelector('[aria-label="Row 2"]');
  window.__sameAcrossSwap = window.__oldRow2 === window.__afterSwapRow2;

  state.rows.reverse();
  window.__mounted.update(snapshot());
  window.__afterMoveRow2 = root.querySelector('[aria-label="Row 2"]');
  window.__focusAfterMove = window.__mounted.focusState();
  window.__noKeyAttribute = root.querySelectorAll('[data-key], [key]').length === 0;

  window.__afterMoveRow2.value = 'two updated';
  window.__afterMoveRow2.setSelectionRange(3, 3, 'forward');
  window.__afterMoveRow2.dispatchEvent(new Event('input', { bubbles: true }));
  window.__dispatchAfterMove = calls.at(-1);
  window.__sameAfterUpdate = window.__afterMoveRow2 === root.querySelector('[aria-label="Row 2"]');

  const focusedInput = document.activeElement;
  state.rows = state.rows.filter(({ id }) => id !== 2);
  window.__mounted.update(snapshot());
  window.__focusAfterRemove = window.__mounted.focusState();
  window.__focusDidNotJump = document.activeElement !== root.querySelector('[aria-label="Row 1"]');
  const callsBeforeDetached = calls.length;
  window.__afterMoveRow2.value = 'detached';
  window.__afterMoveRow2.dispatchEvent(new Event('input', { bubbles: true }));
  window.__detachedSuppressed = calls.length === callsBeforeDetached;
  window.__focusWasInputBeforeRemove = focusedInput === window.__afterMoveRow2;
} catch (error) {
  window.__mountError = String(error && error.stack || error);
}
</script></body></html>`;

  const server = createServer((request, response) => {
    if (request.url === "/react.bundle.mjs") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(bundle);
    } else {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(html);
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    const page = await browser.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__mounted || window.__mountError, null, { timeout: 30_000 });
    assert.equal(await page.evaluate(() => window.__mountError ?? null), null);

    const observed = await page.evaluate(() => ({
      sameAcrossSwap: window.__sameAcrossSwap,
      sameAfterUpdate: window.__sameAfterUpdate,
      oldDetached: !document.body.contains(window.__oldRow2),
      movedFocus: window.__focusAfterMove,
      focusAfterRemove: window.__focusAfterRemove,
      focusDidNotJump: window.__focusDidNotJump,
      detachedSuppressed: window.__detachedSuppressed,
      noKeyAttribute: window.__noKeyAttribute,
      dispatch: window.__dispatchAfterMove,
    }));
    assert.equal(observed.sameAcrossSwap, false, "backend replacement creates new DOM nodes");
    assert.equal(observed.sameAfterUpdate, true, "same-backend updates retain the keyed input object");
    assert.deepEqual(observed.movedFocus, {
      key: "row-2-input", selectionStart: 1, selectionEnd: 2, selectionDirection: "backward",
    });
    assert.equal(observed.focusAfterRemove, null, "removing the focused row clears logical input focus");
    assert.equal(observed.focusDidNotJump, true, "removing a focused row does not focus its neighbor");
    assert.equal(observed.detachedSuppressed, true, "detached input handlers cannot call the runtime");
    assert.equal(observed.noKeyAttribute, true, "React keys are not emitted as DOM attributes");
    assert.deepEqual(observed.dispatch, {
      Path: "0/0/0", Event: "input", Value: "two updated", Key: "row-2-input",
    }, "a moved row dispatches its current child path and stable key");
    assert.deepEqual(browserErrors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(temp, { recursive: true, force: true });
  }
});

test("native React commit failure fences the host before queued effects can start", {
  timeout: 60_000,
}, async () => {
  const temp = await mkdtemp(join(tmpdir(), "gobi-keyed-react-failure-"));
  const reactBundlePath = join(temp, "react.bundle.mjs");
  const hostBundlePath = join(temp, "host.bundle.mjs");
  const reactSourcePath = fileURLToPath(new URL("./react.mjs", import.meta.url));
  const hostSourcePath = fileURLToPath(new URL("./host.mjs", import.meta.url));
  await Promise.all([
    esbuild.build({ entryPoints: [reactSourcePath], bundle: true, format: "esm", platform: "browser", outfile: reactBundlePath }),
    esbuild.build({ entryPoints: [hostSourcePath], bundle: true, format: "esm", platform: "browser", outfile: hostBundlePath }),
  ]);
  const reactBundle = await readFile(reactBundlePath);
  const hostBundle = await readFile(hostBundlePath);
  const html = `<!doctype html><html><body><div id="root"></div>
<script type="module">
import { mountKeyedReact } from "/react.bundle.mjs";
import { createKeyedHost } from "/host.bundle.mjs";
const attr = (Name, Value = '', Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: '', Key: '', Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, Attrs = null, On = null, Kids = null) => ({ Kind: 1, Tag, Key, Attrs, On, Kids, Text: '' });
let draft = 'before';
let status = 'idle';
let blocked = false;
let outboxAvailable = true;
let effectsCalls = 0;
let transportStarts = 0;
let dispatchCalls = 0;
let host;
function snapshot() {
  return { state: { value: draft, status, blocked }, tree: element('div', 'root', [attr('class', 'root')], null, [
    element('input', 'draft-input', [attr('type', 'text'), attr('value', draft), attr('aria-label', 'Draft'),
      ...(blocked ? [attr('disabled', '', true)] : [])]),
    element('p', 'status', [attr('class', 'status')], null, [text(status)]),
  ]), bindings: [{ Path: '0', Event: 'input', Message: 'edit', Source: 'target.value' }], messages: [] };
}
const runtime = {
  init() { return snapshot(); },
  dispatch(step) {
    dispatchCalls += 1;
    if (step.Path !== '0' || step.Key !== 'draft-input' || step.Event !== 'input') throw new Error('unexpected event');
    draft = step.Value;
    status = 'committed';
    blocked = true;
    return snapshot();
  },
  complete() { throw new Error('unused'); },
  effects() {
    effectsCalls += 1;
    if (!outboxAvailable) return [];
    outboxAvailable = false;
    return [{ Kind: 'start', ID: 1, Value: 'must not start after failed paint' }];
  },
  audit() { return []; },
};
try {
  const root = document.querySelector('#root');
  host = createKeyedHost(root, runtime, { react: mountKeyedReact }, {
    start() { transportStarts += 1; }, cancel() {},
  }, 'react');
  const input = root.querySelector('input');
  Object.defineProperty(input, 'disabled', {
    configurable: true,
    get() { return false; },
    set() { throw new Error('synthetic React property commit failure'); },
  });
  const nativeSetAttribute = input.setAttribute.bind(input);
  input.setAttribute = (name, value) => {
    if (name === 'disabled') throw new Error('synthetic React attribute commit failure');
    return nativeSetAttribute(name, value);
  };
  input.value = 'committed draft';
  input.setSelectionRange(4, 8, 'forward');
  input.dispatchEvent(new Event('input', { bubbles: true }));

  let settledErrors = [];
  try { await host.settled(); }
  catch (error) {
    settledErrors = (error.errors ?? [error]).map((item) => ({
      message: item.message,
      cause: item.cause?.message ?? '',
    }));
  }
  let hostFenced = false;
  try { host.snapshot(); } catch { hostFenced = true; }
  window.__result = {
    dispatchCalls,
    committedDraft: draft,
    effectsCalls,
    transportStarts,
    hostFenced,
    settledErrors,
    rootCleared: root.childNodes.length === 0,
  };
  host.unmount();
} catch (error) {
  window.__probeError = String(error && error.stack || error);
  try { host?.unmount(); } catch {}
}
</script></body></html>`;

  const server = createServer((request, response) => {
    if (request.url === "/react.bundle.mjs") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(reactBundle);
    } else if (request.url === "/host.bundle.mjs") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(hostBundle);
    } else {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(html);
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__result || window.__probeError, null, { timeout: 30_000 });
    const probeError = await page.evaluate(() => window.__probeError ?? null);
    assert.equal(probeError, null, probeError ?? "native failure probe did not finish");
    const result = await page.evaluate(() => window.__result);
    assert.equal(result.dispatchCalls, 1);
    assert.equal(result.committedDraft, "committed draft", "Go's successful dispatch is not rolled back");
    assert.equal(result.hostFenced, true, JSON.stringify(result));
    assert.ok(result.settledErrors.some(({ message, cause }) =>
      message.includes("failed while handling an event") && cause.includes("synthetic React")), JSON.stringify(result));
    assert.equal(result.effectsCalls, 0, "host must skip the effect drain queued by the successful dispatch");
    assert.equal(result.transportStarts, 0);
    assert.equal(result.rootCleared, true, "host cleanup unmounts the failed React root");
    assert.deepEqual(pageErrors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(temp, { recursive: true, force: true });
  }
});
