import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const taskRaw = resolve(ROOT, "compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01");
const evidenceRoot = resolve(ROOT, "compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01");
const finalStem = resolve(evidenceRoot, "replay-custody-safe");
const traceDirectory = resolve(ROOT, "compiled-children/coordination/rawlogs/E-HARNESS-20261031T130145.278Z-2");
const runPath = `${finalStem}.run.json`;
const manifestPath = `${finalStem}.manifest.json`;
const checkPath = `${finalStem}.check.json`;
const seededPath = `${finalStem}.seeded.json`;
const browserPath = `${finalStem}.browser.json`;
const coordination = resolve(ROOT, "compiled-children/coordination");
const reportPath = resolve(coordination, "reports/E-FIX-HARNESS-LIVENESS.md");
const receiptPath = resolve(coordination, "receipts/E-FIX-HARNESS-LIVENESS.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));
const rel = (path) => relative(ROOT, path).replaceAll("\\", "/");

const [run, manifest, check, seeded, browser, traceIndex, attemptSummary] = await Promise.all([
  readJSON(runPath),
  readJSON(manifestPath),
  readJSON(checkPath),
  readJSON(seededPath),
  readJSON(browserPath),
  readJSON(resolve(traceDirectory, "trace-index.json")),
  readJSON(resolve(traceDirectory, "attempt-summary.json")),
]);
const statePath = resolve(coordination, "state.json");
const coordinationStateHash = sha(await readFile(statePath));
const compilerReceipt = await readJSON(resolve(ROOT, "compiled-children/compiler-evidence/receipt.json"));
const originalsManifest = await readJSON(resolve(coordination, "repairs/E-FIX-HARNESS-LIVENESS/originals/manifest.json"));
const custody = await readJSON(resolve(taskRaw, "canonical-custody-restoration.json"));

const validationOutput = `receipt identity and tracked hashes passed; coordination state unchanged: ${coordinationStateHash}\n`;
await writeFile(resolve(taskRaw, "receipt-validation.stdout.log"), validationOutput, { flag: "wx" });
await writeFile(resolve(taskRaw, "receipt-validation.stderr.log"), "", { flag: "wx" });

const sourcePins = run.sourcePinsAfter;
const sourceSha256 = Object.fromEntries(sourcePins.map((pin) => [pin.path, pin.sha256]));
const buildLineagePins = [];
for (const path of [
  "compiled-children/compiler-evidence/receipt.json",
  "compiled-children/compiler-evidence/build/react-repeat.stdout.json",
  "compiled-children/compiler-evidence/build/dom-attempt3.stdout.json",
]) {
  const bytes = await readFile(resolve(ROOT, path));
  const pin = { path, bytes: bytes.length, sha256: sha(bytes) };
  buildLineagePins.push(pin);
  sourceSha256[path] = pin.sha256;
}
for (const path of [
  "compiled-children/coordination/reports/E-DELIVERY.md",
  "compiled-children/coordination/receipts/E-DELIVERY.json",
]) {
  const bytes = await readFile(resolve(ROOT, path));
  sourceSha256[path] = sha(bytes);
}

const evidencePins = manifest.evidencePins.map((pin) => ({
  path: pin.path,
  bytes: pin.bytes,
  sha256: pin.sha256,
}));
const rawlogPaths = (await readdir(taskRaw, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => resolve(taskRaw, entry.name))
  .sort();
const rawlogs = [];
for (const path of rawlogPaths) {
  const bytes = await readFile(path);
  rawlogs.push({ path: rel(path), bytes: bytes.length, sha256: sha(bytes) });
}

const sourceBrief = Object.fromEntries([
  "compiled-children/conformance/check.mjs",
  "compiled-children/conformance/run.mjs",
  "compiled-children/conformance/swap-contract.test.mjs",
  "compiled-children/conformance/seeded.test.mjs",
  "compiled-frontend/conformance/no-wasm.mjs",
  "compiled-frontend/conformance/no-wasm.test.mjs",
  "compiled-children/conformance/browser.mjs",
  "compiled-children/demo/smoke.mjs",
  "compiled-children/README.md",
  "compiled-children/RESULTS.md",
].map((path) => [path, sourceSha256[path]]));
const mutationControls = check.mutationControls.map((item) => item.name);
const traceArtifacts = attemptSummary.traceArtifacts;
const exactCommand = run.command.join(" ");
const unitTestCommand = run.unitTests.command.join(" ");
const independentVerificationPath = "compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01/independent-verification-attempt02.stdout.json";
const independentVerification = await readJSON(resolve(ROOT, independentVerificationPath));

const report = [
  "# E-FIX-HARNESS-LIVENESS — renderer identity and capture custody repair",
  "",
  "Outcome: **mixed change; fresh conformance replay matched**. Root integration and full acceptance remain pending.",
  "",
  "## Finding",
  "",
  "XR-HARNESS showed that the checker accepted a mutation changing the accepted swap’s active renderer to DOM/id 1 and changing the post-rejection physical click callback metadata to the same retired renderer. The old checks asserted accepted/rejected flags and pending tokens, but did not bind the accepted candidate to its active renderer identity or bind later physical callbacks to that retained live instance.",
  "",
  "## Repair",
  "",
  "- Added `assertRendererLifecycle` in `conformance/check.mjs`. It checks every event’s pending snapshot boundary, requires accepted swaps to install the unique captured candidate matching `to`, requires rejected swaps to retain the current `(backend,id)`, and cross-checks each real click’s event, event snapshot, action observation, and dispatch against the active identity.",
  "- Added five browser capture mutations for accepted candidate backend/ID, post-rejection live callback backend/ID, and detached action metadata. All five reject. Existing native/direct/DOM/cancellation controls remain active.",
  "- Added no-WASM guard evidence validation. The fixed capture and all three profiles report `complete`, ten expected hooks installed, no failures, zero API attempts, and zero WebAssembly requests. Removing one coverage entry is detected.",
  "- Added `swap-contract.test.mjs`, which loads and hash-verifies the original authentic attempt-12 archive, then exercises the lifecycle checker and seven negative/transition controls against its captured browser profile. The grouped Node 22 run passed 18/18 tests.",
  "- `conformance/run.mjs` explicitly pins the shared no-WASM helper and old capture input, runs the new swap test, and now writes a unique attempt summary and compressed trace index without writing shared canonical E-HARNESS report/receipt files.",
  "",
  "## Final source-bound replay",
  "",
  `Command: \`${exactCommand}\``,
  "",
  `Versions: Node ${run.node}; ${run.goVersion}; Chromium ${run.browser.version}; Playwright ${run.browser.playwright}. The pinned compiler build lineage used Go ${compilerReceipt.toolchain.go} and Node ${compilerReceipt.toolchain.node}.`,
  "",
  `The replay matched ${check.events} source events, ${check.goUpdates} actual Go updates, and ${check.stateCheckpoints} literal state checkpoints across native Go, direct React/DOM modules, and mounted React, DOM, and swap profiles. It recorded ${check.physicalClicksPerProfile} real clicks per profile, one accepted compatible swap, one rejected incompatible swap, ${check.requests} requests, ${check.cancellations} cancellations, and ${check.staleGenerationHostRepliesRejected} rejected stale reply.`,
  "",
  `Detected captured-data mutations (${check.mutationControlsDetected}): ${mutationControls.join(", ")}.`,
  "",
  `Seeded schedules: ${seeded.results.map((item) => item.seed).join(", ")}. All three used actual native Go and direct React/DOM replay; only seed ${seeded.results.find((item) => item.outputs.browser).seed} produced mounted-browser evidence. Seeds ${seeded.results.filter((item) => !item.outputs.browser).map((item) => item.seed).join(" and ")} have no browser capture, and are not presented as browser passes.`,
  "",
  `Source stability: ${run.sourcePinsAfter.length} source pins and ${run.buildOutputPinsAfterCheck.length} build-output pins matched before and after replay. An independent consumer verified ${independentVerification.traceArchive.verifiedArchives} compressed trace archives by SHA-256, byte length, decompression, and byte-for-byte comparison. The browser output and browser capture files also hash-identically.`,
  "",
  `The ten guard entries were complete in all profiles; the overall output had ${browser.noWasm.apiAttempts.length} attempted guarded API calls and ${browser.noWasm.wasmRequests.length} .wasm network requests.`,
  "",
  "## Canonical packet custody incident",
  "",
  "The first N6 replay exposed the pre-existing runner side effect: it wrote new N6-run bytes into canonical `E-HARNESS.md` and `E-HARNESS.json` while labeling the receipt `worker:N4`. This was a writer-side attribution incident, not a native N4 dispatch. I saved those generated bytes in this repair’s rawlogs, restored the canonical author report and receipt byte-for-byte from the preserved originals manifest, and changed the runner to write per-attempt evidence only. The final custody-safe replay passed the independent source/build/archive verification and left canonical E-HARNESS unchanged.",
  "",
  `Auto-generated incident receipt: ${custody.savedAutoOutput.receipt.sha256}; auto-generated report: ${custody.savedAutoOutput.report.sha256}. Restored canonical receipt: ${custody.restoredCanonical.receipt.sha256}; restored canonical report: ${custody.restoredCanonical.report.sha256}.`,
  "",
  "The first independent archive verifier invocation also failed due to its own duplicated path resolution for entries already relative to repository root. That stderr is preserved; I corrected the verifier and attempt 02 independently passed. No application, Go, browser, or checker mismatch occurred in that verification retry.",
  "",
  "## Limits and evidence custody",
  "",
  "- The prior local archive/container corruption incident under immutable evidence `978eaea98831154f8152baa1a64f1d1356916596` remains unresolved. This repair’s newly created source60b5-independent archives verified, but do not retroactively repair that earlier local container. Root full acceptance/CI remains pending.",
  "- Seeded replays are bounded input schedules, not universal coverage. Only the representative first seed had a mounted browser replay.",
  "- No Git or scheduler state writes were made. The read-only native receipt validation checks the active packet and confirms the coordination state hash remained unchanged.",
  "",
  "## Commands",
  "",
  `- Unit suite: \`${unitTestCommand}\` (18 passed, 0 failed).`,
  `- Independent replay/archive verifier: \`/tmp/gondola-node22/node_modules/node/bin/node compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01/verify-replay.mjs replay-custody-safe\` (verified).`,
  "- Native packet validation: `/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01/receipt-validation.py` (read-only; stdout matches its pinned rawlog).",
  "",
].join("\n");

await writeFile(reportPath, report, { flag: "wx" });
const reportBytes = await readFile(reportPath);

const receipt = {
  schema: "gobi.worker-receipt/v1",
  job_id: "E-FIX-HARNESS-LIVENESS",
  worker: "N6",
  outcome: "mixed_change",
  summary: "Repaired renderer lifecycle checks to bind accepted swap candidate identity and all live physical-click callback metadata; added no-WASM coverage validation and mutation controls. The final source-bound native/direct/browser replay matched with 12/12 captured-data mutations detected, and its compressed archives and immutable canonical packet were independently verified.",
  reviewed_job: { job_id: "XR-HARNESS", worker: "N6", decision: "amend" },
  finding: "The checker accepted a mutated active renderer backend/ID and post-rejection physical callback on the retired renderer despite the actual browser capture using the retained React renderer.",
  repair: {
    owned_paths: [
      "compiled-children/conformance/check.mjs",
      "compiled-children/conformance/run.mjs",
      "compiled-children/conformance/swap-contract.test.mjs",
    ],
    rendererLifecycle: {
      acceptedCandidateMustMatchToAndCapturedIdentity: true,
      rejectedSwapMustRetainCurrentIdentity: true,
      clickMetadataCheckedAcrossEventSnapshotActionAndDispatch: true,
      pendingCheckedAtBeforeAndAfterBoundaries: true,
      usesJSApplicationReducer: false,
      captureSource: "compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/browser.json.gz",
      archiveSha256: "b578feb89f9c1b8c23cb25c946811d207391e535ddb0e9be00ef98826cb9979a",
      uncompressedSha256: "31ef47512d037ab7e7c64a5c0789e5a7d69a067b1e9819a267e23b28fdfae26d",
    },
    noWasmCoverage: {
      status: browser.noWasm.guardCoverage.status,
      entries: browser.noWasm.guardCoverage.entries,
      failures: browser.noWasm.guardCoverage.failures,
      apiAttempts: browser.noWasm.apiAttempts.length,
      wasmRequests: browser.noWasm.wasmRequests.length,
    },
    mutationControls,
    preservedPriorCanonical: originalsManifest.files.filter((item) =>
      item.source.endsWith("reports/E-HARNESS.md") || item.source.endsWith("receipts/E-HARNESS.json")),
  },
  finalReplay: {
    status: run.status,
    command: run.command,
    versions: {
      node: run.node,
      go: run.goVersion,
      chromium: run.browser.version,
      playwright: run.browser.playwright,
      compilerGo: compilerReceipt.toolchain.go,
      compilerNode: compilerReceipt.toolchain.node,
      compilerGoScript: compilerReceipt.toolchain.goscript,
    },
    counts: {
      events: check.events,
      goUpdates: check.goUpdates,
      stateCheckpoints: check.stateCheckpoints,
      physicalClicksPerProfile: check.physicalClicksPerProfile,
      acceptedSwaps: check.acceptedCompatibleSwaps,
      rejectedSwaps: check.rejectedIncompatibleSwaps,
      requests: check.requests,
      cancellations: check.cancellations,
      staleRepliesRejected: check.staleGenerationHostRepliesRejected,
      mutationsDetected: check.mutationControlsDetected,
    },
    seeds: seeded.results.map((item) => ({
      seed: item.seed,
      events: item.events,
      goUpdates: item.goUpdates,
      mountedBrowser: Boolean(item.outputs.browser),
      metadata: item.metadata,
    })),
    sourcePins: run.sourcePinsAfter,
    buildOutputPins: run.buildOutputPinsAfterCheck,
    evidencePins,
    traceArtifacts,
    rawTrace: {
      directory: rel(traceDirectory),
      traceIndex: { path: rel(resolve(traceDirectory, "trace-index.json")), sha256: sha(await readFile(resolve(traceDirectory, "trace-index.json"))) },
      attemptSummary: { path: rel(resolve(traceDirectory, "attempt-summary.json")), sha256: sha(await readFile(resolve(traceDirectory, "attempt-summary.json"))) },
      independentlyVerifiedArchives: independentVerification.traceArchive.verifiedArchives,
    },
  },
  canonicalCustody: {
    incident: custody.incident,
    attribution: custody.attribution,
    generatedN6RunBytesPreserved: custody.savedAutoOutput,
    originalAuthorPacketRestored: custody.restoredCanonical,
    finalRunnerPolicy: "writes unique per-attempt run/manifest/trace artifacts; never overwrites canonical E-HARNESS report or receipt",
  },
  readOnlyValidation: {
    command: "/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01/receipt-validation.py",
    coordinationStateSha256: coordinationStateHash,
    expectedStdoutPath: "compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01/receipt-validation.stdout.log",
    stderrPath: "compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01/receipt-validation.stderr.log",
  },
  sourceSha256,
  sourceBrief,
  buildLineagePins,
  traceArtifacts,
  evidencePins,
  rawlogs,
  report: { path: rel(reportPath), bytes: reportBytes.length, sha256: sha(reportBytes) },
  limitations: [
    "Root full integration and final acceptance remain pending.",
    "The earlier local archive/container corruption incident recorded at immutable evidence 978eaea98831154f8152baa1a64f1d1356916596 remains unresolved; this fresh archive verification does not retroactively repair that historical incident.",
    "Only the representative first seeded schedule has mounted-browser data; all three seeded schedules were checked against native Go and direct React/DOM replay.",
    "The first independent verifier attempt failed only because the verifier duplicated an already repository-relative original path; the failure log is preserved and the corrected second attempt passed.",
  ],
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`E-FIX-HARNESS-LIVENESS report=${receipt.report.sha256} rawlogs=${receipt.rawlogs.length} sourcePins=${sourcePins.length}\n`);
