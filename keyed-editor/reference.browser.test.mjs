import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const requireFromInteraction = createRequire(resolve(ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

test("independent React reference keeps keyed input identity, focus, selection, and HTTP updates", {
  timeout: 45_000,
}, async () => {
  const bundle = await readFile(resolve(HERE, "build/reference.bundle.mjs"));
  const html = `<!doctype html><html><body><main id="root"></main>
<script type="module">
import { mountCollectionReference, referenceReactDOMVersion, referenceReactVersion }
  from "/reference.bundle.mjs";
const root = document.querySelector("#root");
window.__referenceVersions = { react: referenceReactVersion, reactDOM: referenceReactDOMVersion };
window.__reference = mountCollectionReference(root);
window.__savedInput = null;
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
    await page.waitForFunction(() => Boolean(window.__reference));

    const versions = await page.evaluate(() => window.__referenceVersions);
    assert.deepEqual(versions, { react: "19.3.1", reactDOM: "19.3.1" });
    const initial = await page.evaluate(() => ({
      snapshot: window.__reference.snapshot(),
      dom: window.__reference.domSnapshot(),
    }));
    assert.deepEqual(initial.snapshot.state, { Rows: [], NextID: 0, NextRequestID: 0 });
    assert.deepEqual(initial.dom.disabled, ["1"]);
    assert.equal(initial.dom.html.includes("data-key"), false);

    await page.evaluate(() => {
      window.__reference.click("0");
      window.__reference.click("0");
    });
    const secondInput = page.locator('input[aria-label="Row 2"]');
    await secondInput.evaluate((input) => {
      input.value = "focus here";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await secondInput.evaluate((input) => {
      input.focus();
      input.setSelectionRange(2, 7, "forward");
      window.__savedInput = input;
    });
    await page.evaluate(() => window.__reference.click("2/1/7"));

    const afterMove = await page.evaluate(() => ({
      snapshot: window.__reference.snapshot(),
      focus: window.__reference.focusState(),
      sameNode: window.__savedInput === window.__reference.inputForKey("row-2-input"),
      html: window.__reference.domSnapshot().html,
    }));
    assert.deepEqual(afterMove.snapshot.state.Rows.map(({ ID }) => ID), [2, 1]);
    assert.equal(afterMove.sameNode, true);
    assert.deepEqual(afterMove.focus, {
      Key: "row-2-input",
      Path: "2/0/0",
      SelectionStart: 2,
      SelectionEnd: 7,
      SelectionDirection: "forward",
    });
    assert.equal(afterMove.html.includes("data-key"), false);

    await page.evaluate(() => {
      window.__reference.click("2/0/5");
      window.__reference.complete({ ID: 1, Value: "server saved", Error: "" });
    });
    const afterCompletion = await page.evaluate(() => ({
      snapshot: window.__reference.snapshot(),
      focus: window.__reference.focusState(),
      sameNode: window.__savedInput === window.__reference.inputForKey("row-2-input"),
      effects: window.__reference.effects(),
      audit: window.__reference.audit(),
      http: {
        request: window.__reference.encodeHTTP(9, "wire value"),
        reply: window.__reference.decodeHTTP(9, 200, '{"ID":9,"Value":"reply","Error":""}'),
      },
    }));
    assert.equal(afterCompletion.snapshot.state.Rows[0].Saved, "server saved");
    assert.equal(afterCompletion.sameNode, true);
    assert.deepEqual(afterCompletion.focus, afterMove.focus);
    assert.deepEqual(afterCompletion.effects, [{ Kind: "start", ID: 1, Value: "focus here" }]);
    assert.deepEqual(afterCompletion.audit, [
      { ID: 1, RowID: 2, Value: "server saved", Error: "", Accepted: true, Reason: "saved" },
    ]);
    assert.equal(afterCompletion.http.request, '{"ID":9,"Value":"wire value"}');
    assert.deepEqual(afterCompletion.http.reply, { ID: 9, Value: "reply", Error: "" });

    await page.evaluate(() => window.__reference.click("2/0/6"));
    const afterRemove = await page.evaluate(() => ({
      focus: window.__reference.focusState(),
      detached: !window.__savedInput.isConnected,
      snapshot: window.__reference.snapshot(),
    }));
    assert.equal(afterRemove.focus, null);
    assert.equal(afterRemove.detached, true);
    const stateBeforeDetachedEvent = afterRemove.snapshot;
    await page.evaluate(() => {
      const before = window.__reference.snapshot();
      let error = "";
      try {
        window.__reference.dispatch({
          Path: "2/0/0", Event: "input", Value: "stale row two", Key: "row-2-input",
        });
      } catch (caught) {
        error = String(caught?.message ?? caught);
      }
      window.__staleDispatch = { before, after: window.__reference.snapshot(), error };
      window.__savedInput.value = "detached edit";
      window.__savedInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const afterDetachedEvent = await page.evaluate(() => window.__reference.snapshot());
    assert.deepEqual(afterDetachedEvent, stateBeforeDetachedEvent);
    const staleDispatch = await page.evaluate(() => window.__staleDispatch);
    assert.match(staleDispatch.error, /key/i);
    assert.deepEqual(staleDispatch.after, staleDispatch.before);
    await page.evaluate(() => window.__reference.click("0"));
    const afterAdd = await page.evaluate(() => window.__reference.snapshot());
    assert.deepEqual(afterAdd.state.Rows.map(({ ID }) => ID), [1, 3], "the added row gets a never-reused ID");
    await page.evaluate(() => {
      window.__reference.click("0");
      window.__reference.click("0");
    });
    const atCapacity = await page.evaluate(() => ({
      snapshot: window.__reference.snapshot(),
      disabled: window.__reference.domSnapshot().disabled,
    }));
    assert.deepEqual(atCapacity.snapshot.state.Rows.map(({ ID }) => ID), [1, 3, 4, 5]);
    assert.ok(atCapacity.disabled.includes("0"), "Add is disabled at four rows");
    await page.evaluate(() => window.__reference.click("0"));
    const afterCapacityClick = await page.evaluate(() => window.__reference.snapshot());
    assert.deepEqual(afterCapacityClick, atCapacity.snapshot, "disabled Add does not allocate another row");
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

