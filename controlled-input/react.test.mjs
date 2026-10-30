import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// run-controlled-input.sh bundles the pinned React packages into this browser
// adapter before Node loads the tests. This keeps the test runnable in a fresh
// checkout where React is installed only under interaction/node_modules.
const { mountEditorReact } = await import("./build/react.bundle.mjs");
const requireFromInteraction = createRequire(resolve(process.cwd(), "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function rootProbe() {
  return {
    nodeType: 1,
    ownerDocument: {},
    innerHTML: "keep this existing content",
    addEventListenerCalls: 0,
    addEventListener() {
      this.addEventListenerCalls += 1;
    },
  };
}

function malformedInitialRuntime() {
  return {
    initCalls: 0,
    dispatchCalls: 0,
    init() {
      this.initCalls += 1;
      return {
        state: { Draft: "", Saved: "", Saves: 0 },
        tree: {
          Kind: 99,
          Tag: "",
          Key: "",
          Attrs: null,
          On: null,
          Kids: null,
          Text: "",
        },
        bindings: [],
        messages: [],
      };
    },
    dispatch() {
      this.dispatchCalls += 1;
      throw new Error("dispatch must not run during initial validation");
    },
  };
}

function attr(Name, Value, Flag = false) {
  return { Name, Value, Flag, Style: null };
}

function text(Text) {
  return { Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text };
}

function element(Tag, Attrs = null, On = null, Kids = null) {
  return { Kind: 1, Tag, Key: "", Attrs, On, Kids, Text: "" };
}

function editorSnapshot() {
  return {
    state: { Draft: "", Saved: "", Saves: 0 },
    tree: element("div", [attr("class", "editor")], null, [
      element("input", [attr("type", "text"), attr("value", ""), attr("aria-label", "Draft")]),
      element("p", null, null, [text("Saved: "), text("")]),
      element("p", null, null, [text("Saves: "), text("0")]),
      element("button", [attr("class", "save"), attr("disabled", "", true)], [
        { Event: "click", Message: "save", Arg: "" },
      ], [text("Save")]),
      element("button", [attr("class", "reset"), attr("disabled", "", true)], [
        { Event: "click", Message: "reset", Arg: "" },
      ], [text("Reset")]),
    ]),
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: [],
  };
}

function runtimeReturning(snapshot) {
  return {
    init() { return snapshot; },
    dispatch() { throw new Error("dispatch must not run during initial validation"); },
  };
}

test("invalid initial trees are rejected before React claims or mutates a reusable root", () => {
  const root = rootProbe();
  const runtime = malformedInitialRuntime();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.throws(() => mountEditorReact(root, runtime), /unsupported Node\.Kind/);
    assert.equal(root.innerHTML, "keep this existing content");
    assert.equal(root.addEventListenerCalls, 0, "createRoot must not attach listeners before validation");
  }
  assert.equal(runtime.initCalls, 2);
  assert.equal(runtime.dispatchCalls, 0);
});

test("unsupported tags, attributes and events fail closed before createRoot", () => {
  const mutations = [
    (snapshot) => { snapshot.tree.Kids[0].Tag = "script"; },
    (snapshot) => { snapshot.tree.Attrs.push(attr("href", "javascript:alert(1)")); },
    (snapshot) => {
      snapshot.tree.Kids[0].On = [{ Event: "focus", Message: "unexpected", Arg: "" }];
    },
  ];

  for (const mutate of mutations) {
    const root = rootProbe();
    const snapshot = editorSnapshot();
    mutate(snapshot);
    assert.throws(() => mountEditorReact(root, runtimeReturning(snapshot)));
    assert.equal(root.innerHTML, "keep this existing content");
    assert.equal(root.addEventListenerCalls, 0);
  }
});

test("native typing dispatches target.value synchronously and preserves the controlled input node", {
  timeout: 45_000,
}, async () => {
  const bundle = await readFile(fileURLToPath(new URL("./build/react.bundle.mjs", import.meta.url)));
  const domSource = await readFile(resolve(process.cwd(), "controlled-input/dom.mjs"));
  const protocolSource = await readFile(resolve(process.cwd(), "controlled-input/protocol.mjs"));
  const html = `<!doctype html><html><body><div id="root"></div>
<div id="parity-react-root"></div><div id="parity-dom-root"></div>
<script type="module">
import { mountEditorReact } from "/react.bundle.mjs";
import { mountEditorDOM } from "/dom.mjs";
const attr = (Name, Value, Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Attrs = null, On = null, Kids = null) =>
  ({ Kind: 1, Tag, Key: "", Attrs, On, Kids, Text: "" });
let state = { Draft: "", Saved: "", Saves: 0 };
let messages = [];
const calls = [];
function snapshot() {
  const disabled = (state.Draft === "" ? [attr("disabled", "", true)] : []);
  const resetDisabled = state.Draft === "" && state.Saved === "" && state.Saves === 0;
  return {
    state: { ...state },
    tree: element("div", [attr("class", "editor")], null, [
      element("input", [attr("type", "text"), attr("value", state.Draft), attr("aria-label", "Draft")]),
      element("p", null, null, [text("Saved: "), text(state.Saved)]),
      element("p", null, null, [text("Saves: "), text(String(state.Saves))]),
      element("button", [attr("class", "save"), ...disabled],
        [{ Event: "click", Message: "save", Arg: "" }], [text("Save")]),
      element("button", [attr("class", "reset"), ...(resetDisabled ? [attr("disabled", "", true)] : [])],
        [{ Event: "click", Message: "reset", Arg: "" }], [text("Reset")]),
    ]),
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: messages.map((message) => ({ ...message })),
  };
}
const runtime = {
  init() { return snapshot(); },
  dispatch(step) {
    calls.push({ ...step });
    if (step.Event === "input") {
      state.Draft = step.Value;
      messages.push({ Name: "edit", Arg: step.Value });
    } else if (step.Path === "3") {
      state.Saved = state.Draft;
      state.Saves += 1;
      messages.push({ Name: "save", Arg: "" });
    }
    return snapshot();
  },
};
try {
  const root = document.querySelector("#root");
  window.__mounted = mountEditorReact(root, runtime);
  window.__calls = calls;
  window.__inputBefore = root.querySelector("input");

  // Exercise the full shared safe subset in both renderers: aria-label is a
  // valid inert attribute on a button, and input[type=text] can be disabled.
  const compatibilitySnapshot = {
    state: { Draft: "locked", Saved: "", Saves: 0 },
    tree: element("div", [attr("class", "editor")], null, [
      element("input", [attr("type", "text"), attr("value", "locked"), attr("aria-label", "Draft"), attr("disabled", "", true)]),
      element("p", null, null, [text("Saved: "), text("")]),
      element("p", null, null, [text("Saves: "), text("0")]),
      element("button", [attr("class", "save"), attr("aria-label", "Save action")],
        [{ Event: "click", Message: "save", Arg: "" }], [text("Save")]),
      element("button", [attr("class", "reset")],
        [{ Event: "click", Message: "reset", Arg: "" }], [text("Reset")]),
    ]),
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: [],
  };
  const disabledInputCalls = [];
  const compatibilityRuntime = {
    init() { return compatibilitySnapshot; },
    dispatch(step) {
      disabledInputCalls.push({ ...step });
      return compatibilitySnapshot;
    },
  };
  window.__compatibilityReact = mountEditorReact(
    document.querySelector("#parity-react-root"), compatibilityRuntime,
  );
  window.__compatibilityDOM = mountEditorDOM(
    document.querySelector("#parity-dom-root"), compatibilityRuntime,
  );
  window.__disabledInputCalls = disabledInputCalls;
} catch (error) {
  window.__mountError = String(error && error.stack || error);
}
</script></body></html>`;
  const server = createServer((request, response) => {
    if (request.url === "/react.bundle.mjs") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(bundle);
      return;
    }
    if (request.url === "/dom.mjs") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(domSource);
      return;
    }
    if (request.url === "/protocol.mjs") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(protocolSource);
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(html);
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage();
    const browserErrors = [];
    const consoleWarnings = [];
    page.on("pageerror", (error) => browserErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
      if (message.type() === "warning") consoleWarnings.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__mounted || window.__mountError, null, { timeout: 30_000 });
    const mountError = await page.evaluate(() => window.__mountError ?? null);
    assert.equal(mountError, null, mountError ?? "React renderer did not mount");

    const input = page.locator("#root input");
    const initialInputHTML = await page.locator("#root").innerHTML();
    assert.match(initialInputHTML, /<input aria-label="Draft" type="text" value="">/);
    await input.fill("Draft: ");
    await input.pressSequentially("漢字 & <tag>");

    const afterTyping = await page.evaluate(() => ({
      value: document.querySelector("input").value,
      sameElement: document.querySelector("input") === window.__inputBefore,
      snapshot: window.__mounted.snapshot(),
      calls: [...window.__calls],
      html: document.querySelector("#root").innerHTML,
    }));
    assert.equal(afterTyping.value, "Draft: 漢字 & <tag>");
    assert.equal(afterTyping.sameElement, true, "normal edits must preserve the input DOM node");
    assert.equal(afterTyping.snapshot.state.Draft, afterTyping.value, "flushSync must paint the Go snapshot before input returns");
    assert.ok(afterTyping.calls.length > 2, "sequential typing should deliver multiple native input events");
    assert.deepEqual(afterTyping.calls.at(-1), { Path: "0", Event: "input", Value: afterTyping.value });
    assert.match(afterTyping.html, /<input aria-label="Draft" type="text" value="Draft: 漢字 &amp; &lt;tag&gt;">/);

    await page.locator("#root button.save").click();
    const afterSave = await page.evaluate(() => ({
      snapshot: window.__mounted.snapshot(),
      calls: [...window.__calls],
      dom: window.__mounted.domSnapshot(),
      sameElement: document.querySelector("input") === window.__inputBefore,
    }));
    assert.equal(afterSave.snapshot.state.Saved, "Draft: 漢字 & <tag>");
    assert.deepEqual(afterSave.calls.at(-1), { Path: "3", Event: "click", Value: "" },
      "the click must retain its literal On.Arg");
    assert.equal(afterSave.sameElement, true);
    assert.deepEqual(afterSave.dom.disabled, []);

    const compatibility = await page.evaluate(() => {
      const reactRoot = document.querySelector("#parity-react-root");
      const domRoot = document.querySelector("#parity-dom-root");
      const reactInput = reactRoot.querySelector("input");
      const domInput = domRoot.querySelector("input");
      reactInput.dispatchEvent(new Event("input", { bubbles: true }));
      domInput.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        reactHTML: reactRoot.innerHTML,
        domHTML: domRoot.innerHTML,
        reactDisabled: window.__compatibilityReact.domSnapshot().disabled,
        domDisabled: window.__compatibilityDOM.domSnapshot().disabled,
        inputDisabled: reactInput.disabled && domInput.disabled,
        buttonLabels: [
          reactRoot.querySelector("button.save").getAttribute("aria-label"),
          domRoot.querySelector("button.save").getAttribute("aria-label"),
        ],
        dispatches: [...window.__disabledInputCalls],
      };
    });
    assert.equal(compatibility.reactHTML, compatibility.domHTML, "React and DOM must serialize the accepted input/button attributes identically");
    assert.deepEqual(compatibility.reactDisabled, ["0"]);
    assert.deepEqual(compatibility.domDisabled, ["0"]);
    assert.equal(compatibility.inputDisabled, true);
    assert.deepEqual(compatibility.buttonLabels, ["Save action", "Save action"]);
    assert.deepEqual(compatibility.dispatches, [], "disabled input events must not reach either runtime");
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(consoleWarnings, []);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
