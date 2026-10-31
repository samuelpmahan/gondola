import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { chromium } from "../../../interaction/node_modules/playwright/index.mjs";
import { build } from "../../../interaction/node_modules/esbuild/lib/main.js";

let browser;
let page;
let temporary;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/tmp/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  page = await browser.newPage();
  await page.setContent("<!doctype html><main id=host></main>");
  temporary = await mkdtemp(join(tmpdir(), "gobi-react-checked-"));
  const entry = join(temporary, "entry.mjs");
  const rendererPath = fileURLToPath(new URL("./renderer.mjs", import.meta.url));
  await writeFile(entry,
    `import { createReactRenderer } from ${JSON.stringify(rendererPath)};\nwindow.createReactRenderer = createReactRenderer;\n`);
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
});

after(async () => {
  await browser?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

const attr = (Name, Value = "", Flag = false, Style = null) => ({ Name, Value, Flag, Style });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});
const binding = (Path, Event, Message, Source) => ({ Path, Event, Message, Source });
const formView = (checked) => ({
  Tree: element("div", "form", {
    Kids: [
      element("input", "controlled-check", { Attrs: [
        attr("type", "checkbox"),
        ...(checked ? [attr("checked", "", true)] : []),
        attr("aria-label", "Controlled"),
      ] }),
      element("input", "static-check", { Attrs: [
        attr("type", "checkbox"), attr("checked", "", true), attr("aria-label", "Static"),
      ] }),
      element("input", "draft", { Attrs: [
        attr("type", "text"), attr("value", "seed"), attr("aria-label", "Draft"),
      ] }),
    ],
  }),
  Bindings: [binding("0", "change", "checked", "target.checked")],
});

async function createRenderer() {
  await page.evaluate(() => {
    const host = document.getElementById("host");
    host.replaceChildren();
    window.savedDraft = null;
    window.savedControlled = null;
    window.renderer = window.createReactRenderer({ container: host });
  });
  return {
    update: (value) => page.evaluate((input) => {
      const struct = (fields) => Object.defineProperty(fields, "__goStructValue", {
        value: true, enumerable: true, writable: true, configurable: true,
      });
      const slice = (items) => ({ backing: items, offset: 0, length: items.length, capacity: items.length, target: undefined });
      const wrapNode = (node) => struct({
        ...node,
        Attrs: node.Attrs === null ? null : slice(node.Attrs.map((attr) => struct({ ...attr, Style: null }))),
        On: node.On === null ? null : slice(node.On.map((handler) => struct(handler))),
        Kids: node.Kids === null ? null : node.Kids.map(wrapNode),
      });
      const wrapped = struct({
        Tree: wrapNode(input.Tree),
        Bindings: slice(input.Bindings.map((item) => struct(item))),
      });
      return window.renderer.update(wrapped, {
        dispatch: () => {},
        onStaleAction: () => {},
      });
    }, value),
    snapshot: () => page.evaluate(() => window.renderer.domSnapshot()),
    state: () => page.evaluate(() => {
      const host = document.getElementById("host");
      const controlled = host.querySelector('[aria-label="Controlled"]');
      const staticControl = host.querySelector('[aria-label="Static"]');
      const draft = host.querySelector('[aria-label="Draft"]');
      return {
        html: host.firstElementChild?.outerHTML ?? "",
        controlledChecked: controlled?.checked ?? null,
        controlledHasCheckedAttribute: controlled?.hasAttribute("checked") ?? null,
        staticChecked: staticControl?.checked ?? null,
        staticHasCheckedAttribute: staticControl?.hasAttribute("checked") ?? null,
        draftIsFocused: document.activeElement === draft,
        draftSameNode: window.savedDraft ? window.savedDraft === draft : null,
        controlledSameNode: window.savedControlled ? window.savedControlled === controlled : null,
        draftSelection: draft && document.activeElement === draft
          ? [draft.selectionStart, draft.selectionEnd, draft.selectionDirection]
          : null,
      };
    }),
    focusDraft: () => page.evaluate(() => {
      const draft = document.querySelector('[aria-label="Draft"]');
      draft.focus();
      draft.setSelectionRange(1, 3, "backward");
      window.savedDraft = draft;
      window.savedControlled = document.querySelector('[aria-label="Controlled"]');
    }),
    unmount: () => page.evaluate(() => window.renderer.unmount()),
  };
}

function recordPhysical(label, state) {
  if (process.env.GOBI_CAPTURE_PHYSICAL_OUTERHTML === "1") {
    console.log(`PHYSICAL_OUTERHTML ${label} ${JSON.stringify(state)}`);
  }
}

test("controlled checked stays live but un-serialized across React mount, update, and remount", async () => {
  const expectedTrue = '<div><input aria-label="Controlled" type="checkbox"><input aria-label="Static" type="checkbox" checked=""><input aria-label="Draft" type="text" value="seed"></div>';
  const expectedFalse = '<div><input aria-label="Controlled" type="checkbox"><input aria-label="Static" type="checkbox" checked=""><input aria-label="Draft" type="text" value="seed"></div>';

  const first = await createRenderer();
  await first.update(formView(true));
  assert.equal((await first.snapshot()).html, expectedTrue);
  const initialState = await first.state();
  recordPhysical("initial", initialState);
  assert.deepEqual(initialState, {
    html: expectedTrue,
    controlledChecked: true,
    controlledHasCheckedAttribute: false,
    staticChecked: true,
    staticHasCheckedAttribute: true,
    draftIsFocused: false,
    draftSameNode: null,
    controlledSameNode: null,
    draftSelection: null,
  });

  await first.focusDraft();
  const initial = await first.state();
  recordPhysical("before-rerender", initial);
  await first.update(formView(true));
  assert.equal((await first.snapshot()).html, expectedTrue);
  const checkedAgain = await first.state();
  recordPhysical("update-checked-true", checkedAgain);
  assert.deepEqual(checkedAgain, {
    ...initial,
    controlledChecked: true,
    controlledHasCheckedAttribute: false,
    staticChecked: true,
    staticHasCheckedAttribute: true,
    draftIsFocused: true,
    draftSameNode: true,
    controlledSameNode: true,
    draftSelection: [1, 3, "backward"],
  });

  await first.update(formView(false));
  assert.equal((await first.snapshot()).html, expectedFalse);
  const unchecked = await first.state();
  recordPhysical("update-checked-false", unchecked);
  assert.equal(unchecked.controlledChecked, false);
  assert.equal(unchecked.controlledHasCheckedAttribute, false);
  await first.update(formView(true));
  assert.equal((await first.snapshot()).html, expectedTrue);
  const rechecked = await first.state();
  recordPhysical("update-checked-true-again", rechecked);
  assert.equal(rechecked.controlledChecked, true);
  assert.equal(rechecked.controlledHasCheckedAttribute, false);
  assert.equal(rechecked.draftSameNode, true);
  assert.equal(rechecked.controlledSameNode, true);
  assert.equal(rechecked.draftIsFocused, true);
  assert.deepEqual(rechecked.draftSelection, [1, 3, "backward"]);

  await first.unmount();
  const remounted = await createRenderer();
  await remounted.update(formView(true));
  assert.equal((await remounted.snapshot()).html, expectedTrue);
  const afterRemount = await remounted.state();
  recordPhysical("new-renderer-remount", afterRemount);
  assert.equal(afterRemount.controlledChecked, true);
  assert.equal(afterRemount.controlledHasCheckedAttribute, false);
  assert.equal(afterRemount.staticChecked, true);
  assert.equal(afterRemount.staticHasCheckedAttribute, true);
  await remounted.unmount();
});
