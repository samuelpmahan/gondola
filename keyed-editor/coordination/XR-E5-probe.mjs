#!/usr/bin/env node
// Independent E5 review diagnostics. Writes only temporary files under /tmp.
import assert from "node:assert/strict";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareObservations } from "../check.mjs";
import { expectedProbeNames, validateProbeSet } from "../adversarial.mjs";
import { fixedScripts } from "../scripts.mjs";
import { createFetchTracker } from "../harness-tracker.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const TRACE = resolve(process.argv[2] ?? resolve(REPO, "keyed-editor/build/keyed-e5-full-20261030-31.json"));
const REPORT = resolve(REPO, "keyed-editor/coordination/reports/E5.md");
const NODE = process.env.NODE_BIN ?? "/tmp/gondola-node22/node_modules/node/bin/node";
const BROWSER = process.env.CHROMIUM_EXECUTABLE_PATH ?? "/tmp/chromium";
const LAB = resolve(REPO, "keyed-editor/build/http-lab");
const requireFromInteraction = createRequire(resolve(REPO, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function assertFixedInventory(report) {
  const names = fixedScripts.map(({ name }) => name);
  assert.equal(names.length, 10, "the E5 fixed scenario inventory must remain complete");
  const observed = new Set(report.scenarios.map(({ name }) => name));
  for (const name of names) assert.ok(observed.has(name), `full trace is missing fixed scenario ${name}`);
  return names;
}

function summarizeTrace(report) {
  assert.equal(report.mismatches.length, 0, "the author trace must report no mismatches");
  assert.equal(report.nativeComparison.status, "matched", "native comparator must be required and matched");
  assert.equal(report.nativeComparison.scenarios.length, report.scenarios.length * 2, "two native comparisons are required per scenario");
  assert.ok(report.nativeComparison.scenarios.every(({ status }) => status === "matched"));
  assert.equal(report.browser.isolatedParticipantContexts, 3);
  const probeValidation = validateProbeSet(report.adversarial.probes);
  assert.equal(probeValidation.ok, true);

  let observations = 0;
  const maxHeldByParticipant = { dom: 0, react: 0, reference: 0 };
  let laneFailures = 0;
  let explicitFocusTicks = 0;
  let differingFocusTicks = 0;
  for (const scenario of report.scenarios) {
    for (const tick of scenario.ticks) {
      observations += 1;
      const actors = ["dom", "react", "reference"].map((name) => tick.observations?.[name]);
      if (new Set(actors.map((actor) => actor?.serverLane)).size !== 3 || actors.some((actor) => typeof actor?.serverLane !== "string")) {
        laneFailures += 1;
      }
      for (const participant of Object.keys(maxHeldByParticipant)) {
        const held = (tick.observations?.[participant]?.serverRequests ?? []).filter(({ State }) => State === "held").length;
        maxHeldByParticipant[participant] = Math.max(maxHeldByParticipant[participant], held);
      }
      if (tick.kind === "focus") {
        explicitFocusTicks += 1;
        const focusValues = actors.map((actor) => JSON.stringify(actor?.focus ?? null));
        if (new Set(focusValues).size > 1) differingFocusTicks += 1;
      }
    }
  }
  assert.equal(laneFailures, 0, "every settled tick must use three isolated actor lanes");
  assert.equal(observations, report.scenarios.reduce((sum, scenario) => sum + scenario.ticks.length, 0));

  const capScenario = report.scenarios.find(({ name }) => name === "four-row-cap-keeps-add-disabled-and-identity-stable");
  assert.ok(capScenario, "fixed four-row capacity scenario is required");
  const capObservation = capScenario.ticks.at(-1).observations.dom;
  const capState = capObservation.snapshot.state;
  const add = capObservation.snapshot.tree.Kids[0];
  assert.equal(capState.Rows.length, 4);
  assert.equal(capState.NextID, 4);
  assert.equal(capObservation.snapshot.messages.filter(({ Name }) => Name === "add").length, 4);
  assert.ok(add.Attrs.some(({ Name, Flag }) => Name === "disabled" && Flag));

  const sameBackendProbe = report.adversarial.probes.find(({ name }) => name === "same-backend-retained-key-reorder-and-async-focus");
  const sameBackendReactProbe = report.adversarial.probes.find(({ name }) => name === "same-backend-react-retained-key-reorder-and-async-focus");
  const backendSwapProbe = report.adversarial.probes.find(({ name }) => name === "backend-swap-replaces-node-restores-logical-selection");
  assert.equal(sameBackendProbe?.pass, true);
  assert.equal(sameBackendProbe?.observations?.sameNodeAfterReorder, true);
  assert.equal(sameBackendProbe?.observations?.sameNodeAfterCompletion, true);
  assert.equal(sameBackendReactProbe?.pass, true);
  assert.equal(sameBackendReactProbe?.observations?.sameNodeAfterReorder, true);
  assert.equal(sameBackendReactProbe?.observations?.sameNodeAfterCompletion, true);
  assert.equal(backendSwapProbe?.pass, true);
  assert.equal(backendSwapProbe?.observations?.oldNodeReplaced, true);

  const explicitFocusTick = report.scenarios
    .flatMap(({ ticks }) => ticks)
    .find(({ kind }) => kind === "focus");
  assert.ok(explicitFocusTick, "focus/selection actions must be present in settled observations");
  const expected = structuredClone(explicitFocusTick.observations.reference);
  const altered = structuredClone(expected);
  if (!altered.focus) throw new Error("selected explicit-focus observation unexpectedly has no focus record");
  altered.focus.selectionStart += 1;
  const explicitFocusMutations = compareObservations(altered, expected, { compareFocus: true });
  const preFocusMutations = compareObservations(altered, expected, { compareFocus: false });
  const ordinaryDOMMutation = structuredClone(expected);
  ordinaryDOMMutation.dom.root += "<!-- review mutation -->";
  const ordinaryDOMMutations = compareObservations(ordinaryDOMMutation, expected);

  return {
    scenarios: report.scenarios.length,
    replayKind: report.invocation?.cases === 0 ? "fixed" : "full-or-other",
    settledObservations: observations,
    nativeComparisons: report.nativeComparison.scenarios.length,
    nativeStatus: report.nativeComparison.status,
    fixedInventory: assertFixedInventory(report),
    contexts: report.browser.isolatedParticipantContexts,
    laneFailures,
    maxHeldByParticipant,
    fourRowCap: {
      rows: capState.Rows.length,
      nextID: capState.NextID,
      addMessages: capObservation.snapshot.messages.filter(({ Name }) => Name === "add").length,
      addDisabled: true,
    },
    requiredProbeNames: probeValidation.expected.length,
    focusComparatorMutation: {
      mutatedSelectionStart: altered.focus.selectionStart,
      detectedAfterExplicitFocus: explicitFocusMutations.some(({ field }) => field === "focus"),
      ignoredBeforeExplicitFocus: preFocusMutations.length === 0,
      mismatches: explicitFocusMutations,
      explicitFocusTicks,
      differingFocusTicks,
    },
    ordinaryDOMMutation: {
      detected: ordinaryDOMMutations.some(({ field }) => field === "dom.root"),
      mismatches: ordinaryDOMMutations.map(({ field }) => field),
    },
    currentE5IdentityCoverage: {
      sameBackendDOMProbePass: sameBackendProbe?.pass === true,
      sameBackendReactProbePass: sameBackendReactProbe?.pass === true,
      reactSameNodeAfterReorder: sameBackendReactProbe?.observations?.sameNodeAfterReorder,
      reactSameNodeAfterCompletion: sameBackendReactProbe?.observations?.sameNodeAfterCompletion,
      backendSwapReplacesNodeAndRestoresSelection: backendSwapProbe.observations.oldNodeReplaced,
    },
  };
}

async function verifyTrackerRepair() {
  let releaseBody;
  const gate = new Promise((resolveGate) => { releaseBody = resolveGate; });
  const tracker = createFetchTracker(async () => ({ status: 200, text: async () => gate }), "http://127.0.0.1:8123/");
  const response = await tracker.fetchImpl("/api/save?lane=review&mode=held", {
    method: "POST",
    body: JSON.stringify({ ID: 5001, Value: "held" }),
  });
  const record = tracker.records.get(5001);
  const reading = response.text();
  let waiterResolved = false;
  const waiting = tracker.waitFor(5001).then((error) => {
    waiterResolved = true;
    return error;
  });
  await Promise.resolve();
  const stayedPendingUntilBody = record.done instanceof Promise && record.doneState === false && !waiterResolved;
  releaseBody('{"ID":5001,"Value":"held","Error":""}');
  const body = await reading;
  const error = await waiting;
  assert.equal(stayedPendingUntilBody, true, "waiter must not confuse the done promise with its boolean flag");
  assert.equal(record.doneState, true);
  assert.equal(waiterResolved, true);
  assert.equal(error, null);
  return { stayedPendingUntilBody, bodyCompleted: body.includes("held"), doneStateAfterBody: record.doneState, waiterError: error };
}

function waitForExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolveExit(false);
    }, milliseconds);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once("exit", onExit);
  });
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

async function verifyStartupFailureCleanupGap() {
  const stem = `/tmp/keyed-xr-e5-${process.pid}`;
  const fakeLab = `${stem}-lab.sh`;
  const pidFile = `${stem}-lab.pid`;
  const failureReport = `${stem}-failure.json`;
  await writeFile(fakeLab, `#!/bin/sh\nprintf '%s\\n' "$$" > '${pidFile}'\nprintf 'not-json\\n'\nexec sleep 60\n`);
  await chmod(fakeLab, 0o755);
  let stderr = "";
  let child = null;
  let fakePID = null;
  try {
    child = spawn(NODE, [resolve(REPO, "keyed-editor/check.mjs"), "--seed", "1", "--cases", "0", "--output", failureReport], {
      cwd: REPO,
      env: { ...process.env, HTTP_LAB_BIN: fakeLab, CHROMIUM_EXECUTABLE_PATH: BROWSER },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const started = await new Promise((resolveStarted, rejectStarted) => {
      const timer = setTimeout(() => rejectStarted(new Error(`startup failure probe timed out: ${stderr}`)), 15_000);
      child.stderr.on("data", () => {
        if (stderr.includes("browser setup failed; diagnostic report:")) {
          clearTimeout(timer);
          resolveStarted(true);
        }
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        rejectStarted(error);
      });
      child.once("exit", (code, signal) => {
        if (!stderr.includes("browser setup failed; diagnostic report:")) {
          clearTimeout(timer);
          rejectStarted(new Error(`checker exited before reporting startup failure (code=${code}, signal=${signal}): ${stderr}`));
        }
      });
    });
    assert.equal(started, true);
    fakePID = Number((await readFile(pidFile, "utf8")).trim());
    const checkerExitedWithoutForcedKill = await waitForExit(child, 750);
    const labChildAliveAfterFailure = pidAlive(fakePID);
    const failure = JSON.parse(await readFile(failureReport, "utf8"));
    assert.equal(failure.nativeComparison.status, "not-run");
    assert.equal(checkerExitedWithoutForcedKill, true, "checker must exit after reporting startup failure");
    assert.equal(labChildAliveAfterFailure, false, "HTTP lab child must be reaped after startup failure");
    return {
      setupFailureWasReported: true,
      checkerExitedWithoutForcedKill,
      labChildAliveAfterFailure,
      error: failure.runError.split("\n")[0],
      cleanupGapReproduced: labChildAliveAfterFailure,
      boundedFailureCleanup: checkerExitedWithoutForcedKill && !labChildAliveAfterFailure,
    };
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      if (!(await waitForExit(child, 1500))) child.kill("SIGKILL");
    }
    if (fakePID && pidAlive(fakePID)) {
      try { process.kill(fakePID, "SIGTERM"); } catch { /* already exited */ }
    }
    await rm(fakeLab, { force: true });
    await rm(pidFile, { force: true });
    await rm(failureReport, { force: true });
    await rm(`${failureReport}.partial.ndjson`, { force: true });
  }
}

async function startLab() {
  const child = spawn(LAB, ["-addr", "127.0.0.1:0", "-root", REPO], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const url = await new Promise((resolveURL, rejectURL) => {
    const timer = setTimeout(() => rejectURL(new Error(`HTTP lab did not become ready: ${stderr}`)), 15_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectURL(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      rejectURL(new Error(`HTTP lab exited before readiness (code=${code}, signal=${signal}): ${stderr}`));
    });
    lines.on("line", (line) => {
      try {
        const result = JSON.parse(line);
        if (typeof result.url !== "string") throw new Error("readiness JSON has no URL");
        clearTimeout(timer);
        resolveURL(result.url.replace(/\/$/, ""));
      } catch (error) {
        clearTimeout(timer);
        rejectURL(error);
      }
    });
  });
  return { child, url };
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = waitForExit(child, 2_000);
  child.kill("SIGTERM");
  if (!(await closed)) {
    child.kill("SIGKILL");
    await waitForExit(child, 1_000);
  }
}

async function verifyReactIdentityPerBackend() {
  const server = await startLab();
  let browser;
  const contexts = [];
  try {
    browser = await chromium.launch({ headless: true, executablePath: BROWSER });
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${server.url}/keyed-editor/harness.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__keyedHarness?.readyPromise || window.__keyedInitError, null, { timeout: 30_000 });
    return await page.evaluate(async (serverURL) => {
      if (window.__keyedInitError) throw new Error(window.__keyedInitError);
      await window.__keyedHarness.readyPromise;
      await window.__keyedHarness.createActor({
        index: 9915,
        name: "xr-e5-react-retention",
        participant: "react",
        serverURL,
      });
      const harness = window.__keyedHarness;
      try {
        for (const action of [
          { kind: "add" },
          { kind: "add" },
          { kind: "fill", rowID: 1, value: "row one" },
          { kind: "fill", rowID: 2, value: "focused draft" },
          { kind: "mode", mode: "held" },
          { kind: "focus", rowID: 2, selectionStart: 2, selectionEnd: 8, selectionDirection: "forward" },
          { kind: "click", action: "save", rowID: 2 },
        ]) await harness.apply(action);
        const input = () => document.querySelector("#keyed-react-9915 input[aria-label='Row 2']");
        const before = input();
        const beforeCapture = await harness.capture();
        const beforeSelection = {
          key: beforeCapture.focus?.key ?? beforeCapture.focus?.Key,
          start: document.activeElement?.selectionStart,
          end: document.activeElement?.selectionEnd,
          direction: document.activeElement?.selectionDirection,
        };
        await harness.apply({ kind: "click", action: "up", rowID: 2 });
        const afterReorder = input();
        const afterReorderSelection = {
          activeIsSameInput: document.activeElement === afterReorder,
          start: document.activeElement?.selectionStart,
          end: document.activeElement?.selectionEnd,
          direction: document.activeElement?.selectionDirection,
        };
        await harness.apply({ kind: "release", id: 1, mode: "success", expectedStatus: 202 });
        const afterCompletion = input();
        const afterCompletionSelection = {
          activeIsSameInput: document.activeElement === afterCompletion,
          start: document.activeElement?.selectionStart,
          end: document.activeElement?.selectionEnd,
          direction: document.activeElement?.selectionDirection,
        };
        const finalCapture = await harness.capture();
        return {
          initialBackend: "react",
          sameNodeAfterReorder: before === afterReorder,
          sameNodeAfterCompletion: before === afterCompletion,
          beforeSelection,
          afterReorderSelection,
          afterCompletionSelection,
          saved: finalCapture.snapshot.state.Rows.find(({ ID }) => ID === 2)?.Saved,
        };
      } finally {
        await harness.disposeActor();
      }
    }, server.url);
  } finally {
    for (const context of contexts) {
      try { await context.close(); } catch { /* preserve probe outcome */ }
    }
    if (browser) await browser.close();
    await stopProcess(server.child);
  }
}

async function main() {
  const raw = await readFile(TRACE, "utf8");
  const report = JSON.parse(raw);
  const e5 = summarizeTrace(report);
  const poolEvidence = JSON.parse(await readFile(resolve(REPO, "keyed-editor/evidence/independent-context-pools.json"), "utf8"));
  assert.equal(poolEvidence.contexts, 3);
  assert.equal(poolEvidence.totalHeld, 12);
  assert.ok(poolEvidence.controls.every(({ status, held }) => status === 200 && held === 4));
  const tracker = await verifyTrackerRepair();
  const reactIdentity = await verifyReactIdentityPerBackend();
  const startupCleanup = await verifyStartupFailureCleanupGap();
  const output = {
    tracePath: TRACE,
    reportPath: REPORT,
    traceBytes: Buffer.byteLength(raw),
    e5,
    separateHTTPPoolProbe: poolEvidence,
    tracker,
    reactIdentity,
    startupCleanup,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
