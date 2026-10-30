import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { validateSnapshot } from "../../protocol.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const gondolaRoot = resolve(scriptPath, "../../../../");
const requireFromInteraction = createRequire(join(gondolaRoot, "interaction/package.json"));
const { build } = requireFromInteraction("esbuild");
const { chromium } = requireFromInteraction("playwright");

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});

function makeSnapshot(rows, messages = []) {
  const bindings = [];
  const rowNodes = rows.map((row, index) => {
    bindings.push({ Path: `2/${index}/0`, Event: "input", Message: `edit/${row.id}`, Source: "target.value" });
    return element("div", `row-${row.id}`, {
      Attrs: [attr("class", "row")],
      Kids: [
        element("input", `row-${row.id}-input`, {
          Attrs: [
            attr("type", "text"), attr("value", row.draft), attr("aria-label", `Row ${row.id}`),
            ...(row.disabled ? [attr("disabled", "", true)] : []),
          ],
        }),
        element("p", `row-${row.id}-status`, { Kids: [text(`Status: ${row.status ?? "idle"}`)] }),
        element("button", `row-${row.id}-save`, {
          Attrs: [attr("class", "save"), ...(row.draft === "" ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "save", Arg: String(row.id) }],
          Kids: [text("Save")],
        }),
      ],
    });
  });
  return {
    state: { rows: rows.map((row) => ({ id: row.id, draft: row.draft, saved: row.saved ?? "" })) },
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

function protocolNegativeChecks() {
  const valid = makeSnapshot([
    { id: 1, draft: "alpha", saved: "" },
    { id: 2, draft: "bravo", saved: "" },
  ]);
  assert.equal(validateSnapshot(valid), valid);

  const duplicateKey = structuredClone(valid);
  duplicateKey.tree.Kids[2].Kids[1].Key = "row-1-input";
  assert.throws(() => validateSnapshot(duplicateKey), /duplicate element key/);

  const wrongTag = structuredClone(valid);
  wrongTag.tree.Kids[2].Kids[0].Kids[0].Tag = "script";
  wrongTag.tree.Kids[2].Kids[0].Kids[0].Attrs = null;
  assert.throws(() => validateSnapshot(wrongTag), /unsupported HTML element/);

  const forbiddenProperty = structuredClone(valid);
  forbiddenProperty.tree.Kids[2].Kids[0].Kids[0].Attrs.push(attr("onclick", "alert(1)"));
  assert.throws(() => validateSnapshot(forbiddenProperty), /unsupported attribute/);

  const wrongInputType = structuredClone(valid);
  wrongInputType.tree.Kids[2].Kids[0].Kids[0].Attrs[0].Value = "password";
  assert.throws(() => validateSnapshot(wrongInputType), /type="text"/);

  const wrongBinding = structuredClone(valid);
  wrongBinding.bindings[0].Path = "2/0/1";
  assert.throws(() => validateSnapshot(wrongBinding), /requires input/);
  return 6;
}

async function browserChecks() {
  const temp = await mkdtemp(join(tmpdir(), "gobi-xr-e2-"));
  const bundlePath = join(temp, "dom.bundle.mjs");
  const sourcePath = resolve(gondolaRoot, "keyed-editor/dom.mjs");
  await build({ entryPoints: [sourcePath], bundle: true, format: "esm", platform: "browser", outfile: bundlePath });
  const bundle = await readFile(bundlePath);
  const html = `<!doctype html><html><body><div id="root"></div><script type="module">
import { mountKeyedDOM } from "/dom.bundle.mjs";
const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, Attrs = null, On = null, Kids = null) => ({ Kind: 1, Tag, Key, Attrs, On, Kids, Text: "" });
const state = { rows: [
  { id: 1, draft: '', saved: '', disabled: true },
  { id: 2, draft: 'bravo', saved: '', disabled: false },
] };
const messages = [];
const steps = [];
function snapshot() {
  const bindings = [];
  const rowNodes = state.rows.map((row, index) => {
    bindings.push({ Path: '2/' + index + '/0', Event: 'input', Message: 'edit/' + row.id, Source: 'target.value' });
    return element('div', 'row-' + row.id, [attr('class', 'row')], null, [
      element('input', 'row-' + row.id + '-input', [
        attr('type', 'text'), attr('value', row.draft), attr('aria-label', 'Row ' + row.id),
        ...(row.disabled ? [attr('disabled', '', true)] : []),
      ]),
      element('p', 'row-' + row.id + '-status', null, null, [text('Status: ' + (row.status || 'idle'))]),
      element('button', 'row-' + row.id + '-save', [attr('class', 'save'), ...(row.draft === '' ? [attr('disabled', '', true)] : [])],
        [{ Event: 'click', Message: 'save', Arg: String(row.id) }], [text('Save')]),
    ]);
  });
  return { state: { rows: state.rows.map(({ id, draft, saved }) => ({ id, draft, saved })) },
    tree: element('div', 'collection', [attr('class', 'collection')], null, [
      element('button', 'add', [attr('class', 'add')], [{ Event: 'click', Message: 'add', Arg: '' }], [text('Add row')]),
      element('button', 'reset', [attr('class', 'reset'), ...(state.rows.length === 0 ? [attr('disabled', '', true)] : [])],
        [{ Event: 'click', Message: 'reset', Arg: '' }], [text('Reset')]),
      element('div', 'rows', [attr('class', 'rows')], null, rowNodes.length ? rowNodes : null),
    ]), bindings, messages: messages.map((message) => ({ ...message })) };
}
const runtime = {
  init() { return snapshot(); },
  dispatch(step) {
    steps.push({ ...step });
    const row = state.rows.find(({ id }) => step.Key === 'row-' + id + '-input');
    if (!row || step.Event !== 'input' || step.Path !== '2/' + state.rows.indexOf(row) + '/0') {
      throw new Error('stale path/key pair');
    }
    row.draft = step.Value;
    messages.push({ Name: 'edit/' + row.id, Arg: step.Value });
    return snapshot();
  },
};
try {
  const root = document.querySelector('#root');
  window.__state = state;
  window.__steps = steps;
  window.__renderer = mountKeyedDOM(root, runtime);
  const disabledInput = root.querySelector('[aria-label="Row 1"]');
  disabledInput.dispatchEvent(new Event('input', { bubbles: true }));
  window.__disabledSuppressed = steps.length === 0;
  window.__renderer.click('2/0/2');
  window.__disabledClickSuppressed = steps.length === 0;

  const row2Before = root.querySelector('[aria-label="Row 2"]');
  row2Before.focus();
  row2Before.setSelectionRange(1, 4, 'backward');
  window.__captured = window.__renderer.focusState();
  state.rows.reverse();
  window.__renderer.update(snapshot());
  const row2AfterMove = root.querySelector('[aria-label="Row 2"]');
  window.__sameAfterMove = row2AfterMove === row2Before;
  window.__focusAfterMove = window.__renderer.focusState();
  window.__noKeyAttributes = root.querySelectorAll('[data-key], [key]').length === 0;

  row2AfterMove.value = 'updated';
  row2AfterMove.setSelectionRange(2, 5, 'forward');
  row2AfterMove.dispatchEvent(new Event('input', { bubbles: true }));
  window.__dispatchAfterMove = steps.at(-1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  state.rows[0].status = 'saved';
  state.rows[0].saved = 'HTTP result';
  window.__renderer.update(snapshot());
  window.__sameAfterAsyncUpdate = root.querySelector('[aria-label="Row 2"]') === row2AfterMove;
  window.__focusAfterAsyncUpdate = window.__renderer.focusState();

  state.rows = [
    { id: 3, draft: 'charlie', saved: '', disabled: false },
    { id: 1, draft: 'alpha', saved: '', disabled: true },
  ];
  window.__renderer.update(snapshot());
  window.__focusAfterDelete = window.__renderer.focusState();
  window.__didNotFocusNewRow = document.activeElement !== root.querySelector('[aria-label="Row 3"]');
  const callsBeforeOldEvent = steps.length;
  row2AfterMove.value = 'stale after deletion';
  row2AfterMove.dispatchEvent(new Event('input', { bubbles: true }));
  window.__removedFenced = steps.length === callsBeforeOldEvent;

  const row3 = root.querySelector('[aria-label="Row 3"]');
  row3.focus();
  row3.setSelectionRange(1, 3, 'forward');
  const acrossState = window.__renderer.focusState();
  window.__renderer.unmount();
  root.replaceChildren();
  window.__renderer = mountKeyedDOM(root, runtime);
  window.__renderer.restoreFocus(acrossState);
  window.__newRow3 = root.querySelector('[aria-label="Row 3"]');
  window.__acrossSwapNewNode = window.__newRow3 !== row3;
  window.__acrossSwapFocus = window.__renderer.focusState();

  const accepted = window.__renderer.snapshot();
  const htmlBeforeBadUpdate = window.__renderer.domSnapshot().html;
  const bad = structuredClone(accepted);
  bad.tree.Kids[2].Kids[0].Key = bad.tree.Kids[2].Kids[1].Key;
  try { window.__renderer.update(bad); window.__duplicateRejected = false; }
  catch { window.__duplicateRejected = true; }
  window.__invalidSnapshotUnchanged = JSON.stringify(window.__renderer.snapshot()) === JSON.stringify(accepted) &&
    window.__renderer.domSnapshot().html === htmlBeforeBadUpdate;
  window.__renderer.unmount();
  window.__result = {
    disabledSuppressed: window.__disabledSuppressed,
    disabledClickSuppressed: window.__disabledClickSuppressed,
    sameAfterMove: window.__sameAfterMove,
    focusAfterMove: window.__focusAfterMove,
    noKeyAttributes: window.__noKeyAttributes,
    dispatchAfterMove: window.__dispatchAfterMove,
    sameAfterAsyncUpdate: window.__sameAfterAsyncUpdate,
    focusAfterAsyncUpdate: window.__focusAfterAsyncUpdate,
    focusAfterDelete: window.__focusAfterDelete,
    didNotFocusNewRow: window.__didNotFocusNewRow,
    removedFenced: window.__removedFenced,
    acrossSwapNewNode: window.__acrossSwapNewNode,
    acrossSwapFocus: window.__acrossSwapFocus,
    duplicateRejected: window.__duplicateRejected,
    invalidSnapshotUnchanged: window.__invalidSnapshotUnchanged,
  };
} catch (error) { window.__probeError = String(error && error.stack || error); }
</script></body></html>`;

  const server = createServer((request, response) => {
    if (request.url === "/dom.bundle.mjs") {
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
    await page.waitForFunction(() => window.__result || window.__probeError, null, { timeout: 30_000 });
    const probeError = await page.evaluate(() => window.__probeError ?? null);
    assert.equal(probeError, null, probeError ?? "browser probe did not finish");
    const result = await page.evaluate(() => window.__result);
    assert.deepEqual(browserErrors, []);
    assert.equal(result.disabledSuppressed, true);
    assert.equal(result.disabledClickSuppressed, true);
    assert.equal(result.sameAfterMove, true);
    assert.deepEqual(result.focusAfterMove, {
      key: "row-2-input", selectionStart: 1, selectionEnd: 4, selectionDirection: "backward",
    });
    assert.equal(result.noKeyAttributes, true);
    assert.deepEqual(result.dispatchAfterMove, {
      Path: "2/0/0", Event: "input", Value: "updated", Key: "row-2-input",
    });
    assert.equal(result.sameAfterAsyncUpdate, true);
    assert.deepEqual(result.focusAfterAsyncUpdate, {
      key: "row-2-input", selectionStart: 2, selectionEnd: 5, selectionDirection: "forward",
    });
    assert.equal(result.focusAfterDelete, null);
    assert.equal(result.didNotFocusNewRow, true);
    assert.equal(result.removedFenced, true);
    assert.equal(result.acrossSwapNewNode, true);
    assert.deepEqual(result.acrossSwapFocus, {
      key: "row-3-input", selectionStart: 1, selectionEnd: 3, selectionDirection: "forward",
    });
    assert.equal(result.duplicateRejected, true);
    assert.equal(result.invalidSnapshotUnchanged, true);
    return { chromium: browser.version(), ...result };
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(temp, { recursive: true, force: true });
  }
}

const protocolNegatives = protocolNegativeChecks();
const browser = await browserChecks();
console.log(JSON.stringify({ protocolNegativeChecks, browser }, null, 2));
