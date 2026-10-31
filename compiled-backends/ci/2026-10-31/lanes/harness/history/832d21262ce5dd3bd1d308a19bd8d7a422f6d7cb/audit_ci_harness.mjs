#!/usr/bin/env node
// Read-only verifier for fresh CI captures from compiled-backends/conformance/run.mjs.
// Writes only its result JSON to the assigned harness lane.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { expectedDOMSnapshots } from "../../../../../compiled-frontend/conformance/dom-oracle.mjs";
import { checkBackendConformance } from "../../../../../compiled-backends/conformance/check.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const LANE = dirname(SCRIPT);
const ROOT = resolve(LANE, "../../../../../");
const EXPECTED_HEAD = "832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb";
const EXPECTED_TREE = "bc8883df935c7d0c8b7265831cacdf5521fb70d2";
const FIXTURES = [
  { name: "counter", source: "compiled-frontend/fixtures/counter.json" },
  { name: "form", source: "compiled-frontend/fixtures/form.json" },
  { name: "list", source: "compiled-frontend/fixtures/list.json" },
  { name: "effect", source: "compiled-frontend/fixtures/effect.json" },
  { name: "list-growth", source: "compiled-frontend/conformance/fixtures/list-growth.json" },
];
const EXPECTED = {
  counter: { ticks: 5, swaps: 4, focusSwaps: 0, controls: 8 },
  form: { ticks: 10, swaps: 9, focusSwaps: 1, controls: 10 },
  list: { ticks: 11, swaps: 10, focusSwaps: 5, controls: 8 },
  effect: { ticks: 5, swaps: 3, focusSwaps: 2, controls: 11 },
  "list-growth": { ticks: 12, swaps: 11, focusSwaps: 1, controls: 8 },
};
const EXPECTED_TOTALS = { ticks: 43, swaps: 37, focusSwaps: 9, controls: 45 };
const knownSources = {
  "compiled-backends/conformance/browser.mjs": "9c0f4e41c918c1104b10fb29a0a218bd2b723280bcf6573a5350952041a5179e",
  "compiled-backends/conformance/check.mjs": "8445bb81fa6fc3822f58ca7d090d48eaa91596e99585d14c88180c30f9c201a3",
  "compiled-backends/conformance/run.mjs": "bb4d5036f95695600a07c55b01852c784e98ad0fd7357e08fe22a33fa3bfe73b",
  "compiled-backends/conformance/swap-schedules.json": "f0bf47cf0ac5c17f876a316508729e6d29082feecf08df9813538c5a49b24053",
  "compiled-backends/conformance/check.test.mjs": "5cbab8a25128b39ebb78fc1b942f9f931faad67671b6793e59f8020f2a781b66",
  "compiled-frontend/frontend/runtime/runtime.mjs": "dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4",
  "compiled-frontend/frontend/react/renderer.mjs": "35581215d912c0b19a63de9f122b75fef774c717100590d272cf9e7731943f6a",
  "compiled-frontend/frontend/dom/renderer.mjs": "8037c0b9d3430310aa9492ab9d1041207e33276f8a6dce219b84b2af17efa166",
  "compiled-frontend/frontend/shared/view.mjs": "ef2aaa7daf021b3e46dd5cec159951ec1e84d4ea3d7f3888ec6b8c27d7a959e0",
};
const tracked = new Map();
let captureRoot;
let captureIndex;

function parseArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--") || values.has(key)) throw new Error(`unexpected or duplicate option ${key}`);
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`missing value for ${key}`);
    values.set(key, argv[++i]);
  }
  if (!values.has("--captures")) throw new Error("usage: node audit_ci_harness.mjs --captures <immutable-five-fixture-capture-directory> [--output <lane-json>]");
  const captures = resolve(values.get("--captures"));
  const output = resolve(values.get("--output") ?? join(LANE, "audit.json"));
  const outputRelative = relative(LANE, output);
  if (outputRelative.startsWith("..") || isAbsolute(outputRelative)) throw new Error("--output must remain inside the assigned harness lane");
  return { captures, output };
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJSON(path) {
  const bytes = await readFile(path);
  tracked.set(resolve(path), hash(bytes));
  return JSON.parse(bytes.toString("utf8"));
}

async function fileHash(path) {
  const bytes = await readFile(path);
  return { sha256: hash(bytes), bytes: bytes.length };
}

async function listFiles(directory) {
  const found = [];
  async function walk(current) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) found.push(path);
    }
  }
  await walk(directory);
  return found;
}

async function indexCaptures() {
  captureIndex = new Map();
  for (const path of await listFiles(captureRoot)) {
    const base = basename(path);
    if (!captureIndex.has(base)) captureIndex.set(base, []);
    captureIndex.get(base).push(path);
  }
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

async function resolveRecordedPath(raw, label, expectedPin = null) {
  must(typeof raw === "string" && raw.length > 0, `${label}: missing path`);
  const direct = isAbsolute(raw) ? resolve(raw) : resolve(ROOT, raw);
  const alternatives = [];
  if (isAbsolute(raw)) {
    for (const marker of ["/compiled-backends/", "/compiled-frontend/", "/interaction/"]) {
      const at = raw.lastIndexOf(marker);
      if (at >= 0) alternatives.push(resolve(ROOT, raw.slice(at + 1)));
    }
  }
  const candidates = [...new Set([direct, ...alternatives])];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (!info.isFile()) continue;
      const actual = await fileHash(candidate);
      tracked.set(candidate, actual.sha256);
      if (expectedPin && (actual.sha256 !== expectedPin.sha256 ||
          (expectedPin.bytes !== undefined && actual.bytes !== expectedPin.bytes))) {
        throw new Error(`${label}: pinned bytes mismatch at ${candidate}`);
      }
      return { path: candidate, ...actual, remapped: candidate !== direct };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (expectedPin) {
    const sameName = captureIndex.get(basename(raw)) ?? [];
    const matches = [];
    for (const candidate of sameName) {
      const actual = await fileHash(candidate);
      if (actual.sha256 === expectedPin.sha256 &&
          (expectedPin.bytes === undefined || actual.bytes === expectedPin.bytes)) matches.push({ path: candidate, ...actual });
    }
    if (matches.length > 0) {
      matches.sort((a, b) => a.path.localeCompare(b.path));
      tracked.set(matches[0].path, matches[0].sha256);
      return { ...matches[0], remapped: true, matchingCandidates: matches.length };
    }
  }
  throw new Error(`${label}: file unavailable at recorded path or in capture bundle: ${raw}`);
}

async function verifyPins(pins, label) {
  must(Array.isArray(pins), `${label}: expected pin array`);
  const resolved = [];
  for (const pin of pins) {
    const found = await resolveRecordedPath(pin.path, `${label} ${pin.path}`, pin);
    resolved.push({ recordedPath: pin.path, resolvedPath: relative(ROOT, found.path), sha256: found.sha256, bytes: found.bytes, remapped: found.remapped });
  }
  return resolved;
}

async function locateRunRecords() {
  const files = await listFiles(captureRoot);
  const runFiles = files.filter((path) => path.endsWith(".run.json"));
  const candidates = [];
  for (const path of runFiles) {
    try {
      const run = await readJSON(path);
      candidates.push({ path, run });
    } catch (error) {
      throw new Error(`unreadable run record ${path}: ${error.message}`);
    }
  }
  const located = new Map();
  for (const fixture of FIXTURES) {
    const matching = candidates.filter(({ path, run }) => {
      const input = String(run.inputs?.fixture ?? "").replaceAll("\\", "/");
      return input.endsWith(fixture.source) || basename(path).startsWith(`${fixture.name}.`) || basename(path).startsWith(`${fixture.name}.json.`);
    });
    must(matching.length === 1, `${fixture.name}: expected exactly one run record in ${captureRoot}, found ${matching.length}`);
    located.set(fixture.name, matching[0]);
  }
  must(runFiles.length === FIXTURES.length, `capture directory must contain exactly five run records, found ${runFiles.length}`);
  return located;
}

async function locateCaptureOutput(runPath, run, name) {
  const recorded = run.outputPaths?.[name];
  must(typeof recorded === "string", `${basename(runPath)}: missing ${name} output path`);
  const matches = captureIndex.get(basename(recorded)) ?? [];
  if (matches.length === 1) return matches[0];
  const recordedPath = isAbsolute(recorded) ? resolve(recorded) : resolve(ROOT, recorded);
  if (matches.includes(recordedPath)) return recordedPath;
  if (matches.length > 1) {
    const fixtureName = basename(runPath).replace(/(?:\.json)?\.run\.json$/, "");
    const preferred = matches.filter((path) => basename(path).startsWith(`${fixtureName}.`) ||
      path.includes(`/${fixtureName}/`));
    if (preferred.length === 1) return preferred[0];
    throw new Error(`${basename(runPath)}: ambiguous capture for ${name}: ${matches.join(", ")}`);
  }
  const resolved = await resolveRecordedPath(recorded, `${basename(runPath)} ${name} capture`);
  return resolved.path;
}

async function readOutput(runPath, run, name) {
  return readJSON(await locateCaptureOutput(runPath, run, name));
}

function applicationOnly(trace) {
  const copy = structuredClone(trace);
  for (const tick of copy.ticks) delete tick.dom;
  return copy;
}

function keyFromFocusIdentity(identity) {
  try {
    const parts = JSON.parse(identity);
    return Array.isArray(parts) ? parts.at(-1) : null;
  } catch { return null; }
}

function validateActions(profile, fixture, fixtureName) {
  const lifetime = { disabledSuppressedActions: 0, retiredRendererCallbackInvocations: 0,
    activeMissingTargetDriverAttempts: 0, retainedActiveRendererCallbackInvocations: 0 };
  must(Array.isArray(profile.actions) && profile.actions.length === fixture.actions.length,
    `${fixtureName}/${profile.backend}: action evidence count differs`);
  for (let index = 0; index < fixture.actions.length; index += 1) {
    const evidence = profile.actions[index];
    const action = fixture.actions[index];
    const expectation = fixture.expectations.find((item) => item.actionIndex === index);
    must(expectation && isDeepStrictEqual(evidence.intent, action), `${fixtureName}/${profile.backend}/${index}: action intent differs`);
    const tick = profile.trace.ticks[evidence.traceTickIndex];
    must(tick && isDeepStrictEqual(tick, evidence.traceTick), `${fixtureName}/${profile.backend}/${index}: trace tick reference differs`);
    must(isDeepStrictEqual(tick.action, action) && isDeepStrictEqual(tick.message, expectation.message),
      `${fixtureName}/${profile.backend}/${index}: tick action/message differs from fixture oracle`);
    must(isDeepStrictEqual(evidence.expectedMessage, expectation.message), `${fixtureName}/${profile.backend}/${index}: expected message differs`);
    if (expectation.message === null) {
      must(tick.dispatchId === null && tick.message === null, `${fixtureName}/${profile.backend}/${index}: suppressed event dispatched`);
      const method = evidence.method;
      if (method === "disabled HTMLElement.click() plus runtime suppressed intent") {
        lifetime.disabledSuppressedActions += 1;
        must(evidence.targetDisabled === true && evidence.rendererCallback == null,
          `${fixtureName}/${profile.backend}/${index}: disabled control was not physically suppressed`);
        must(evidence.afterPhysical.callbacks.dispatch === evidence.before.callbacks.dispatch,
          `${fixtureName}/${profile.backend}/${index}: disabled control invoked renderer dispatch`);
      } else {
        must(typeof evidence.targetValueAtDispatch === "string", `${fixtureName}/${profile.backend}/${index}: missing stale target value`);
        must(evidence.targetConnectedBefore === false && evidence.rendererCallback?.rendererId === evidence.activeRendererId,
          `${fixtureName}/${profile.backend}/${index}: detached target lacks active callback provenance`);
        must(isDeepStrictEqual(evidence.rendererCallback.action, action) &&
          isDeepStrictEqual(evidence.rendererCallback.observed, { path: action.path, event: action.event, value: evidence.targetValueAtDispatch }),
        `${fixtureName}/${profile.backend}/${index}: stale callback lost actual target value`);
        must(evidence.traceTickIndex === evidence.before.ticks && evidence.afterPhysical.ticks === evidence.before.ticks + 1 &&
          evidence.afterPhysical.callbacks.dispatch === evidence.before.callbacks.dispatch,
        `${fixtureName}/${profile.backend}/${index}: active missing-target attempt did not add exactly one suppressed tick`);
        const retired = evidence.retiredCallbackProbe;
        if (retired) {
          lifetime.retiredRendererCallbackInvocations += 1;
          lifetime.activeMissingTargetDriverAttempts += 1;
          must(evidence.method === "active renderer onStaleAction for missing detached target" &&
            evidence.classification === "retired-renderer-probe-plus-active-missing-target-attempt",
          `${fixtureName}/${profile.backend}/${index}: retired probe misclassified`);
          must(retired.classification === "retired-renderer-callback-fenced-out-of-band" &&
            retired.rendererId !== evidence.activeRendererId && retired.callback?.rendererId === retired.rendererId,
          `${fixtureName}/${profile.backend}/${index}: retired callback provenance ambiguous`);
          must(isDeepStrictEqual(retired.before.trace, retired.after.trace) &&
            isDeepStrictEqual(retired.before.snapshot, retired.after.snapshot) &&
            retired.after.callbacks.dispatch === retired.before.callbacks.dispatch &&
            retired.after.callbacks.stale === retired.before.callbacks.stale + 1,
          `${fixtureName}/${profile.backend}/${index}: retired callback altered app trace/snapshot or was not fenced once`);
          const before = retired.before.diagnostics.fencedCallbacks;
          const after = retired.after.diagnostics.fencedCallbacks;
          must(Array.isArray(before) && Array.isArray(after) && after.length === before.length + 1 &&
            after.at(-1).generation === retired.rendererId && after.at(-1).kind === "stale",
          `${fixtureName}/${profile.backend}/${index}: retired callback is not exactly one out-of-band fence`);
          must(evidence.afterPhysical.callbacks.stale === evidence.before.callbacks.stale + 2,
            `${fixtureName}/${profile.backend}/${index}: retired probe plus active missing-target must be two callback observations`);
        } else {
          must(evidence.classification === "active-renderer-stale-callback" ||
            evidence.classification === "active-renderer-missing-target-attempt",
          `${fixtureName}/${profile.backend}/${index}: unknown active stale-action classification`);
          must(evidence.afterPhysical.callbacks.stale === evidence.before.callbacks.stale + 1,
            `${fixtureName}/${profile.backend}/${index}: expected exactly one active stale callback`);
          if (method === "retained callback from detached active renderer node") {
            lifetime.retainedActiveRendererCallbackInvocations += 1;
            must(evidence.classification === "active-renderer-stale-callback",
              `${fixtureName}/${profile.backend}/${index}: retained callback classification mismatch`);
          } else {
            lifetime.activeMissingTargetDriverAttempts += 1;
            must(method === "active renderer onStaleAction for missing detached target" &&
              evidence.classification === "active-renderer-missing-target-attempt",
            `${fixtureName}/${profile.backend}/${index}: driver attempt misstates retained-listener proof`);
          }
        }
      }
    } else {
      must(typeof evidence.targetValueAtDispatch === "string", `${fixtureName}/${profile.backend}/${index}: missing observed target value`);
      const expectedMessage = { Name: expectation.message.name, Arg: expectation.message.arg };
      must(evidence.rendererCallback?.rendererId !== undefined &&
        isDeepStrictEqual(evidence.rendererCallback.action, action) &&
        isDeepStrictEqual(evidence.rendererCallback.observed, { path: action.path, event: action.event, value: evidence.targetValueAtDispatch }) &&
        isDeepStrictEqual(evidence.rendererCallback.message, expectedMessage),
      `${fixtureName}/${profile.backend}/${index}: active callback/message/actual target evidence differs`);
      must(evidence.afterPhysical.callbacks.dispatch === evidence.before.callbacks.dispatch + 1,
        `${fixtureName}/${profile.backend}/${index}: expected one application dispatch`);
    }
  }
  return lifetime;
}

function validateSwapProfile(profile, nativeTrace, fixture, expectedDOM, fixtureName) {
  const observations = profile.swapObservations;
  must(observations?.schema === "gobi.backend-swap-observations/v1" &&
    Array.isArray(observations.events) && observations.events.length === fixture.actions.length,
  `${fixtureName}: expected one separate swap observation per fixture action`);
  let current = "react";
  let focusCount = 0;
  for (let i = 0; i < observations.events.length; i += 1) {
    const event = observations.events[i];
    const expectedNext = current === "react" ? "dom" : "react";
    must(event.afterActionIndex === i && event.from.backend === current && event.to.backend === expectedNext,
      `${fixtureName}: swap ${i} did not follow the alternating backend schedule`);
    current = expectedNext;
    must(isDeepStrictEqual(event.beforeTrace, event.afterTrace), `${fixtureName}: swap ${i} changed application trace`);
    must(isDeepStrictEqual(applicationOnly(event.afterTrace), {
      ...applicationOnly(nativeTrace), ticks: applicationOnly(nativeTrace).ticks.slice(0, event.afterTrace.ticks.length),
    }), `${fixtureName}: swap ${i} application trace differs from native prefix`);
    must(event.beforeTrace.ticks.length === event.afterTrace.ticks.length &&
      isDeepStrictEqual(event.beforeSnapshot.state, event.afterSnapshot.state) &&
      isDeepStrictEqual(event.beforeSnapshot.view, event.afterSnapshot.view) &&
      isDeepStrictEqual(event.afterSnapshot, event.returnedSnapshot),
    `${fixtureName}: swap ${i} changed tick count/state/View or returned a different snapshot`);
    must(isDeepStrictEqual(event.hostRequestsBefore, event.hostRequestsAfter) &&
      isDeepStrictEqual(event.hostCompletionsBefore, event.hostCompletionsAfter),
    `${fixtureName}: swap ${i} changed effect host correlation`);
    const lastTickIndex = event.afterTrace.ticks.length - 1;
    must(lastTickIndex >= 0 && isDeepStrictEqual(event.afterSnapshot, {
      state: event.afterTrace.ticks[lastTickIndex].state,
      view: event.afterTrace.ticks[lastTickIndex].view,
      dom: expectedDOM[lastTickIndex],
    }), `${fixtureName}: swap ${i} snapshot differs from committed trace/DOM oracle`);
    must(event.oldRootDetached === true && event.oldRootEmptyDuringSwap === true &&
      event.rootMutationEvidence?.oldRootRemoved === true && event.rootMutationEvidence?.newRootAdded === true &&
      event.rootMutationEvidence?.emptyAfterOldRemoval === true &&
      isDeepStrictEqual(event.oldRendererSnapshot, { normalization: "outerHTML-v1", html: "", controls: [] }),
    `${fixtureName}: swap ${i} did not prove old-root emptiness/detachment`);
    const replacements = event.diagnosticsAfter?.replacements;
    must(Array.isArray(replacements) && replacements.length === i + 1 && replacements.at(-1).outcome === "committed",
      `${fixtureName}: swap ${i} lacks a committed runtime replacement record`);

    const witness = fixture.focusWitnesses.find((item) => item.afterActionIndex === i);
    if (event.focusBefore !== null) {
      focusCount += 1;
      must(isDeepStrictEqual(event.focusBefore, event.focusAfter) && event.focusNodeReplaced === true &&
        replacements.at(-1).focusCaptured === true && replacements.at(-1).focusRestored === true,
      `${fixtureName}: swap ${i} did not preserve observed focus/selection through a physical node replacement`);
      if (witness) {
        must(keyFromFocusIdentity(event.focusAfter.identity) === witness.key &&
          event.focusAfter.selectionStart === witness.selectionStart && event.focusAfter.selectionEnd === witness.selectionEnd &&
          event.focusAfter.selectionDirection === witness.selectionDirection,
        `${fixtureName}: swap ${i} lost the declared keyed focus/selection witness`);
      }
    } else {
      must(replacements.at(-1).focusCaptured === false && replacements.at(-1).focusRestored === false && witness === undefined,
        `${fixtureName}: swap ${i} has inconsistent focus diagnostics/witness`);
    }
    const fenced = event.fenced;
    must(fenced && isDeepStrictEqual(fenced.trace, event.afterTrace) &&
      isDeepStrictEqual(fenced.snapshot, event.afterSnapshot),
    `${fixtureName}: swap ${i} retired callback probe changed app trace/state/View`);
    if (fenced.dispatch !== null) must(fenced.dispatch.accepted === false && fenced.dispatch.stale === true,
      `${fixtureName}: swap ${i} retired dispatch callback was not fenced`);
    must(fenced.stale?.accepted === false && fenced.stale?.stale === true,
      `${fixtureName}: swap ${i} retired stale callback was not fenced`);
    const prefix = event.diagnosticsAfter.fencedCallbacks;
    const afterFences = fenced.diagnostics?.fencedCallbacks;
    const expectedKinds = fenced.dispatch === null ? ["stale"] : ["dispatch", "stale"];
    must(Array.isArray(prefix) && Array.isArray(afterFences) && afterFences.length === prefix.length + expectedKinds.length &&
      isDeepStrictEqual(afterFences.slice(0, prefix.length), prefix) &&
      isDeepStrictEqual(afterFences.slice(prefix.length).map((item) => ({ generation: item.generation, kind: item.kind })),
        expectedKinds.map((kind) => ({ generation: event.from.id, kind }))),
    `${fixtureName}: swap ${i} retired callback diagnostics do not match invoked lease callbacks`);
  }
  must(focusCount === EXPECTED[fixtureName].focusSwaps, `${fixtureName}: focus-swap count differs`);
  return focusCount;
}

function validateUnmount(unmount, label) {
  must(unmount?.result === true &&
    isDeepStrictEqual(unmount.physical, { normalization: "container-innerHTML-v1", html: "", controls: 0 }) &&
    isDeepStrictEqual(unmount.rendererSnapshot, { normalization: "outerHTML-v1", html: "", controls: [] }),
  `${label}: physical or renderer DOM remained after unmount`);
  must(isDeepStrictEqual(unmount.traceBefore, unmount.traceAfterUnmount), `${label}: unmount itself changed application trace`);
  must(unmount.fenced && isDeepStrictEqual(unmount.fenced.trace, unmount.traceAfter), `${label}: post-unmount probes missing from trace`);
  const suffix = unmount.traceAfter.ticks.slice(unmount.traceAfterUnmount.ticks.length);
  must(suffix.length === (unmount.fenced.dispatch ? 2 : 1), `${label}: post-unmount attempts produced an unexpected number of ticks`);
  for (const tick of suffix) {
    const last = unmount.traceAfterUnmount.ticks.at(-1);
    must(tick.message === null && tick.dispatchId === null && tick.requestedEffects.length === 0 && tick.completedEffects.length === 0 &&
      isDeepStrictEqual(tick.state, last.state) && isDeepStrictEqual(tick.view, last.view) &&
      isDeepStrictEqual(tick.dom, { normalization: "outerHTML-v1", html: "", controls: [] }),
    `${label}: post-unmount callback was not a state-preserving suppressed tick`);
  }
  if (unmount.fenced.dispatch) must(unmount.fenced.dispatch.accepted === true && unmount.fenced.dispatch.dispatchId === null &&
    unmount.fenced.stale?.accepted === true && unmount.fenced.stale.dispatchId === null,
  `${label}: post-unmount callback caused a Go Update`);
}

function validateEffects(profile, fixture, fixtureName) {
  const requests = fixture.hostScript.steps.map((step) => step.request);
  const completions = fixture.hostScript.steps.filter((step) => step.completion !== null).map((step) => ({
    dispatchId: step.request.dispatchId, effectIndex: step.request.effectIndex, message: step.completion,
  }));
  must(isDeepStrictEqual(profile.host.requests, requests) && isDeepStrictEqual(profile.host.completions, completions),
    `${fixtureName}/${profile.backend}: host request/completion ordering differs from fixture`);
  must(profile.reorderControls.length === completions.length, `${fixtureName}/${profile.backend}: wrong-correlation control count differs`);
  for (const [i, control] of profile.reorderControls.entries()) {
    const request = requests[i];
    must(control.kind === "wrong-correlation-before-manual-reply" && control.rejected === true &&
      control.wrongCorrelation.dispatchId !== request.dispatchId &&
      isDeepStrictEqual(control.before.trace, control.after.trace) &&
      isDeepStrictEqual(control.before.requests, control.after.requests) &&
      isDeepStrictEqual(control.before.completions, control.after.completions),
    `${fixtureName}/${profile.backend}: invalid/reordered reply was not rejected without mutation`);
  }
  for (const observed of profile.observations.requests) {
    const index = profile.trace.ticks.findIndex((tick) => tick.dispatchId === observed.request.dispatchId);
    must(index >= 0 && observed.tickCount === index + 1 && observed.snapshot.dom.html.includes("Status: pending") &&
      observed.snapshot.dom.controls.some((control) => control.path === "1" && control.disabled),
    `${fixtureName}/${profile.backend}: effect was not observed after pending state/DOM commit`);
  }
  if (completions.length > 0) {
    must(profile.duplicateEvidence.length > 0 && profile.duplicateEvidence.every((item) => item.result.accepted === false &&
      isDeepStrictEqual(item.beforeTrace, item.afterTrace)),
    `${fixtureName}/${profile.backend}: duplicate effect completion not rejected`);
  }
}

function structBool(state, name) {
  const field = state?.kind === "struct" ? state.fields?.find((item) => item.name === name) : null;
  return field?.value?.bool;
}

function verifyEffectSwap(browser, fixture) {
  if (fixture.name !== "compiled-effect-commit-before-deterministic-reply") return;
  const swap = browser.profiles.swap;
  const event = swap.swapObservations.events.find((item) => item.afterActionIndex === 2);
  must(event && event.hostRequestsBefore.length === 1 && event.hostCompletionsBefore.length === 0 &&
    structBool(event.beforeSnapshot.state, "Pending") === true && structBool(event.afterSnapshot.state, "Pending") === true,
  "effect fixture: request was not pending across the scheduled React/DOM swap before reply");
  must(event.hostRequestsAfter.length === 1 && event.hostCompletionsAfter.length === 0 &&
    swap.trace.ticks.filter((tick) => tick.completedEffects.length > 0).length === 1,
  "effect fixture: request correlation changed at swap or exactly-once completion differs");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  captureRoot = args.captures;
  must((await stat(captureRoot)).isDirectory(), `capture directory does not exist: ${captureRoot}`);
  await indexCaptures();
  const head = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  must(head === EXPECTED_HEAD && tree === EXPECTED_TREE, `published source identity differs: ${head} ${tree}`);
  for (const [path, expectedHash] of Object.entries(knownSources)) {
    const actual = await fileHash(resolve(ROOT, path));
    tracked.set(resolve(ROOT, path), actual.sha256);
    must(actual.sha256 === expectedHash, `published source hash differs for ${path}`);
  }
  const schedule = JSON.parse(await readFile(resolve(ROOT, "compiled-backends/conformance/swap-schedules.json"), "utf8"));
  const runRecords = await locateRunRecords();
  const perFixture = {};
  const rawCapturePins = {};
  const lifetimeByFixture = {};
  const lifetimeTotals = { disabledSuppressedActions: 0, retiredRendererCallbackInvocations: 0,
    activeMissingTargetDriverAttempts: 0, retainedActiveRendererCallbackInvocations: 0 };
  const totals = { ticks: 0, swaps: 0, focusSwaps: 0, controls: 0 };

  for (const descriptor of FIXTURES) {
    const { path: runPath, run } = runRecords.get(descriptor.name);
    must(run.status === "matched" && run.sourceStable === true, `${descriptor.name}: run status/source stability differs`);
    must(run.sourcePinsBefore.length === 34 && isDeepStrictEqual(run.sourcePinsBefore, run.sourcePinsAfter),
      `${descriptor.name}: source pin sets are missing, differ, or have an unexpected count`);
    const verifiedSources = await verifyPins(run.sourcePinsBefore, `${descriptor.name} source`);
    const verifiedOutputs = await verifyPins(run.outputPins, `${descriptor.name} build output`);
    const output = {};
    for (const key of ["native", "direct", "browser", "check", "manifest"]) output[key] = await readOutput(runPath, run, key);
    const browser = output.browser;
    const check = output.check;
    const manifest = output.manifest;
    const native = output.native;
    const direct = output.direct;
    const fixture = JSON.parse(await readFile(resolve(ROOT, descriptor.source), "utf8"));
    const appIRPin = run.outputPins.find((pin) => pin.path === run.inputs.appIR);
    must(appIRPin, `${descriptor.name}: AppIR is not pinned as a run output`);
    const appIRPath = (await resolveRecordedPath(appIRPin.path, `${descriptor.name} AppIR`, appIRPin)).path;
    const appIR = JSON.parse(await readFile(appIRPath, "utf8"));
    const expectedDOM = expectedDOMSnapshots(fixture);

    must(run.inputs.fixture.endsWith(descriptor.source), `${descriptor.name}: run fixture input differs`);
    must(isDeepStrictEqual(native, direct), `${descriptor.name}: native and direct traces differ`);
    must(native.ticks.every((tick) => tick.dom === null), `${descriptor.name}: native trace includes renderer DOM`);
    must(browser.schema === "gobi.backend-browser-conformance/v1" && browser.fixture === fixture.name,
      `${descriptor.name}: browser evidence schema/fixture differs`);
    must(browser.pageErrors.length === 0 && browser.noWasm?.wasmRequests.length === 0 &&
      browser.noWasm?.wasmAPIAttempts.length === 0, `${descriptor.name}: browser errors or WASM evidence present`);
    must(isDeepStrictEqual(browser.schedule, schedule), `${descriptor.name}: browser schedule differs from published schedule`);
    lifetimeByFixture[descriptor.name] = {};
    for (const backend of ["react", "dom", "swap"]) {
      const profile = browser.profiles?.[backend];
      must(profile, `${descriptor.name}: missing ${backend} browser profile`);
      must(isDeepStrictEqual(applicationOnly(profile.trace), applicationOnly(native)),
        `${descriptor.name}/${backend}: application trace differs from native ticks`);
      must(isDeepStrictEqual(profile.trace.ticks.map((tick) => tick.dom), expectedDOM),
        `${descriptor.name}/${backend}: physical DOM snapshots differ from independent oracle`);
      const lifetime = validateActions(profile, fixture, descriptor.name);
      lifetimeByFixture[descriptor.name][backend] = lifetime;
      for (const [key, value] of Object.entries(lifetime)) lifetimeTotals[key] += value;
      validateEffects(profile, fixture, descriptor.name);
      if (backend !== "swap") validateUnmount(profile.unmount, `${descriptor.name}/${backend} unmount`);
    }
    const focusSwaps = validateSwapProfile(browser.profiles.swap, native, fixture, expectedDOM, descriptor.name);
    validateUnmount(browser.unmount, `${descriptor.name}/swap unmount`);
    verifyEffectSwap(browser, fixture);

    const rechecked = checkBackendConformance({ appIR, fixture, nativeTrace: native, directTrace: direct,
      browserEvidence: browser, schedule, pins: check.pins });
    must(isDeepStrictEqual(rechecked, check), `${descriptor.name}: fresh raw-trace checker result differs from archived check JSON`);
    must(check.status === "matched" && check.backends.react === "matched" && check.backends.dom === "matched" &&
      check.backends.alternatingSwap === "matched" && check.ticks === EXPECTED[descriptor.name].ticks &&
      check.swaps === EXPECTED[descriptor.name].swaps && check.focusSwaps === EXPECTED[descriptor.name].focusSwaps &&
      check.mutationControlsDetected === EXPECTED[descriptor.name].controls &&
      check.mutationControls.every((item) => item.detected === true),
    `${descriptor.name}: checker status or expected matrix totals differ`);
    must(run.summary.ticks === check.ticks && run.summary.swaps === check.swaps &&
      run.summary.focusSwaps === check.focusSwaps && run.summary.mutationControlsDetected === check.mutationControlsDetected,
    `${descriptor.name}: run summary differs from raw checker output`);
    must(manifest.schema === "gobi.backend-conformance-manifest/v1" &&
      isDeepStrictEqual(manifest.sourcePins.before, run.sourcePinsBefore) &&
      isDeepStrictEqual(manifest.sourcePins.after, run.sourcePinsAfter) &&
      isDeepStrictEqual(manifest.outputPins, run.outputPins), `${descriptor.name}: run/manifest pin records differ`);
    const bundlePins = await verifyPins(manifest.browserBundle, `${descriptor.name} browser bundle`);
    must(manifest.browser.noWasm?.wasmRequests.length === 0 && manifest.browser.noWasm?.wasmAPIAttempts.length === 0,
      `${descriptor.name}: browser bundle manifest reports WASM activity`);

    for (const kind of ["native", "direct", "browser", "check", "manifest"]) {
      const path = await locateCaptureOutput(runPath, run, kind);
      const found = await fileHash(path);
      tracked.set(path, found.sha256);
      rawCapturePins[`${descriptor.name}.${kind}`] = { path: relative(ROOT, path), sha256: found.sha256, bytes: found.bytes };
    }
    totals.ticks += check.ticks;
    totals.swaps += check.swaps;
    totals.focusSwaps += check.focusSwaps;
    totals.controls += check.mutationControlsDetected;
    perFixture[descriptor.name] = {
      status: check.status,
      ticks: check.ticks,
      swaps: check.swaps,
      focusSwaps,
      mutationControlsDetected: check.mutationControlsDetected,
      sourcePinCount: verifiedSources.length,
      buildOutputPinCount: verifiedOutputs.length,
      browserBundlePins: bundlePins.length,
      nativeDirectExact: true,
      reactDomSwapTraceAndDOMOracleMatched: true,
      noWasm: true,
      pageErrors: 0,
      runPath: relative(ROOT, runPath),
    };
  }
  must(isDeepStrictEqual(totals, EXPECTED_TOTALS), `matrix totals differ: ${JSON.stringify(totals)}`);
  must(lifetimeTotals.retiredRendererCallbackInvocations >= 1 &&
    lifetimeTotals.activeMissingTargetDriverAttempts >= 1 && lifetimeTotals.disabledSuppressedActions >= 1,
  `lifetime probes are incomplete: ${JSON.stringify(lifetimeTotals)}`);

  const pathsBefore = new Map(tracked);
  const changedDuringAudit = [];
  for (const [path, beforeHash] of pathsBefore) {
    const after = await fileHash(path);
    if (after.sha256 !== beforeHash) changedDuringAudit.push({ path: relative(ROOT, path), before: beforeHash, after: after.sha256 });
  }
  must(changedDuringAudit.length === 0, `audited inputs changed during review: ${JSON.stringify(changedDuringAudit)}`);

  const result = {
    schema: "gobi.ci-harness-audit/v1",
    job_id: "E-CI-HARNESS",
    worker: "N3",
    status: "accepted",
    source: { commit: head, tree, knownSourceHashes: knownSources },
    captures: relative(ROOT, captureRoot),
    totals,
    perFixture,
    lifetimeByFixture,
    lifetimeTotals,
    nativeDirectTraceObjectsEqual: true,
    rawBrowserProfilesAudited: ["react", "dom", "swap"],
    rawDOMSnapshotsComparedToIndependentOracle: true,
    swapObservationsOutsideGobiTrace: true,
    oldRootEmptyAndDetachedForAllSwaps: true,
    effectPendingCorrelationPreservedAcrossSwap: true,
    retiredCallbacksFencedOutOfBand: true,
    activeMissingTargetAttemptsSeparatedFromRetiredCallbacks: true,
    postUnmountSuppressedAttemptsVerified: true,
    noWasm: true,
    pageErrors: 0,
    inputsUnchangedDuringAudit: true,
    trackedInputCount: tracked.size,
    capturePins: rawCapturePins,
    limitations: [
      "The audit consumes root-shared immutable CI captures and does not rerun browser or native execution.",
      "Freshness is scoped to the provided CI artifact set and published commit; this report does not replace other CI lanes or post-publication reruns.",
    ],
  };
  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: result.status, totals, output: relative(ROOT, args.output) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
