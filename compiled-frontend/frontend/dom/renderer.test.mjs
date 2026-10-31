import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { chromium } from "../../../interaction/node_modules/playwright/index.mjs";
import { build } from "../../../interaction/node_modules/esbuild/lib/main.js";
import { createDOMRenderer } from "./renderer.mjs";

let browser;
let page;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/tmp/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  page = await browser.newPage();
  await page.setContent("<!doctype html><main id=host></main>");
  const temporary = await mkdtemp(join(tmpdir(), "gobi-dom-renderer-"));
  const entry = join(temporary, "entry.mjs");
  const rendererPath = fileURLToPath(new URL("./renderer.mjs", import.meta.url));
  await import("node:fs/promises").then(({ writeFile }) => writeFile(entry,
    `import { createDOMRenderer } from ${JSON.stringify(rendererPath)};\nwindow.createDOMRenderer = createDOMRenderer;\n`));
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await rm(temporary, { recursive: true, force: true });
});

after(async () => {
  await browser?.close();
});

const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const attr = (Name, Value = "", Flag = false, Style = null) => ({ Name, Value, Flag, Style });
const style = (Property, Value) => ({ Property, Value });
const on = (Event, Message, Arg = "") => ({ Event, Message, Arg });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});
const binding = (Path, Event, Message, Source) => ({ Path, Event, Message, Source });
const view = (Tree, Bindings = []) => ({ Tree, Bindings });

async function createRenderer() {
  await page.evaluate(() => {
    document.getElementById("host").replaceChildren();
    window.observed = [];
    window.renderer = window.createDOMRenderer({ container: document.getElementById("host") });
  });
  return {
    update: (value) => page.evaluate((input) => {
      const struct = (fields) => Object.defineProperty(fields, "__goStructValue", {
        value: true, enumerable: true, writable: true, configurable: true,
      });
      const slice = (items) => ({ backing: items, offset: 0, length: items.length, capacity: items.length, target: undefined });
      const wrapNode = (node) => struct({
        ...node,
        Attrs: node.Attrs === null ? null : slice(node.Attrs.map((attr) => struct({
          ...attr,
          Style: attr.Style === null ? null : slice(attr.Style.map((declaration) => struct(declaration))),
        }))),
        On: node.On === null ? null : slice(node.On.map((handler) => struct(handler))),
        Kids: node.Kids === null ? null : node.Kids.map(wrapNode),
      });
      const wrapped = struct({
        Tree: wrapNode(input.Tree),
        Bindings: input.Bindings === null ? null : slice(input.Bindings.map((binding) => struct(binding))),
      });
      return window.renderer.update(wrapped, {
        dispatch: (action, message) => window.observed.push({ action, message }),
        onStaleAction: (action, epoch) => window.observed.push({ stale: action, epoch }),
      });
    }, value),
    snapshot: () => page.evaluate(() => window.renderer.domSnapshot()),
    unmount: () => page.evaluate(() => window.renderer.unmount()),
  };
}

test("mounts real HTML, controlled bindings, boolean attributes, styles, and exact messages", async () => {
  const renderer = await createRenderer();
  await renderer.update(view(element("div", "app", {
    Attrs: [attr("class", "shell"), attr("style", "", false, [style("margin-top", " 2px "), style("color", "red")])],
    Kids: [
      element("button", "save", { On: [on("click", "save", "literal arg")], Kids: [text("Save")] }),
      element("button", "hold", { Attrs: [attr("disabled", "", true)], Kids: [text("Hold")] }),
      element("input", "draft", { Attrs: [attr("type", "text"), attr("value", "seed")] }),
      element("input", "agree", { Attrs: [attr("type", "checkbox")] }),
    ],
  }), [binding("2", "input", "draft", "target.value"), binding("3", "change", "agree", "target.checked")]));

  const initial = await renderer.snapshot();
  assert.equal(initial.normalization, "outerHTML-v1");
  assert.equal(initial.html, '<div class="shell" style="margin-top: 2px; color: red;"><button>Save</button><button disabled="">Hold</button><input type="text" value="seed"><input type="checkbox"></div>');
  assert.deepEqual(initial.controls, [
    { path: "0", key: "save", tag: "button", type: "submit", value: "", checked: false, disabled: false },
    { path: "1", key: "hold", tag: "button", type: "submit", value: "", checked: false, disabled: true },
    { path: "2", key: "draft", tag: "input", type: "text", value: "seed", checked: false, disabled: false },
    { path: "3", key: "agree", tag: "input", type: "checkbox", value: "on", checked: false, disabled: false },
  ]);
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator('input[type="text"]').fill("typed");
  await page.locator('input[type="checkbox"]').check();
  assert.deepEqual(await page.evaluate(() => window.observed), [
    { action: { path: "0", event: "click", value: "" }, message: { Name: "save", Arg: "literal arg" } },
    { action: { path: "2", event: "input", value: "typed" }, message: { Name: "draft", Arg: "typed" } },
    { action: { path: "3", event: "change", value: "true" }, message: { Name: "agree", Arg: "true" } },
  ]);
  await renderer.unmount();
  assert.equal(await page.locator("#host").evaluate((host) => host.childNodes.length), 0);
});

test("matches React input attribute order while keeping checked as live property state", async () => {
  const renderer = await createRenderer();
  const formView = (draft, checked) => view(element("div", "form", {
    Kids: [
      element("input", "form-draft", { Attrs: [attr("type", "text"), attr("value", draft), attr("aria-label", "Draft")] }),
      element("input", "form-checked", { Attrs: [
        attr("type", "checkbox"),
        attr("aria-label", "Checked"),
        ...(checked ? [attr("checked", "", true)] : []),
      ] }),
    ],
  }), [binding("0", "input", "draft", "target.value"), binding("1", "change", "checked", "target.checked")]);

  await renderer.update(formView("", false));
  assert.equal((await renderer.snapshot()).html,
    '<div><input aria-label="Draft" type="text" value=""><input aria-label="Checked" type="checkbox"></div>');

  await page.locator('input[type="text"]').fill("typed draft");
  await page.locator('input[type="checkbox"]').check();
  await page.evaluate(() => {
    const input = document.querySelector('input[type="text"]');
    input.focus();
    input.setSelectionRange(1, 4, "backward");
    window.savedDraft = input;
  });
  await renderer.update(formView("typed draft", true));

  assert.equal((await renderer.snapshot()).html,
    '<div><input aria-label="Draft" type="text" value="typed draft"><input aria-label="Checked" type="checkbox"></div>');
  assert.deepEqual((await renderer.snapshot()).controls, [
    { path: "0", key: "form-draft", tag: "input", type: "text", value: "typed draft", checked: false, disabled: false },
    { path: "1", key: "form-checked", tag: "input", type: "checkbox", value: "on", checked: true, disabled: false },
  ]);
  assert.deepEqual(await page.evaluate(() => ({
    sameNode: window.savedDraft === document.querySelector('input[type="text"]'),
    focused: document.activeElement === window.savedDraft,
    selection: [window.savedDraft.selectionStart, window.savedDraft.selectionEnd, window.savedDraft.selectionDirection],
  })), { sameNode: true, focused: true, selection: [1, 4, "backward"] });
  assert.deepEqual(await page.evaluate(() => window.observed), [
    { action: { path: "0", event: "input", value: "typed draft" }, message: { Name: "draft", Arg: "typed draft" } },
    { action: { path: "1", event: "change", value: "true" }, message: { Name: "checked", Arg: "true" } },
  ]);
  await renderer.unmount();
});

test("reorders keyed controls without replacing their focused node or selection", async () => {
  const renderer = await createRenderer();
  const keyedView = (order) => view(element("div", "list", {
    Kids: order.map((key) => element("input", key, { Attrs: [attr("type", "text"), attr("value", key)] })),
  }));
  await renderer.update(keyedView(["alpha", "beta"]));
  await page.evaluate(() => {
    const alpha = document.querySelector('input[value="alpha"]');
    alpha.focus();
    alpha.setSelectionRange(1, 3, "backward");
    window.alpha = alpha;
  });
  await renderer.update(keyedView(["beta", "alpha"]));
  assert.deepEqual(await page.evaluate(() => ({
    sameNode: window.alpha === document.querySelectorAll("input")[1],
    focused: document.activeElement === window.alpha,
    selection: [window.alpha.selectionStart, window.alpha.selectionEnd, window.alpha.selectionDirection],
  })), { sameNode: true, focused: true, selection: [1, 3, "backward"] });
  assert.deepEqual((await renderer.snapshot()).controls.map(({ path, key }) => ({ path, key })), [
    { path: "0", key: "beta" },
    { path: "1", key: "alpha" },
  ]);
  await renderer.unmount();
});

test("fences a retained callback after its keyed node is detached", async () => {
  const renderer = await createRenderer();
  await page.evaluate(() => {
    window.retainedClick = null;
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, callback, options) {
      if (type === "click") window.retainedClick = callback;
      return original.call(this, type, callback, options);
    };
    window.restoreListenerSpy = () => { EventTarget.prototype.addEventListener = original; };
  });
  await renderer.update(view(element("div", "app", { Kids: [element("button", "old", { On: [on("click", "old")] })] })));
  await page.evaluate(() => window.restoreListenerSpy());
  const oldButton = await page.locator("button").elementHandle();
  await renderer.update(view(element("div", "app", { Kids: [element("button", "new", { On: [on("click", "new")] })] })));
  await page.evaluate((handle) => { window.oldButton = handle; }, oldButton);
  await page.evaluate(() => window.retainedClick({ currentTarget: window.oldButton, target: window.oldButton }));
  await renderer.unmount();
  assert.deepEqual(await page.evaluate(() => window.observed), [
    { stale: { path: "0", event: "click", value: "" }, epoch: 1 },
  ]);
});
