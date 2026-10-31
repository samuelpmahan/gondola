import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = resolve(process.cwd());
const DATE_ROOT = join(ROOT, "compiled-backends/ci/2026-10-31");
const EXTRACTED = join(DATE_ROOT, "extracted");
const FRONTEND = join(EXTRACTED, "compiled-frontend/artifacts");
const BACKENDS = join(EXTRACTED, "compiled-backends/artifacts");
const EXPECTED_COMMIT = "195c9433179218348d4b9f2477ae1e0725337d15";
const EXPECTED_TREE = "c0e4a66eee3fdd8b789e1b565167856fdab62433";
const RUNTIME = "compiled-frontend/frontend/runtime/runtime.mjs";
const RUNTIME_TEST = "compiled-frontend/frontend/runtime/runtime.test.mjs";

async function bytes(path) { return readFile(path); }
async function digest(path) { return createHash("sha256").update(await bytes(path)).digest("hex"); }
function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}
function json(value, label) {
  try { return JSON.parse(value); } catch (error) { throw new Error(`${label}: ${error.message}`); }
}
function must(condition, message) { assert.ok(condition, message); }

async function walkFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walkFiles(path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`unsupported extracted artifact entry ${path}`);
  }
  return result;
}

async function checkPinArray(pins, label) {
  must(Array.isArray(pins), `${label} is not an array`);
  const seen = new Set();
  for (const pin of pins) {
    must(typeof pin.path === "string" && typeof pin.sha256 === "string", `${label} has malformed pin`);
    must(!seen.has(pin.path), `${label} has duplicate path ${pin.path}`);
    seen.add(pin.path);
    const path = join(ROOT, pin.path);
    must(await digest(path) === pin.sha256, `${label} differs from current source: ${pin.path}`);
  }
  return pins.length;
}

async function main() {
  const head = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  must(head === EXPECTED_COMMIT && tree === EXPECTED_TREE, "checkout identity differs from published source");

  const [provenance, run, jobs, artifact, index, front, backend, tap, stderr, jobLog] = await Promise.all([
    bytes(join(DATE_ROOT, "primary-provenance.json")).then((v) => json(v, "primary provenance")),
    bytes(join(DATE_ROOT, "primary-run.json")).then((v) => json(v, "primary run")),
    bytes(join(DATE_ROOT, "primary-jobs.json")).then((v) => json(v, "primary jobs")),
    bytes(join(DATE_ROOT, "artifact.json")).then((v) => json(v, "artifact metadata")),
    bytes(join(DATE_ROOT, "retained-index.json")).then((v) => json(v, "retained index")),
    bytes(join(FRONTEND, "execution.json")).then((v) => json(v, "compiled-frontend execution")),
    bytes(join(BACKENDS, "execution.json")).then((v) => json(v, "compiled-backends execution")),
    bytes(join(FRONTEND, "logs/node-tests.stdout.log")),
    bytes(join(FRONTEND, "logs/node-tests.stderr.log")),
    bytes(join(DATE_ROOT, "logs/124401386239.log")),
  ]);

  const primary = {
    provenanceSha256: await digest(join(DATE_ROOT, "primary-provenance.json")),
    runSha256: await digest(join(DATE_ROOT, "primary-run.json")),
    jobsSha256: await digest(join(DATE_ROOT, "primary-jobs.json")),
    artifactMetadataSha256: await digest(join(DATE_ROOT, "artifact.json")),
    jobLogSha256: createHash("sha256").update(jobLog).digest("hex"),
    artifactZipSha256: await digest(join(DATE_ROOT, "original.zip")),
    artifactZipBytes: (await stat(join(DATE_ROOT, "original.zip"))).size,
    retainedIndexSha256: await digest(join(DATE_ROOT, "retained-index.json")),
    retainedIndexEntries: index.length,
  };
  must(provenance.source_head === EXPECTED_COMMIT || provenance.sourceHead === EXPECTED_COMMIT, "provenance source head mismatch");
  must(provenance.source_tree === EXPECTED_TREE || provenance.sourceTree === EXPECTED_TREE, "provenance source tree mismatch");
  must(primary.artifactZipSha256 === "646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa", "provider ZIP digest mismatch");
  must(primary.artifactZipBytes === 14931201 && index.length === 817, "provider archive size/index count mismatch");
  must(run.id === 41155530877 && run.event === "push" && run.status === "completed" && run.conclusion === "success", "primary run identity/status mismatch");
  must(jobs.jobs?.some((job) => job.id === 124401386239 && job.conclusion === "success"), "primary job is not successful");
  const artifactItem = artifact.artifacts?.find((item) => item.id === 13025112465);
  must(artifactItem?.size_in_bytes === 14931201 && artifactItem.digest === `sha256:${primary.artifactZipSha256}`, "artifact metadata identity/size/digest mismatch");
  const jobLogText = jobLog.toString("utf8");
  must(primary.jobLogSha256 === "c647178d63605521abb5c60ae780703cec06a6e9137dcd22b39b2f10d28d7bcb", "primary raw job log digest mismatch");
  must(jobLogText.includes("##[group]Run bash run-compiled-backends.sh") &&
    jobLogText.includes("Artifact gobi-compiled-backends-artifacts has been successfully uploaded") &&
    jobLogText.includes(primary.artifactZipSha256), "primary job log lacks full runner or matching artifact upload evidence");

  const extractedFiles = await walkFiles(EXTRACTED);
  const extractedMap = new Map(extractedFiles.map((path) => [relative(EXTRACTED, path).split("\\").join("/"), path]));
  must(extractedMap.size === index.length, `extraction has ${extractedMap.size} files, index has ${index.length}`);
  for (const item of index) {
    const path = extractedMap.get(item.path);
    must(path, `retained index member missing: ${item.path}`);
    const file = await bytes(path);
    must(file.length === item.bytes, `retained member size mismatch: ${item.path}`);
    must(createHash("sha256").update(file).digest("hex") === item.sha256, `retained member digest mismatch: ${item.path}`);
  }

  const runtimeHash = await digest(join(ROOT, RUNTIME));
  const runtimeTestHash = await digest(join(ROOT, RUNTIME_TEST));
  must(runtimeHash === "dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4", "current runtime source hash differs from final packet");
  must(runtimeTestHash === "39790809f3392bb47b3f48d17bfdc40b6fe8628961513f0b1ddf3e69a014e907", "current runtime test hash differs from final packet");

  const frontendBefore = await checkPinArray(front.sourceBefore, "compiled-frontend sourceBefore");
  const frontendAfter = await checkPinArray(front.sourceAfter, "compiled-frontend sourceAfter");
  const backendBefore = await checkPinArray(backend.sourceBefore, "compiled-backends sourceBefore");
  const backendAfter = await checkPinArray(backend.sourceAfter, "compiled-backends sourceAfter");
  must(frontendBefore === 122 && frontendAfter === 122, "compiled-frontend pin count mismatch");
  must(backendBefore === 126 && backendAfter === 126, "compiled-backends pin count mismatch");
  must(front.status === "passed" && front.mismatches === 0 && front.commands.length === 33 && front.commands.every((command) => command.exitCode === 0), "compiled-frontend execution failed or incomplete");
  must(backend.status === "passed" && backend.mode === "full" && backend.commands.length === 18 && backend.commands.every((command) => command.exitCode === 0) && backend.failures.length === 0 && backend.sourcePinsMatch, "compiled-backends full execution failed or incomplete");

  const nodeTests = front.commands.find((command) => command.name === "node-tests");
  must(nodeTests && nodeTests.exitCode === 0 && nodeTests.command.endsWith("/node/22.23.4/x64/bin/node"), "Node test command or status differs");
  must(nodeTests.args[0] === "--test" && nodeTests.args.includes("/home/runner/work/gondola/gondola/compiled-frontend/frontend/runtime/runtime.test.mjs"), "runtime test is absent from actual argv");
  must(createHash("sha256").update(tap).digest("hex") === nodeTests.stdoutSha256, "node-tests stdout digest mismatch");
  must(createHash("sha256").update(stderr).digest("hex") === nodeTests.stderrSha256, "node-tests stderr digest mismatch");
  const tapText = tap.toString("utf8");
  must(/^1\.\.97$/m.test(tapText) && /^# tests 97$/m.test(tapText) && /^# pass 97$/m.test(tapText) && /^# fail 0$/m.test(tapText), "97-test TAP summary mismatch");
  const runtimeSource = (await bytes(join(ROOT, RUNTIME_TEST))).toString("utf8");
  const runtimeTestNames = [...runtimeSource.matchAll(/^test\("([^\n]+?)",/gm)].map((match) => match[1]);
  const tapTests = [...tapText.matchAll(/^ok (\d+) - (.+)$/gm)].map((match) => ({ number: Number(match[1]), name: match[2] }));
  const runtimeTapBlock = tapTests.filter(({ number }) => number >= 71 && number <= 97);
  must(runtimeTestNames.length === 27 && runtimeTapBlock.length === 27, "runtime TAP block count differs from runtime test declarations");
  must(runtimeTestNames.every((name, index) => runtimeTapBlock[index].name === name), "runtime TAP block names do not match runtime.test.mjs in order");

  const browserVersions = [...new Set(front.apps.map((app) => app.browser))];
  must(front.apps.length === 5 && front.apps.every((app) => app.status === "matched"), "compiled-frontend browser application profiles are not all matched");
  must(browserVersions.length === 1 && browserVersions[0] === "156.0.8078.4", "browser application profile versions differ");
  const versions = {
    node: front.versions.node,
    compiledGo: front.versions.go,
    rootGo: front.versions.rootGo,
    react: front.versions.react,
    reactDOM: front.versions["react-dom"],
    esbuild: front.versions.esbuild,
    playwright: front.versions.playwright,
    chromium: browserVersions[0],
    backendNode: backend.versions.node,
  };
  must(versions.node === "v22.23.4" && versions.backendNode === "v22.23.4", "Node version mismatch");
  must(versions.compiledGo === "go version go1.27.3 linux/amd64" && versions.rootGo === "go version go1.24.13 linux/amd64", "Go version mismatch");
  must(versions.react === "19.3.1" && versions.reactDOM === "19.3.1" && versions.playwright === "1.64.1" && versions.chromium === "156.0.8078.4", "browser toolchain mismatch");

  const fixtureNames = ["counter", "form", "list", "effect", "list-growth"];
  const integration = {};
  for (const name of fixtureNames) {
    const checkPath = join(BACKENDS, `conformance/${name}.json.check.json`);
    const browserPath = join(BACKENDS, `conformance/${name}.json.browser.json`);
    const check = json(await bytes(checkPath), `${name} backend check`);
    const browser = json(await bytes(browserPath), `${name} browser record`);
    must(check.status === "matched" && Object.values(check.backends).every((value) => value === "matched"), `${name} backend check is not matched`);
    must(browser.pageErrors.length === 0 && browser.noWasm.wasmRequests.length === 0 && browser.noWasm.wasmAPIAttempts.length === 0, `${name} browser error or WASM activity`);
    must(browser.unmount.result === true && browser.unmount.physical.html === "" && browser.unmount.physical.controls === 0 &&
      browser.unmount.rendererSnapshot.html === "" && browser.unmount.rendererSnapshot.controls.length === 0, `${name} did not empty physical and renderer snapshots after unmount`);
    integration[name] = { status: check.status, backends: check.backends, ticks: check.ticks, swaps: check.swaps,
      focusSwaps: check.focusSwaps, mutationControlsDetected: check.mutationControlsDetected,
      pageErrors: browser.pageErrors.length, wasmRequests: browser.noWasm.wasmRequests.length,
      wasmAPIAttempts: browser.noWasm.wasmAPIAttempts.length, emptyAfterUnmount: true };
  }
  const effectBrowser = json(await bytes(join(BACKENDS, "conformance/effect.json.browser.json")), "effect browser record");
  const effectSwapEvents = effectBrowser.profiles.swap.swapObservations.events;
  const effectPendingSwap = effectSwapEvents.find((event) => {
    const tick = event.beforeTrace.ticks.at(-1);
    return tick?.state.fields.some((field) => field.name === "Pending" && field.value.bool === true);
  });
  must(effectPendingSwap, "effect profile has no swap while a request is pending");
  assert.deepStrictEqual(effectPendingSwap.afterTrace, effectPendingSwap.beforeTrace, "effect swap changes the Go application trace");
  must(effectPendingSwap.hostRequestsBefore.length === 1 && effectPendingSwap.hostRequestsAfter.length === 1 &&
    effectPendingSwap.hostCompletionsBefore.length === 0 && effectPendingSwap.hostCompletionsAfter.length === 0,
  "effect request/completion correlation changes during pending swap");

  const result = {
    schema: "gobi.xr-ci-runtime-review-audit/v1",
    job_id: "XR--CI-RUNTIME",
    worker: "N3",
    outcome: "accepted",
    source: { commit: head, tree, runtimeSha256: runtimeHash, runtimeTestSha256: runtimeTestHash },
    primary,
    artifactIntegrity: { extractedFiles: extractedFiles.length, allIndexEntriesMatch: true },
    sourcePins: {
      compiledFrontend: { before: frontendBefore, after: frontendAfter, currentCheckoutMatchesAll: true },
      compiledBackends: { before: backendBefore, after: backendAfter, currentCheckoutMatchesAll: true },
    },
    executions: {
      compiledFrontend: { status: front.status, childCommands: front.commands.length, mismatches: front.mismatches },
      compiledBackends: { mode: backend.mode, status: backend.status, commands: backend.commands.length, failures: backend.failures.length, sourcePinsMatch: backend.sourcePinsMatch },
    },
    nodeTests: {
      command: [nodeTests.command, ...nodeTests.args],
      cwd: nodeTests.cwd,
      exitCode: nodeTests.exitCode,
      stdoutSha256: nodeTests.stdoutSha256,
      stderrSha256: nodeTests.stderrSha256,
      tap: { total: 97, passed: 97, failed: 0, runtimeFirst: 71, runtimeLast: 97, runtimePassed: 27, runtimeNamesMatchSource: true },
      runtimeTestNames,
    },
    versions,
    integration,
    effectPendingSwap: {
      afterActionIndex: effectPendingSwap.afterActionIndex,
      from: effectPendingSwap.from,
      to: effectPendingSwap.to,
      traceUnchanged: true,
      pendingStatePreserved: true,
      requestCountPreserved: true,
      completionCountPreserved: true,
      oldRootDetached: effectPendingSwap.oldRootDetached,
      oldRootEmpty: effectPendingSwap.oldRootEmptyDuringSwap,
    },
    limits: [
      "The primary evidence is a full successful push run at the published commit; separate synthetic PR run status is not inferred.",
      "The review verifies archived runtime test and integration evidence; it does not rerun the browser matrix.",
      "The runtime is a synchronous trusted-renderer protocol, not an arbitrary Proxy/getter sandbox. Regular functions returning thenables are detected only after invocation; replacement observation failures after teardown fail closed without rollback.",
      "Coverage is bounded to the recorded deterministic fixture/apps and Chromium version; this does not establish other browser engines, hydration, concurrent React, arbitrary Go modules, or production effect transport."
    ],
  };
  const out = join(ROOT, "compiled-backends/ci/2026-10-31/lanes/reviews/xr-ci-runtime/audit-accepted.json");
  await (await import("node:fs/promises")).writeFile(out, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: result.outcome, sourcePins: [frontendBefore, backendBefore], runtimeTAP: "27/27", output: relative(ROOT, out) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
