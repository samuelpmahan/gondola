#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCleanHTTPProcessClose,
  retainPrimaryFailure,
  startHTTPProcess,
} from "../../http-lab-process.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const OUTPUT = resolve(HERE, "O-BROWSER-result.json");
const labPath = resolve(ROOT, "http-effects/build/http-lab");
const requireFromInteraction = createRequire(resolve(ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");
const FOCUS_VALUE = "browser focus selection probe";
const FOCUS_RANGE = [8, 17, "backward"];

async function main() {
  const lab = startHTTPProcess({
    command: labPath,
    args: ["-addr", "127.0.0.1:0", "-root", ROOT],
    cwd: ROOT,
  });
  let browser;
  let primaryError;
  let operationFailed = false;
  try {
    const baseURL = await lab.ready;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });
    await page.goto(`${baseURL}/typed-composition/demo.html`, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const demo = window.__typedCompositionDemo;
      return demo?.initialIDs?.child > 0 || (document.getElementById("error") && !document.getElementById("error").hidden);
    }, null, { timeout: 30_000 });
    assert.equal(await page.locator("#error").isVisible(), false, await page.locator("#error").textContent());

    const childID = await page.evaluate(() => window.__typedCompositionDemo.initialIDs.child);
    await page.evaluate(() => {
      globalThis.__oBrowserClone = (value) => JSON.parse(JSON.stringify(value));
    });
    const view = page.locator(`[data-session-view="${childID}"]`);
    await view.locator("button.add").click();
    const rowInput = view.getByLabel("Row 1");
    await rowInput.fill(FOCUS_VALUE);
    await page.waitForFunction(({ id, value }) => {
      const snapshot = window.__typedCompositionDemo.manager.snapshot(id);
      return (snapshot.state ?? snapshot.State).Rows[0].Draft === value;
    }, { id: childID, value: FOCUS_VALUE }, { timeout: 10_000 });
    await page.evaluate(() => window.__typedCompositionDemo.settled());

    const focusBefore = await page.evaluate(({ id, range }) => {
      const demo = window.__typedCompositionDemo;
      const snapshot = demo.manager.snapshot(id);
      const input = document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`);
      if (!input) throw new Error("row input is missing before renderer replacement");
      input.focus();
      input.setSelectionRange(range[0], range[1], range[2]);
      function findKey(node, key, path = "") {
        if (!node || typeof node !== "object") return null;
        if ((node.Key ?? node.key) === key) return path;
        for (const [index, child] of (node.Kids ?? node.kids ?? []).entries()) {
          const found = findKey(child, key, path === "" ? String(index) : `${path}/${index}`);
          if (found !== null) return found;
        }
        return null;
      }
      return {
        key: "row-1-input",
        path: findKey(snapshot.Tree ?? snapshot.tree, "row-1-input"),
        physical: {
          active: document.activeElement === input,
          label: input.getAttribute("aria-label"),
          value: input.value,
          selection: [input.selectionStart, input.selectionEnd, input.selectionDirection],
          disabled: input.disabled,
        },
        state: globalThis.__oBrowserClone(snapshot.state ?? snapshot.State),
        messages: globalThis.__oBrowserClone(snapshot.messages ?? snapshot.Messages),
      };
    }, { id: childID, range: FOCUS_RANGE });
    assert.equal(focusBefore.key, "row-1-input");
    assert.notEqual(focusBefore.path, null, "Go snapshot identifies the focused logical input key");
    assert.equal(focusBefore.physical.active, true);
    assert.deepEqual(focusBefore.physical.selection, FOCUS_RANGE);
    assert.equal(focusBefore.physical.value, FOCUS_VALUE);
    assert.equal(focusBefore.physical.disabled, false);

    const focusReplacement = [];
    for (const backend of ["dom", "godom", "react"]) {
      const immediate = await page.evaluate(({ id, backend }) => {
        const demo = window.__typedCompositionDemo;
        demo.host.replace(id, backend);
        const input = document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`);
        const snapshot = demo.manager.snapshot(id);
        return {
          backend,
          physical: input && {
            active: document.activeElement === input,
            label: input.getAttribute("aria-label"),
            value: input.value,
            selection: [input.selectionStart, input.selectionEnd, input.selectionDirection],
            disabled: input.disabled,
          },
          state: globalThis.__oBrowserClone(snapshot.state ?? snapshot.State),
          messages: globalThis.__oBrowserClone(snapshot.messages ?? snapshot.Messages),
        };
      }, { id: childID, backend });
      assert.ok(immediate.physical, `${backend} replacement retained the physical input`);
      assert.equal(immediate.physical.active, true, `${backend} immediate focus is physical DOM focus`);
      assert.equal(immediate.physical.label, "Row 1");
      assert.equal(immediate.physical.value, FOCUS_VALUE);
      assert.deepEqual(immediate.physical.selection, FOCUS_RANGE, `${backend} immediate selection is noncollapsed and directional`);
      assert.equal(immediate.physical.disabled, false);
      assert.deepEqual(immediate.state, focusBefore.state, `${backend} replacement leaves Go state unchanged`);
      assert.deepEqual(immediate.messages, focusBefore.messages, `${backend} replacement leaves Go messages unchanged`);

      await page.evaluate(() => window.__typedCompositionDemo.settled());
      const settled = await page.evaluate((id) => {
        const demo = window.__typedCompositionDemo;
        const input = document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`);
        const snapshot = demo.manager.snapshot(id);
        return {
          active: input && document.activeElement === input,
          value: input?.value ?? null,
          selection: input ? [input.selectionStart, input.selectionEnd, input.selectionDirection] : null,
          state: globalThis.__oBrowserClone(snapshot.state ?? snapshot.State),
          messages: globalThis.__oBrowserClone(snapshot.messages ?? snapshot.Messages),
        };
      }, childID);
      assert.equal(settled.active, true, `${backend} settled physical focus remains on the input`);
      assert.equal(settled.value, FOCUS_VALUE);
      assert.deepEqual(settled.selection, FOCUS_RANGE);
      assert.deepEqual(settled.state, focusBefore.state);
      assert.deepEqual(settled.messages, focusBefore.messages);
      focusReplacement.push({ backend, immediate: immediate.physical, settled });
    }

    await page.evaluate(async () => {
      const demo = window.__typedCompositionDemo;
      await demo.setPolicy({ Title: "Disabled browser probe", ReadOnly: true });
      await demo.settled();
    });
    await page.waitForFunction((id) => {
      const snapshot = window.__typedCompositionDemo.manager.snapshot(id);
      return (snapshot.state ?? snapshot.State).Inputs.ReadOnly === true;
    }, childID, { timeout: 10_000 });

    await page.evaluate(() => {
      const demo = window.__typedCompositionDemo;
      const originalDispatch = demo.manager.dispatch.bind(demo.manager);
      const probe = { phase: "idle", nativeDispatches: 0, directGuardDispatches: 0, calls: [] };
      demo.manager.dispatch = (...args) => {
        if (probe.phase === "native") probe.nativeDispatches += 1;
        if (probe.phase === "direct-guard") probe.directGuardDispatches += 1;
        probe.calls.push({ phase: probe.phase, sessionID: args[0], step: globalThis.__oBrowserClone(args[1]) });
        return originalDispatch(...args);
      };
      globalThis.__oBrowserProbe = probe;
    });

    const disabledBackends = [];
    for (const backend of ["dom", "react", "godom"]) {
      await page.evaluate(({ id, backend }) => {
        const demo = window.__typedCompositionDemo;
        demo.host.replace(id, backend);
      }, { id: childID, backend });
      await page.evaluate(() => window.__typedCompositionDemo.settled());

      const before = await page.evaluate((id) => {
        const demo = window.__typedCompositionDemo;
        const view = document.querySelector(`[data-session-view="${id}"]`);
        const input = view?.querySelector('input[aria-label="Row 1"]');
        const add = view?.querySelector("button.add");
        const save = view?.querySelector("button.save");
        const publish = view?.querySelector("button.publish");
        const snapshot = demo.manager.snapshot(id);
        if (!input || !add || !save || !publish) throw new Error("disabled test controls are missing");
        const controls = [input, add, save, publish];
        if (!controls.every((control) => control.disabled)) throw new Error("read-only controls are not all disabled");
        const dirty = demo.manager.changes();
        return {
          physicalValue: input.value,
          disabled: controls.map((control) => control.disabled),
          state: globalThis.__oBrowserClone(snapshot.state ?? snapshot.State),
          messages: globalThis.__oBrowserClone(snapshot.messages ?? snapshot.Messages),
          dirty,
        };
      }, childID);
      assert.deepEqual(before.dirty, [], `${backend} setup must be settled before native events`);

      const bounds = await page.evaluate(() => {
        const probe = globalThis.__oBrowserProbe;
        const view = document.querySelector(`[data-session-view="${window.__typedCompositionDemo.initialIDs.child}"]`);
        const input = view.querySelector('input[aria-label="Row 1"]');
        const add = view.querySelector("button.add");
        const save = view.querySelector("button.save");
        const publish = view.querySelector("button.publish");
        const events = [];
        for (const [element, label] of [[input, "input"], [add, "add"], [save, "save"], [publish, "publish"]]) {
          for (const type of ["click", "input", "beforeinput", "keydown"]) {
            element.addEventListener(type, (event) => events.push({ label, type, trusted: event.isTrusted }));
          }
        }
        globalThis.__oBrowserNativeEvents = events;
        probe.phase = "native";
        input.click();
        add.click();
        save.click();
        publish.click();
        const rect = input.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, events };
      });
      await page.mouse.click(bounds.x, bounds.y);
      await page.keyboard.type("blocked-input");
      await page.evaluate(() => window.__typedCompositionDemo.settled());

      const after = await page.evaluate((id) => {
        const demo = window.__typedCompositionDemo;
        const input = document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`);
        const snapshot = demo.manager.snapshot(id);
        const dirty = demo.manager.changes();
        globalThis.__oBrowserProbe.phase = "idle";
        return {
          physicalValue: input?.value ?? null,
          disabled: input?.disabled ?? false,
          activeElement: document.activeElement?.localName ?? null,
          nativeEvents: globalThis.__oBrowserProbe.calls.filter((call) => call.phase === "native").length,
          dispatches: globalThis.__oBrowserProbe.nativeDispatches,
          state: globalThis.__oBrowserClone(snapshot.state ?? snapshot.State),
          messages: globalThis.__oBrowserClone(snapshot.messages ?? snapshot.Messages),
          dirty,
          eventLog: globalThis.__oBrowserNativeEvents,
        };
      }, childID);
      const eventLog = bounds.events;
      assert.equal(after.physicalValue, before.physicalValue, `${backend} native attempt leaves physical input unchanged`);
      assert.equal(after.disabled, true);
      assert.equal(after.dispatches, 0, `${backend} native click/input attempt invokes no Go runtime dispatch`);
      assert.deepEqual(eventLog, [], `${backend} disabled controls receive no click/input/keyboard DOM events`);
      assert.deepEqual(after.state, before.state, `${backend} native attempt leaves Go state unchanged`);
      assert.deepEqual(after.messages, before.messages, `${backend} native attempt leaves Go messages unchanged`);
      assert.deepEqual(after.dirty, [], `${backend} native attempt leaves the Go dirty set unchanged`);
      disabledBackends.push({ backend, before, after: { ...after, eventLog } });
    }

    const directGuard = await page.evaluate((id) => {
      const demo = window.__typedCompositionDemo;
      const snapshot = demo.manager.snapshot(id);
      const input = document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`);
      const key = "row-1-input";
      function findPath(node, wanted, path = "") {
        if (!node || typeof node !== "object") return null;
        if ((node.Key ?? node.key) === wanted) return path;
        for (const [index, child] of (node.Kids ?? node.kids ?? []).entries()) {
          const found = findPath(child, wanted, path === "" ? String(index) : `${path}/${index}`);
          if (found !== null) return found;
        }
        return null;
      }
      const path = findPath(snapshot.Tree ?? snapshot.tree, key);
      if (path === null) throw new Error(`Go snapshot has no ${key} node`);
      const beforeDirty = demo.manager.changes();
      if (beforeDirty.length !== 0) throw new Error(`direct guard setup has pending dirty IDs: ${JSON.stringify(beforeDirty)}`);
      const before = {
        state: globalThis.__oBrowserClone(snapshot.state ?? snapshot.State),
        messages: globalThis.__oBrowserClone(snapshot.messages ?? snapshot.Messages),
        value: input.value,
      };
      const step = { Path: path, Event: "input", Value: "direct-guard-attempt", Key: key };
      globalThis.__oBrowserProbe.phase = "direct-guard";
      let result = null;
      let error = null;
      try { result = demo.manager.dispatch(id, step); }
      catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
      const afterSnapshot = demo.manager.snapshot(id);
      const dirtyAfter = demo.manager.changes();
      globalThis.__oBrowserProbe.phase = "idle";
      return {
        step,
        result: result && {
          state: globalThis.__oBrowserClone(result.state ?? result.State),
          messages: globalThis.__oBrowserClone(result.messages ?? result.Messages),
        },
        error,
        before,
        after: {
          state: globalThis.__oBrowserClone(afterSnapshot.state ?? afterSnapshot.State),
          messages: globalThis.__oBrowserClone(afterSnapshot.messages ?? afterSnapshot.Messages),
          value: input.value,
          disabled: input.disabled,
          dirty: dirtyAfter,
        },
        directGuardDispatches: globalThis.__oBrowserProbe.directGuardDispatches,
        nativeDispatches: globalThis.__oBrowserProbe.nativeDispatches,
      };
    }, childID);
    assert.ok(directGuard.step.Path.length > 0, "the direct guard uses the logical Go input path");
    assert.equal(directGuard.error, null, "valid read-only input step is suppressed as a no-op");
    assert.equal(directGuard.directGuardDispatches, 1, "the direct Go guard invocation is separately counted");
    assert.equal(directGuard.nativeDispatches, 0, "native attempts remain at zero before the direct guard call");
    assert.deepEqual(directGuard.result?.state, directGuard.before.state);
    assert.deepEqual(directGuard.result?.messages, directGuard.before.messages);
    assert.deepEqual(directGuard.after.state, directGuard.before.state);
    assert.deepEqual(directGuard.after.messages, directGuard.before.messages);
    assert.equal(directGuard.after.value, directGuard.before.value);
    assert.equal(directGuard.after.disabled, true);
    assert.deepEqual(directGuard.after.dirty, []);

    assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join("\n")}`);
    const output = {
      status: "passed",
      childID,
      focusReplacement,
      disabledBackends,
      directGuard,
      pageErrors,
      assets: {
        compositionWasm: "/typed-composition/build/composition.wasm",
        godomWasm: "/typed-composition/build/godom.wasm",
        reactBundle: "/typed-composition/build/react.bundle.mjs",
        browser: process.env.CHROMIUM_EXECUTABLE_PATH ?? "Playwright-managed Chromium",
      },
    };
    await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ output: OUTPUT, childID, backends: disabledBackends.map((entry) => entry.backend), focusBackends: focusReplacement.map((entry) => entry.backend), directGuardDispatches: directGuard.directGuardDispatches }));
  } catch (error) {
    operationFailed = true;
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    try {
      if (browser) {
        try { await browser.close(); }
        catch (error) { cleanupErrors.push(error); }
      }
    } finally {
      try { assertCleanHTTPProcessClose(await lab.close()); }
      catch (error) { cleanupErrors.push(error); }
    }
    const finalError = retainPrimaryFailure(primaryError, cleanupErrors, operationFailed);
    if (!operationFailed && finalError) throw finalError;
    if (operationFailed && cleanupErrors.length) {
      for (const error of cleanupErrors) console.error(`O-BROWSER cleanup also failed: ${error?.stack ?? error}`);
    }
  }
}

await main();
