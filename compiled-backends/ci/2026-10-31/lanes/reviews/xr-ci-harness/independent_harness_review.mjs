#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { expectedDOMSnapshots } from "../../../../../../compiled-frontend/conformance/dom-oracle.mjs";
import { checkBackendConformance } from "../../../../../../compiled-backends/conformance/check.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT), "../../../../../../");
const PACKET = join(ROOT, "compiled-backends/ci/2026-10-31");
const EXTRACTED = join(PACKET, "extracted");
const CAPTURES = join(EXTRACTED, "compiled-backends/artifacts/conformance");
const FIXTURES = [
  ["counter", "compiled-frontend/fixtures/counter.json"],
  ["form", "compiled-frontend/fixtures/form.json"],
  ["list", "compiled-frontend/fixtures/list.json"],
  ["effect", "compiled-frontend/fixtures/effect.json"],
  ["list-growth", "compiled-frontend/conformance/fixtures/list-growth.json"],
];
const EXPECTED = {
  counter: { ticks: 5, swaps: 4, focusSwaps: 0, controls: 8 },
  form: { ticks: 10, swaps: 9, focusSwaps: 1, controls: 10 },
  list: { ticks: 11, swaps: 10, focusSwaps: 5, controls: 8 },
  effect: { ticks: 5, swaps: 3, focusSwaps: 2, controls: 11 },
  "list-growth": { ticks: 12, swaps: 11, focusSwaps: 1, controls: 8 },
};

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function bytes(path) { return readFile(path); }
async function json(path) { return JSON.parse((await bytes(path)).toString("utf8")); }
function failUnless(condition, message) { assert.ok(condition, message); }
function withoutDOM(trace) {
  const copy = structuredClone(trace);
  for (const tick of copy.ticks) delete tick.dom;
  return copy;
}
function stateBool(state, fieldName) {
  return state?.kind === "struct" ? state.fields?.find((field) => field.name === fieldName)?.value?.bool : undefined;
}
function validateUnmount(unmount, label) {
  assert.equal(unmount.result, true, `${label}: unmount failed`);
  assert.deepEqual(unmount.physical, { normalization: "container-innerHTML-v1", html: "", controls: 0 });
  assert.deepEqual(unmount.rendererSnapshot, { normalization: "outerHTML-v1", html: "", controls: [] });
  assert.deepEqual(unmount.traceBefore, unmount.traceAfterUnmount, `${label}: unmount changed app trace`);
  assert.deepEqual(unmount.fenced.trace, unmount.traceAfter, `${label}: post-unmount trace snapshot missing`);
  const oldTicks = unmount.traceAfterUnmount.ticks;
  const suffix = unmount.traceAfter.ticks.slice(oldTicks.length);
  assert.equal(suffix.length, unmount.fenced.dispatch ? 2 : 1, `${label}: unexpected post-unmount suppressed tick count`);
  for (const tick of suffix) {
    const last = oldTicks.at(-1);
    assert.equal(tick.message, null);
    assert.equal(tick.dispatchId, null);
    assert.deepEqual(tick.requestedEffects, []);
    assert.deepEqual(tick.completedEffects, []);
    assert.deepEqual(tick.state, last.state);
    assert.deepEqual(tick.view, last.view);
    assert.deepEqual(tick.dom, { normalization: "outerHTML-v1", html: "", controls: [] });
  }
  if (unmount.fenced.dispatch) {
    assert.equal(unmount.fenced.dispatch.accepted, true);
    assert.equal(unmount.fenced.dispatch.dispatchId, null);
    assert.equal(unmount.fenced.stale.accepted, true);
    assert.equal(unmount.fenced.stale.dispatchId, null);
  }
}
function validateEffects(profile, fixture, label) {
  const steps = fixture.hostScript?.steps ?? [];
  const requests = steps.map((step) => step.request);
  const completions = steps.filter((step) => step.completion !== null).map((step) => ({
    dispatchId: step.request.dispatchId, effectIndex: step.request.effectIndex, message: step.completion,
  }));
  assert.deepEqual(profile.host.requests, requests, `${label}: host request list differs`);
  assert.deepEqual(profile.host.completions, completions, `${label}: host completion list differs`);
  assert.equal(profile.reorderControls.length, completions.length);
  for (const control of profile.reorderControls) {
    assert.equal(control.kind, "wrong-correlation-before-manual-reply");
    assert.equal(control.rejected, true);
    assert.notEqual(control.wrongCorrelation.dispatchId, control.request.dispatchId);
    assert.deepEqual(control.before.trace, control.after.trace);
    assert.deepEqual(control.before.requests, control.after.requests);
    assert.deepEqual(control.before.completions, control.after.completions);
  }
  for (const observation of profile.observations.requests) {
    const i = profile.trace.ticks.findIndex((tick) => tick.dispatchId === observation.request.dispatchId);
    assert.ok(i >= 0 && observation.tickCount === i + 1);
    assert.match(observation.snapshot.dom.html, /Status: pending/);
    assert.ok(observation.snapshot.dom.controls.some((control) => control.path === "1" && control.disabled));
  }
  if (completions.length > 0) {
    assert.ok(profile.duplicateEvidence.length > 0);
    for (const duplicate of profile.duplicateEvidence) {
      assert.equal(duplicate.result.accepted, false);
      assert.deepEqual(duplicate.beforeTrace, duplicate.afterTrace);
    }
  }
}
async function filesBelow(root) {
  const result = [];
  async function visit(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
    }
  }
  await visit(root);
  return result;
}
async function resolvePinnedPath(pin) {
  const sourcePath = resolve(ROOT, pin.path);
  const artifactPath = resolve(EXTRACTED, pin.path);
  for (const candidate of [sourcePath, artifactPath]) {
    try {
      const content = await bytes(candidate);
      if (sha(content) === pin.sha256 && (pin.bytes === undefined || content.length === pin.bytes)) return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`no byte-matching source/artifact path for ${pin.path}`);
}
async function resolveOutputPin(pin) {
  const marker = pin.path.includes("/compiled-backends/") ? "/compiled-backends/"
    : pin.path.includes("/compiled-frontend/") ? "/compiled-frontend/" : null;
  assert.ok(marker, `unexpected output pin namespace: ${pin.path}`);
  const artifactPath = resolve(EXTRACTED, pin.path.slice(pin.path.lastIndexOf(marker) + 1));
  const content = await bytes(artifactPath);
  assert.equal(sha(content), pin.sha256, `output hash differs: ${pin.path}`);
  assert.equal(content.length, pin.bytes, `output length differs: ${pin.path}`);
  return artifactPath;
}

async function main() {
  const provenance = await json(join(PACKET, "primary-provenance.json"));
  const runMeta = await json(join(PACKET, "primary-run.json"));
  const jobs = await json(join(PACKET, "primary-jobs.json"));
  const artifact = await json(join(PACKET, "artifact.json"));
  const retained = await json(join(PACKET, "retained-index.json"));
  const primaryArchive = await bytes(join(PACKET, "original.zip"));
  assert.equal(provenance.sourceHead, "195c9433179218348d4b9f2477ae1e0725337d15");
  assert.equal(provenance.sourceTree, "c0e4a66eee3fdd8b789e1b565167856fdab62433");
  assert.equal(provenance.actualCheckout, provenance.sourceHead);
  assert.equal(provenance.run, 41155530877);
  assert.equal(provenance.job, 124401386239);
  assert.equal(provenance.artifact, 13025112465);
  assert.equal(provenance.event, "push");
  assert.equal(provenance.conclusion, "success");
  assert.equal(runMeta.head_sha, provenance.sourceHead);
  assert.equal(runMeta.event, "push");
  assert.equal(runMeta.conclusion, "success");
  assert.equal(artifact.artifacts.length, 1);
  assert.equal(artifact.artifacts[0].id, provenance.artifact);
  assert.equal(artifact.artifacts[0].digest, `sha256:${sha(primaryArchive)}`);
  assert.equal(sha(primaryArchive), "646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa");
  assert.equal(primaryArchive.length, 14931201);
  const job = jobs.jobs.find((item) => item.id === provenance.job);
  assert.equal(job.run_id, provenance.run);
  assert.equal(job.status, "completed");
  assert.equal(job.conclusion, "success");
  for (const stepName of ["Run inherited gates and DOM/React backend matrix", "Preserve backend build, browser, and execution evidence"]) {
    assert.equal(job.steps.find((item) => item.name === stepName)?.conclusion, "success");
  }

  const extractedFiles = await filesBelow(EXTRACTED);
  assert.equal(retained.length, 817);
  assert.equal(extractedFiles.length, retained.length);
  for (const pin of retained) {
    const path = resolve(EXTRACTED, pin.path);
    const content = await bytes(path);
    assert.equal(sha(content), pin.sha256, `retained extraction hash differs: ${pin.path}`);
    assert.equal(content.length, pin.bytes, `retained extraction size differs: ${pin.path}`);
  }

  const execution = await json(join(EXTRACTED, "compiled-backends/artifacts/execution.json"));
  assert.equal(execution.mode, "full");
  assert.equal(execution.status, "passed");
  assert.equal(execution.inheritedExecution.status, "passed");
  assert.equal(execution.commands.length, 18);
  assert.ok(execution.commands.every((command) => command.exitCode === 0 && command.signal === null && command.error === null));
  assert.equal(execution.sourceBefore.length, 126);
  assert.deepEqual(execution.sourceBefore, execution.sourceAfter);
  const sourcePinPaths = [];
  for (const pin of execution.sourceBefore) {
    const path = await resolvePinnedPath(pin);
    sourcePinPaths.push(path);
  }
  const extraPrimaryPaths = [
    "primary-provenance.json", "primary-run.json", "primary-jobs.json", "artifact.json", "retained-index.json", "original.zip",
  ].map((name) => join(PACKET, name));
  const trackedUnique = new Set([...extractedFiles, ...sourcePinPaths, ...extraPrimaryPaths]);
  assert.equal(trackedUnique.size, 949, "independently derived 949-file set differs");

  const schedule = await json(resolve(ROOT, "compiled-backends/conformance/swap-schedules.json"));
  const summary = [];
  const lifetime = { disabledSuppressedActions: 0, retiredRendererCallbackInvocations: 0,
    activeMissingTargetDriverAttempts: 0, retainedActiveRendererCallbackInvocations: 0 };
  let totalTicks = 0;
  let totalSwaps = 0;
  let totalFocus = 0;
  let totalControls = 0;
  for (const [name, fixturePath] of FIXTURES) {
    const capturePath = (suffix) => join(CAPTURES, `${name}.json.${suffix}.json`);
    const native = await json(capturePath("native"));
    const direct = await json(capturePath("direct"));
    const browser = await json(capturePath("browser"));
    const check = await json(capturePath("check"));
    const manifest = await json(capturePath("manifest"));
    const run = await json(capturePath("run"));
    const fixture = await json(resolve(ROOT, fixturePath));
    assert.equal(run.status, "matched");
    assert.equal(run.sourceStable, true);
    assert.equal(run.sourcePinsBefore.length, 34);
    assert.deepEqual(run.sourcePinsBefore, run.sourcePinsAfter);
    for (const pin of run.sourcePinsBefore) await resolvePinnedPath(pin);
    for (const pin of run.outputPins) await resolveOutputPin(pin);
    assert.deepEqual(native, direct, `${name}: native/direct exact trace mismatch`);
    assert.ok(native.ticks.every((tick) => tick.dom === null));
    assert.deepEqual(browser.schedule, schedule);
    assert.equal(browser.pageErrors.length, 0);
    assert.equal(browser.noWasm.wasmRequests.length, 0);
    assert.equal(browser.noWasm.wasmAPIAttempts.length, 0);
    const expectedDOM = expectedDOMSnapshots(fixture);
    for (const backend of ["react", "dom", "swap"]) {
      const profile = browser.profiles[backend];
      assert.deepEqual(withoutDOM(profile.trace), withoutDOM(native), `${name}/${backend}: application trace differs`);
      assert.deepEqual(profile.trace.ticks.map((tick) => tick.dom), expectedDOM, `${name}/${backend}: DOM oracle differs`);
      assert.equal(profile.actions.length, fixture.actions.length);
      for (const evidence of profile.actions) {
        if (evidence.method === "disabled HTMLElement.click() plus runtime suppressed intent") {
          lifetime.disabledSuppressedActions += 1;
          assert.equal(evidence.targetDisabled, true);
          assert.ok(evidence.rendererCallback == null);
          assert.equal(evidence.afterPhysical.callbacks.dispatch, evidence.before.callbacks.dispatch);
        }
        if (evidence.retiredCallbackProbe) {
          lifetime.retiredRendererCallbackInvocations += 1;
          assert.equal(evidence.retiredCallbackProbe.classification, "retired-renderer-callback-fenced-out-of-band");
          assert.deepEqual(evidence.retiredCallbackProbe.before.trace, evidence.retiredCallbackProbe.after.trace);
          assert.deepEqual(evidence.retiredCallbackProbe.before.snapshot, evidence.retiredCallbackProbe.after.snapshot);
          assert.equal(evidence.retiredCallbackProbe.after.callbacks.stale,
            evidence.retiredCallbackProbe.before.callbacks.stale + 1);
          assert.equal(evidence.retiredCallbackProbe.after.callbacks.dispatch,
            evidence.retiredCallbackProbe.before.callbacks.dispatch);
          assert.equal(evidence.retiredCallbackProbe.callback.rendererId, evidence.retiredCallbackProbe.rendererId);
          lifetime.activeMissingTargetDriverAttempts += 1;
        } else if (evidence.method === "active renderer onStaleAction for missing detached target") {
          lifetime.activeMissingTargetDriverAttempts += 1;
        }
        if (evidence.method === "active renderer onStaleAction for missing detached target" || evidence.retiredCallbackProbe) {
          assert.equal(evidence.classification, evidence.retiredCallbackProbe
            ? "retired-renderer-probe-plus-active-missing-target-attempt"
            : "active-renderer-missing-target-attempt");
          assert.equal(evidence.targetConnectedBefore, false);
          assert.equal(typeof evidence.targetValueAtDispatch, "string");
          assert.equal(evidence.rendererCallback.rendererId, evidence.activeRendererId);
          assert.deepEqual(evidence.rendererCallback.action, evidence.intent);
          assert.deepEqual(evidence.rendererCallback.observed, {
            path: evidence.intent.path, event: evidence.intent.event, value: evidence.targetValueAtDispatch,
          });
          assert.equal(evidence.traceTickIndex, evidence.before.ticks);
          assert.equal(evidence.afterPhysical.ticks, evidence.before.ticks + 1);
          assert.equal(evidence.afterPhysical.callbacks.dispatch, evidence.before.callbacks.dispatch);
          assert.equal(evidence.traceTick.dispatchId, null);
          assert.equal(evidence.traceTick.message, null);
          assert.equal(evidence.afterPhysical.callbacks.stale,
            evidence.before.callbacks.stale + (evidence.retiredCallbackProbe ? 2 : 1));
        }
        if (evidence.method === "retained callback from detached active renderer node") {
          lifetime.retainedActiveRendererCallbackInvocations += 1;
          assert.equal(evidence.classification, "active-renderer-stale-callback");
          assert.equal(evidence.targetConnectedBefore, false);
          assert.equal(evidence.rendererCallback.rendererId, evidence.activeRendererId);
          assert.deepEqual(evidence.rendererCallback.action, evidence.intent);
          assert.deepEqual(evidence.rendererCallback.observed, {
            path: evidence.intent.path, event: evidence.intent.event, value: evidence.targetValueAtDispatch,
          });
          assert.equal(evidence.traceTickIndex, evidence.before.ticks);
          assert.equal(evidence.afterPhysical.ticks, evidence.before.ticks + 1);
          assert.equal(evidence.afterPhysical.callbacks.dispatch, evidence.before.callbacks.dispatch);
          assert.equal(evidence.afterPhysical.callbacks.stale, evidence.before.callbacks.stale + 1);
          assert.equal(evidence.traceTick.dispatchId, null);
          assert.equal(evidence.traceTick.message, null);
        }
      }
      validateEffects(profile, fixture, `${name}/${backend}`);
      if (backend !== "swap") validateUnmount(profile.unmount, `${name}/${backend}`);
    }

    const events = browser.profiles.swap.swapObservations.events;
    assert.equal(browser.profiles.swap.swapObservations.schema, "gobi.backend-swap-observations/v1");
    assert.equal(events.length, fixture.actions.length);
    let focusSwaps = 0;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      assert.equal(event.afterActionIndex, i);
      assert.deepEqual(event.beforeTrace, event.afterTrace, `${name}/swap${i}: trace changed inside swap`);
      assert.deepEqual(event.beforeSnapshot.state, event.afterSnapshot.state);
      assert.deepEqual(event.beforeSnapshot.view, event.afterSnapshot.view);
      assert.deepEqual(event.afterSnapshot, event.returnedSnapshot);
      assert.deepEqual(event.hostRequestsBefore, event.hostRequestsAfter);
      assert.deepEqual(event.hostCompletionsBefore, event.hostCompletionsAfter);
      assert.equal(event.oldRootDetached, true);
      assert.equal(event.oldRootEmptyDuringSwap, true);
      assert.equal(event.rootMutationEvidence.oldRootRemoved, true);
      assert.equal(event.rootMutationEvidence.newRootAdded, true);
      assert.equal(event.rootMutationEvidence.emptyAfterOldRemoval, true);
      assert.deepEqual(event.oldRendererSnapshot, { normalization: "outerHTML-v1", html: "", controls: [] });
      assert.equal(event.diagnosticsAfter.replacements.at(-1).outcome, "committed");
      assert.deepEqual(event.fenced.trace, event.afterTrace);
      assert.deepEqual(event.fenced.snapshot, event.afterSnapshot);
      assert.equal(event.fenced.stale.accepted, false);
      assert.equal(event.fenced.stale.stale, true);
      if (event.fenced.dispatch) {
        assert.equal(event.fenced.dispatch.accepted, false);
        assert.equal(event.fenced.dispatch.stale, true);
      }
      if (event.focusBefore !== null) {
        focusSwaps += 1;
        assert.deepEqual(event.focusBefore, event.focusAfter);
        assert.equal(event.focusNodeReplaced, true);
        assert.equal(event.diagnosticsAfter.replacements.at(-1).focusCaptured, true);
        assert.equal(event.diagnosticsAfter.replacements.at(-1).focusRestored, true);
        const witness = fixture.focusWitnesses.find((item) => item.afterActionIndex === i);
        if (witness) {
          const identityParts = JSON.parse(event.focusAfter.identity);
          assert.equal(identityParts.at(-1), witness.key);
          assert.equal(event.focusAfter.selectionStart, witness.selectionStart);
          assert.equal(event.focusAfter.selectionEnd, witness.selectionEnd);
          assert.equal(event.focusAfter.selectionDirection, witness.selectionDirection);
        }
      } else {
        assert.equal(event.diagnosticsAfter.replacements.at(-1).focusCaptured, false);
        assert.equal(event.diagnosticsAfter.replacements.at(-1).focusRestored, false);
        assert.equal(fixture.focusWitnesses.some((item) => item.afterActionIndex === i), false);
      }
    }
    validateUnmount(browser.unmount, `${name}/swap`);
    if (name === "effect") {
      const event = events.find((item) => item.afterActionIndex === 2);
      assert.ok(event);
      assert.equal(event.hostRequestsBefore.length, 1);
      assert.equal(event.hostCompletionsBefore.length, 0);
      assert.equal(stateBool(event.beforeSnapshot.state, "Pending"), true);
      assert.equal(stateBool(event.afterSnapshot.state, "Pending"), true);
      assert.equal(event.hostRequestsAfter.length, 1);
      assert.equal(event.hostCompletionsAfter.length, 0);
      assert.equal(browser.profiles.swap.trace.ticks.filter((tick) => tick.completedEffects.length > 0).length, 1);
    }
    const expected = EXPECTED[name];
    assert.equal(check.status, "matched");
    assert.equal(check.backends.react, "matched");
    assert.equal(check.backends.dom, "matched");
    assert.equal(check.backends.alternatingSwap, "matched");
    assert.equal(check.ticks, expected.ticks);
    assert.equal(check.swaps, expected.swaps);
    assert.equal(check.focusSwaps, expected.focusSwaps);
    assert.equal(focusSwaps, expected.focusSwaps);
    assert.equal(check.mutationControlsDetected, expected.controls);
    assert.ok(check.mutationControls.every((control) => control.detected === true));
    const appIRPin = run.outputPins.find((pin) => pin.path === run.inputs.appIR);
    const appIRPath = await resolveOutputPin(appIRPin);
    const recomputed = checkBackendConformance({ appIR: await json(appIRPath), fixture,
      nativeTrace: native, directTrace: direct, browserEvidence: browser, schedule, pins: check.pins });
    assert.deepEqual(recomputed, check, `${name}: checker recomputation differs from raw check record`);
    assert.equal(manifest.schema, "gobi.backend-conformance-manifest/v1");
    assert.deepEqual(manifest.sourcePins.before, run.sourcePinsBefore);
    assert.deepEqual(manifest.sourcePins.after, run.sourcePinsAfter);
    assert.deepEqual(manifest.outputPins, run.outputPins);
    assert.equal(run.summary.ticks, check.ticks);
    assert.equal(run.summary.swaps, check.swaps);
    assert.equal(run.summary.focusSwaps, check.focusSwaps);
    assert.equal(run.summary.mutationControlsDetected, check.mutationControlsDetected);

    totalTicks += check.ticks;
    totalSwaps += check.swaps;
    totalFocus += focusSwaps;
    totalControls += check.mutationControlsDetected;
    summary.push({ fixture: name, status: check.status, ticks: check.ticks, swaps: check.swaps,
      focusSwaps, mutationControlsDetected: check.mutationControlsDetected });
  }
  assert.deepEqual({ ticks: totalTicks, swaps: totalSwaps, focusSwaps: totalFocus, mutationControlsDetected: totalControls },
    { ticks: 43, swaps: 37, focusSwaps: 9, mutationControlsDetected: 45 });
  assert.deepEqual(lifetime, { disabledSuppressedActions: 15, retiredRendererCallbackInvocations: 1,
    activeMissingTargetDriverAttempts: 2, retainedActiveRendererCallbackInvocations: 1 });

  const oldAudit = await readFile(join(PACKET, "lanes/harness/history/832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb/audit_ci_harness.mjs"), "utf8");
  const finalAudit = await readFile(join(PACKET, "lanes/harness/audit_ci_harness.mjs"), "utf8");
  const parseSourcePins = (text) => Object.fromEntries([...text.split("const knownSources = {")[1].split("};")[0]
    .matchAll(/"([^\"]+)":\s*"([0-9a-f]{64})"/g)].map((match) => [match[1], match[2]]));
  const oldPins = parseSourcePins(oldAudit);
  const finalPins = parseSourcePins(finalAudit);
  const changedPriorPins = Object.keys(oldPins).filter((path) => oldPins[path] !== finalPins[path]);
  assert.deepEqual(changedPriorPins, [], "source oracles/renderer/checker/runtime changed among prior pinned harness sources");
  const newPins = Object.keys(finalPins).filter((path) => !(path in oldPins));
  assert.deepEqual(newPins.sort(), [
    "compiled-frontend/frontend/dom/renderer.test.mjs",
    "compiled-frontend/frontend/react/renderer.browser.test.mjs",
  ].sort());
  const currentHashes = {};
  for (const [path, expected] of Object.entries(finalPins)) {
    const content = await bytes(resolve(ROOT, path));
    currentHashes[path] = sha(content);
    assert.equal(currentHashes[path], expected, `published-source pin differs: ${path}`);
  }

  const preflightMismatch = await readFile(join(PACKET, "lanes/harness/audit-preflight-pin-mismatch.log"), "utf8");
  const eexist = await readFile(join(PACKET, "lanes/harness/audit-node22.log"), "utf8");
  const canonicalSuccess = await readFile(join(PACKET, "lanes/harness/audit-node22-success.log"), "utf8");
  assert.match(preflightMismatch, /published source hash differs for compiled-frontend\/frontend\/react\/renderer\.browser\.test\.mjs/);
  assert.match(eexist, /EEXIST/);
  assert.match(canonicalSuccess, /"status":"accepted"/);
  assert.match(canonicalSuccess, /"ticks":43,"swaps":37,"focusSwaps":9,"controls":45/);

  const report = await bytes(join(PACKET, "coordination/reports/E-CI-HARNESS.md"));
  const receipt = await json(join(PACKET, "coordination/receipts/E-CI-HARNESS.json"));
  assert.equal(sha(report), "c28a1ffdd9d7ae900f3a59a015bc9fd5b00f802e5b73495121f4289b9de88ebf");
  assert.equal(receipt.outcome, "confirmed_reuse");
  assert.equal(receipt.evidence.audit.trackedInputCount, 949);

  const result = {
    schema: "gobi.xr-ci-harness-audit/v1",
    job_id: "XR--CI-HARNESS",
    worker: "N1",
    decision: "accepted",
    primary: {
      commit: provenance.sourceHead,
      tree: provenance.sourceTree,
      run: provenance.run,
      job: provenance.job,
      artifact: provenance.artifact,
      event: provenance.event,
      artifactSha256: sha(primaryArchive),
      archiveBytes: primaryArchive.length,
    },
    independentCounts: {
      retainedArchiveFiles: extractedFiles.length,
      topLevelSourcePins: execution.sourceBefore.length,
      externalPrimaryInputs: extraPrimaryPaths.length,
      uniqueTrackedInputs: trackedUnique.size,
    },
    fixtureMatrix: summary,
    totals: { ticks: totalTicks, swaps: totalSwaps, focusSwaps: totalFocus,
      mutationControlsDetected: totalControls, lifetime },
    sourceReview: {
      priorPinnedSourceChanges: changedPriorPins,
      newlyPinnedPaths: newPins.sort(),
      currentSourceHashes: currentHashes,
      oracleAndCheckerRecomputedFromRawCaptures: true,
    },
    retainedAuditHistory: {
      stalePinMismatchPreserved: true,
      defaultPathEEXISTPreserved: true,
      uniquePathSuccessPreserved: true,
      noncanonicalPreExecutionRecordNotUsed: true,
    },
    limitations: [
      "This is a read-only recomputation of the supplied immutable CI artifact, not a native or browser rerun.",
      "Acceptance covers this successful push artifact only; the separately tracked synthetic PR run and the full PR gate remain separate.",
      "Retained callback evidence proves invocation of the captured callback, not native DOM listener delivery.",
    ],
  };
  const output = join(dirname(SCRIPT), "independent-audit-final.json");
  const content = `${JSON.stringify(result, null, 2)}\n`;
  await import("node:fs/promises").then(({ writeFile }) => writeFile(output, content, { flag: "wx" }));
  process.stdout.write(`${JSON.stringify({ decision: result.decision, totals: result.totals,
    uniqueTrackedInputs: result.independentCounts.uniqueTrackedInputs, output: relative(ROOT, output) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
