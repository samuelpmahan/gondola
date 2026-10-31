import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const ci = path.join(root, 'compiled-frontend/ci/2026-10-30');
const provider = path.join(ci, 'provider');
const extracted = path.join(provider, 'extracted');
const artifactRoot = path.join(extracted, 'compiled-frontend/artifacts');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const execution = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'execution.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(extracted, 'extraction-manifest.json'), 'utf8'));
const published = JSON.parse(fs.readFileSync(path.join(provider, 'published-commit.json'), 'utf8'));
const workflowSnapshot = JSON.parse(fs.readFileSync(path.join(provider, 'initial-workflows.json'), 'utf8'));
const zip = path.join(provider, 'downloads/run-41140265213.zip');
const zipHash = sha256(fs.readFileSync(zip));
const verifiedExtractedFiles = [];
const extractedMismatches = [];
for (const item of manifest.compilerFiles ?? []) {
  if (!item.path.startsWith('compiled-frontend/artifacts/')) continue;
  const file = path.join(extracted, item.path);
  if (!fs.existsSync(file)) { extractedMismatches.push({ path: item.path, reason: 'missing' }); continue; }
  const bytes = fs.readFileSync(file);
  if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) {
    extractedMismatches.push({ path: item.path, reason: 'hash-or-byte-length-mismatch' });
  } else verifiedExtractedFiles.push(item.path);
}
const sourceMatched = [];
const sourceMismatches = [];
for (const pin of execution.sourceBefore ?? []) {
  const file = path.resolve(root, pin.path);
  if (!fs.existsSync(file)) { sourceMismatches.push({ path: pin.path, reason: 'missing' }); continue; }
  const actual = sha256(fs.readFileSync(file));
  if (actual !== pin.sha256) sourceMismatches.push({ path: pin.path, expected: pin.sha256, actual });
  else sourceMatched.push(pin.path);
}
const nodeLogPath = path.join(artifactRoot, 'logs/node-tests.stdout.log');
const nodeLog = fs.readFileSync(nodeLogPath, 'utf8');
const failures = [...nodeLog.matchAll(/^not ok (\d+) - (.*)$/gm)].map((match) => ({ index: Number(match[1]), name: match[2] }));
const counts = Object.fromEntries([...nodeLog.matchAll(/^# (tests|pass|fail) (\d+)$/gm)].map((match) => [match[1], Number(match[2])]));
const launchErrors = [...nodeLog.matchAll(/error: "([^"]+)"/g)].map((match) => match[1]);
const commandNames = execution.commands.map((command) => command.name);
const noWasmSourcePath = path.join(root, 'compiled-frontend/conformance/no-wasm.test.mjs');
const noWasmSource = fs.readFileSync(noWasmSourcePath, 'utf8');
const noWasmPin = execution.sourceBefore.find((pin) => pin.path === 'compiled-frontend/conformance/no-wasm.test.mjs');
const relevantFilesExist = fs.existsSync(path.join(extracted, 'compiled-frontend/conformance/raw'));
const currentRun = workflowSnapshot.workflow_runs.find((run) => run.id === 41140265213);
const result = {
  schema: 'gobi.ci-browser-first-attempt-audit/v1',
  workflow_binding: {
    run_id: currentRun?.id ?? null,
    workflow_name: currentRun?.name ?? null,
    provider_snapshot_status: currentRun?.status ?? null,
    provider_snapshot_conclusion: currentRun?.conclusion ?? null,
    published_head: published.sha,
    published_tree: published.tree.sha,
    published_parent: published.parents?.[0]?.sha ?? null,
    archive_sha256: zipHash,
    archive_sha256_expected: manifest.archiveSha256,
    archive_matches_extraction_manifest: zipHash === manifest.archiveSha256
  },
  execution: {
    status: execution.status,
    finished_at: execution.finishedAt,
    toolchain: execution.versions,
    command_names_in_order: commandNames,
    command_exit_codes: execution.commands.map(({ name, exitCode }) => ({ name, exitCode })),
    source_before_count: execution.sourceBefore?.length ?? 0,
    source_after_present: Array.isArray(execution.sourceAfter),
    current_source_pins_matched: sourceMatched.length,
    current_source_pin_mismatches: sourceMismatches,
    compile_four_reached: commandNames.includes('compile-four'),
    compiled_app_outputs_present: fs.existsSync(path.join(artifactRoot, 'compiled')),
    raw_browser_traces_present: relevantFilesExist
  },
  extraction: {
    compiler_artifact_files_verified: verifiedExtractedFiles.length,
    mismatches: extractedMismatches,
    execution_json_sha256: sha256(fs.readFileSync(path.join(artifactRoot, 'execution.json'))),
    node_test_log_sha256: sha256(fs.readFileSync(nodeLogPath)),
    manifest_node_test_log_sha256: manifest.compilerFiles?.find((entry) => entry.path === 'compiled-frontend/artifacts/logs/node-tests.stdout.log')?.sha256 ?? null
  },
  node_tests: {
    counts,
    failed_tests: failures,
    launch_errors: launchErrors,
    chromium_path_environment: execution.environment.CHROMIUM_PATH,
    failing_test_source_sha256: noWasmPin?.sha256 ?? null,
    source_has_tmp_chromium_fallback: /process\.env\.CHROMIUM_PATH\s*\?\?\s*["']\/tmp\/chromium["']/.test(noWasmSource),
    failed_before_guard_behavior: launchErrors.length === 2 && launchErrors.every((error) => error.includes("executable doesn't exist at /tmp/chromium"))
  },
  other_gates: {
    root_and_compiler_go_tests_race_vet_passed: execution.commands.filter((command) => ['root-go-tests','root-go-race','root-go-vet','go-tests','go-race','go-vet'].includes(command.name)).every((command) => command.exitCode === 0),
    browser_conformance_started: commandNames.some((name) => name.endsWith('-browser')),
    four_app_ci_result: 'not reached'
  },
  limits: [
    'The CI entrypoint failed in node-tests before compile-four; it produced no four-app build or browser conformance traces.',
    'The two failed tests stopped at chromium.launch because the test defaulted to /tmp/chromium while CHROMIUM_PATH was unset; the no-WASM guards did not execute in these failed tests.',
    'This is a preserved failed first attempt; CI-BROWSER remains open for the repaired workflow run.'
  ]
};
const out = path.join(ci, 'audits/CI-BROWSER/first-attempt.json');
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: out, archiveMatches: result.workflow_binding.archive_matches_extraction_manifest,
  extractedArtifactFilesVerified: result.extraction.compiler_artifact_files_verified, extractionMismatchCount: result.extraction.mismatches.length,
  sourcePinsMatched: result.execution.current_source_pins_matched, sourcePinMismatchCount: result.execution.current_source_pin_mismatches.length,
  nodeCounts: result.node_tests.counts, failedTests: result.node_tests.failed_tests,
  launchErrors: result.node_tests.launch_errors, compileFourReached: result.execution.compile_four_reached,
  rawBrowserTracesPresent: result.execution.raw_browser_traces_present, goGatesPassed: result.other_gates.root_and_compiler_go_tests_race_vet_passed }, null, 2));
if (!result.workflow_binding.archive_matches_extraction_manifest || extractedMismatches.length || sourceMismatches.length
    || result.node_tests.counts.tests !== 81 || result.node_tests.counts.pass !== 79 || result.node_tests.counts.fail !== 2
    || result.node_tests.failed_before_guard_behavior !== true || result.execution.compile_four_reached
    || result.execution.raw_browser_traces_present || !result.other_gates.root_and_compiler_go_tests_race_vet_passed) process.exitCode = 1;
