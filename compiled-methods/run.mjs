import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const artifacts = join(here, "artifacts");
const attempts = join(artifacts, "attempts");
const reportDirectory = join(here, "coordination/reports");
const receiptDirectory = join(here, "coordination/receipts");
const canonicalReceipt = join(receiptDirectory, "E-DEMO.json");
const canonicalReport = join(reportDirectory, "E-DEMO.md");
const args = process.argv.slice(2);
const mode = args.includes("--methods-only") ? "methods-only" : "full";
const invalidArgs = args.some((value) => value !== "--methods-only") || args.length > 1;
const attemptId = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
const attemptRoot = join(attempts, `attempt-${attemptId}`);
const logDirectory = join(attemptRoot, "logs");
const buildRoot = join(attemptRoot, "builds");
const matrixRoot = join(attemptRoot, "matrix");
const demoRoot = join(attemptRoot, "http-demo");
const fixturePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/methods";
const fixturePath = join(root, "compiled-methods/conformance/fixtures/methods.json");
const schedulePath = join(root, "compiled-methods/conformance/swap-schedule.json");
const browserAdapterPath = join(root, "compiled-methods/browser/runner.mjs");
const driverPath = join(root, "compiled-methods/conformance/run.mjs");
const nativePath = join(attemptRoot, "compiled-native");
const linkedWorktreeFlags = { GOFLAGS: "-buildvcs=false" };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const rel = (path) => relative(root, path).split(sep).join("/");

const receipt = {
  schema: "gobi.compiled-methods-execution/v1",
  job_id: "E-DEMO",
  worker: "N5",
  mode,
  status: "running",
  outcome: "insufficient_evidence",
  startedAt: stamp(),
  attempt: rel(attemptRoot),
  commands: [],
  checks: [],
  failures: [],
  environment: Object.fromEntries(
    ["GOTOOLCHAIN", "GOFLAGS", "CHROMIUM_PATH", "CHROMIUM_EXECUTABLE_PATH"].map((key) => [key, process.env[key] ?? null]),
  ),
  invocation: {
    command: process.env.GOBI_METHODS_ENTRYPOINT ?? `${process.execPath} compiled-methods/run.mjs`,
    nodeExecutable: process.execPath,
    arguments: process.argv.slice(2),
  },
};

await Promise.all([
  mkdir(logDirectory, { recursive: true }),
  mkdir(reportDirectory, { recursive: true }),
  mkdir(receiptDirectory, { recursive: true }),
]);

// Persist the initial running record before source checks, tool probes, or any build/test command.
await saveReceipt();

async function saveReceipt() {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await Promise.all([
    writeFile(canonicalReceipt, serialized),
    writeFile(join(attemptRoot, "execution.json"), serialized),
  ]);
}

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "artifacts") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

async function sourcePins() {
  const paths = [
    "go.mod", "go.sum", "package.json", "package-lock.json",
    "interaction/package.json", "interaction/package-lock.json",
    "compiled-frontend/go.mod", "compiled-frontend/go.sum",
    "compiled-frontend/package.json", "compiled-frontend/package-lock.json",
    "run-compiled-methods.sh", "run-compiled-backends.sh", "run-compiled-frontend.sh",
    "run-typed-composition.sh", "compiled-backends/run.mjs", "compiled-frontend/run.mjs",
    ".github/workflows/compiled-methods.yml", ".github/workflows/compiled-backends.yml",
    "compiled-methods/run.mjs", "compiled-methods/FIXTURE.md",
    "compiled-methods/PLAN.md", "compiled-methods/CONTRACT.md",
    "compilercontract", "cmd/compiled-native", "counter", "gobi", "fixtures/compiled/methods",
    "compiled-frontend/analyze", "compiled-frontend/build", "compiled-frontend/cmd",
    "compiled-frontend/emit", "compiled-frontend/semantic", "compiled-frontend/fixtures",
    "compiled-frontend/conformance", "compiled-frontend/frontend",
    "compiled-methods/demo", "compiled-methods/browser", "compiled-methods/conformance",
  ];
  const files = [];
  for (const path of paths) {
    const absolute = join(root, path);
    try {
      const status = await lstat(absolute);
      if (status.isDirectory()) files.push(...await walk(absolute));
      else if (status.isFile()) files.push(absolute);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const unique = [...new Set(files)].sort();
  const result = [];
  for (const path of unique) result.push({ path: rel(path), sha256: hash(await readFile(path)) });
  return result;
}

async function recursiveFiles(directory) {
  return (await walk(directory)).filter((path) => !path.startsWith(artifacts + sep) || path.startsWith(attemptRoot + sep));
}

function runCommand(name, command, commandArgs, { cwd = root, input, env = {} } = {}) {
  const startedAt = stamp();
  process.stdout.write(`${name}: ${command} ${commandArgs.join(" ")}\n`);
  const child = spawnSync(command, commandArgs, {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  const entry = {
    name,
    command,
    args: commandArgs,
    cwd,
    environmentOverrides: env,
    startedAt,
    finishedAt: stamp(),
    exitCode: child.status,
    signal: child.signal,
    error: child.error?.message ?? null,
    stdinSha256: input === undefined ? null : hash(Buffer.from(input)),
    stdoutSha256: hash(Buffer.from(stdout)),
    stderrSha256: hash(Buffer.from(stderr)),
    stdoutPath: rel(join(logDirectory, `${name}.stdout.log`)),
    stderrPath: rel(join(logDirectory, `${name}.stderr.log`)),
  };
  receipt.commands.push(entry);
  return { child, stdout, stderr, entry };
}

async function execute(name, command, commandArgs, options = {}) {
  const result = runCommand(name, command, commandArgs, options);
  await Promise.all([
    writeFile(join(logDirectory, `${name}.stdout.log`), result.stdout),
    writeFile(join(logDirectory, `${name}.stderr.log`), result.stderr),
  ]);
  await saveReceipt();
  if (result.child.status !== 0 || result.child.error) {
    const error = result.child.error?.message ?? (result.stderr.trim() || `${name} exited ${result.child.status}`);
    receipt.failures.push({
      name,
      error,
      exitCode: result.child.status,
      signal: result.child.signal,
      stdoutSha256: result.entry.stdoutSha256,
      stderrSha256: result.entry.stderrSha256,
    });
    await saveReceipt();
    throw new Error(`${name} failed; output is retained at ${result.entry.stdoutPath} and ${result.entry.stderrPath}`);
  }
  return result.stdout;
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseLastJSONLine(text, label) {
  const line = text.trim().split("\n").at(-1);
  if (!line) throw new Error(`${label} returned no JSON result`);
  try { return JSON.parse(line); }
  catch (error) { throw new Error(`${label} final output line was not JSON: ${error.message}`); }
}

function outputPath(directory, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/")) throw new Error(`invalid output path ${relativePath}`);
  const full = resolve(directory, relativePath);
  if (!full.startsWith(resolve(directory) + sep)) throw new Error(`output path escapes build directory: ${relativePath}`);
  return full;
}

async function pinFiles(directory, outputRows) {
  if (!Array.isArray(outputRows) || outputRows.length === 0) throw new Error("build output inventory is empty");
  const seen = new Set();
  const pins = [];
  for (const row of outputRows) {
    if (seen.has(row.path)) throw new Error(`duplicate build output path: ${row.path}`);
    seen.add(row.path);
    const path = outputPath(directory, row.path);
    const bytes = await readFile(path);
    const actual = { path: row.path, bytes: bytes.length, sha256: hash(bytes) };
    if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256) throw new Error(`build output pin mismatch: ${row.path}`);
    pins.push(actual);
  }
  const physical = (await recursiveFiles(directory)).map((path) => rel(path)).sort();
  const reported = pins.map((row) => join(rel(directory), row.path)).sort();
  if (JSON.stringify(physical) !== JSON.stringify(reported)) throw new Error("physical compiler output inventory differs from BuildResult.outputs");
  return pins;
}

async function buildProfile(backend) {
  const outputDir = join(buildRoot, backend);
  await mkdir(outputDir, { recursive: true });
  const requestPath = join(attemptRoot, `${backend}-request.json`);
  const resultPath = join(attemptRoot, `${backend}-build-result.json`);
  const request = {
    schema: "gobi.build-request/v1",
    sourceRoot: root,
    entryPackages: [fixturePackage],
    backend,
    outputDir,
  };
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);
  const stdout = await execute(`compile-${backend}`, "go", ["run", "./cmd/gobi-build"], {
    cwd: join(root, "compiled-frontend"),
    input: JSON.stringify(request),
    env: { ...linkedWorktreeFlags, GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" },
  });
  const result = JSON.parse(stdout);
  if (result.schema !== "gobi.build-result/v1" || result.ok !== true || result.diagnostics.length || result.apps.length !== 1) {
    throw new Error(`${backend} method CLI build did not produce a clean one-app result`);
  }
  const manifest = await readJSON(join(outputDir, "buildmanifest.json"));
  if (!Array.isArray(manifest.apps) || manifest.apps.length !== 1) throw new Error(`${backend} method manifest must list exactly one app`);
  const app = manifest.apps[0];
  if (app.packagePath !== fixturePackage || app.backend !== backend) throw new Error(`${backend} manifest app identity/backend tag is wrong`);
  const paths = Object.fromEntries(["appIR", "module", "encoder"].map((key) => [key, outputPath(outputDir, app[key])]));
  const outputPins = await pinFiles(outputDir, result.outputs);
  const record = {
    backend,
    outputDir: rel(outputDir),
    request: { path: rel(requestPath), sha256: hash(await readFile(requestPath)) },
    result: { path: rel(resultPath), sha256: hash(Buffer.from(stdout)) },
    manifest: { path: rel(join(outputDir, "buildmanifest.json")), sha256: hash(await readFile(join(outputDir, "buildmanifest.json"))) },
    app: { packagePath: app.packagePath, backend: app.backend, paths: Object.fromEntries(Object.entries(app).filter(([, value]) => typeof value === "string")) },
    outputCount: outputPins.length,
    outputPins,
    rawModule: { path: rel(paths.module), ...await hashPath(paths.module) },
    appIR: { path: rel(paths.appIR), ...await hashPath(paths.appIR) },
    encoder: { path: rel(paths.encoder), ...await hashPath(paths.encoder) },
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  receipt.methodBuilds[backend] = record;
  receipt.checks.push(`${backend} method app built by gobi-build and every output matched BuildResult`);
  await saveReceipt();
  return { backend, outputDir, result, manifest, app, paths, outputPins, record };
}

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: hash(bytes) };
}

function withoutBackend(manifest) {
  return {
    ...manifest,
    apps: manifest.apps.map(({ backend: _backend, ...entry }) => entry),
  };
}

async function compareBuilds(react, dom) {
  if (JSON.stringify(react.result.apps) !== JSON.stringify(dom.result.apps)) throw new Error("method AppIR result differs across renderer build profiles");
  if (JSON.stringify(withoutBackend(react.manifest)) !== JSON.stringify(withoutBackend(dom.manifest))) throw new Error("method manifests differ outside the backend tag");
  for (const key of ["appIR", "encoder"]) {
    if (Buffer.compare(await readFile(react.paths[key]), await readFile(dom.paths[key])) !== 0) throw new Error(`method ${key} differs across backend builds`);
  }
  const reactPaths = react.outputPins.map((row) => row.path).sort();
  const domPaths = dom.outputPins.map((row) => row.path).sort();
  if (JSON.stringify(reactPaths) !== JSON.stringify(domPaths)) throw new Error("React and DOM method output paths differ");
  receipt.backendBuildComparison = {
    appIRResultsIdentical: true,
    manifestsEqualAfterRemovingOnlyBackendTag: true,
    appIRByteIdentical: true,
    encoderByteIdentical: true,
    outputPathsIdentical: true,
    rawCompiledModuleHashes: {
      react: react.record.rawModule,
      dom: dom.record.rawModule,
    },
    rawBundleEqualityClaimed: false,
  };
  receipt.checks.push("React/DOM method outputs share one AppIR and encoder; raw compiled module pins remain separate");
  await saveReceipt();
}

async function hashDirectory(directory) {
  const rows = [];
  for (const path of await recursiveFiles(directory)) rows.push({ path: rel(path), ...await hashPath(path) });
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function stablePins(before, after, label) {
  const normalize = (rows) => rows.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })).sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(normalize(before)) !== JSON.stringify(normalize(after))) throw new Error(`${label} output files changed during browser checks`);
}

async function generateReport() {
  const commands = (receipt.commands ?? []).map((row) =>
    `- \`${row.name}\`: \`${row.command} ${row.args.join(" ")}\` (exit ${row.exitCode}; stdout SHA-256 \`${row.stdoutSha256}\`; stderr SHA-256 \`${row.stderrSha256}\`; logs \`${row.stdoutPath}\`, \`${row.stderrPath}\`)`,
  ).join("\n");
  const versions = Object.entries(receipt.versions ?? {})
    .filter(([, value]) => typeof value === "string")
    .map(([name, value]) => `- ${name}: \`${value}\``).join("\n") || "- Not fully recorded.";
  const checks = (receipt.checks ?? []).map((row) => `- ${row}`).join("\n") || "- No acceptance checks completed.";
  const failures = (receipt.failures ?? []).map((row) => `- ${row.name}: ${row.error}`).join("\n") || "- None recorded.";
  const sourceStatus = receipt.sourcePinsMatch === true ? "stable" : receipt.sourcePinsMatch === false ? "changed/mismatched" : "not fully recorded";
  const inherited = receipt.inheritedRun
    ? `\n\nInherited backend receipt: \`${receipt.inheritedRun.path}\` (SHA-256 \`${receipt.inheritedRun.sha256}\`, mode \`${receipt.inheritedRun.mode}\`, status \`${receipt.inheritedRun.status}\`).`
    : "";
  const inheritedStatus = receipt.mode === "methods-only"
    ? "The explicit --methods-only route skipped the inherited full regression runner."
    : receipt.inheritedRun?.status === "passed" && receipt.inheritedRun?.mode === "full"
      ? "The full inherited run-compiled-backends.sh completed before method-specific compilation and smoke checks."
      : `The inherited run-compiled-backends.sh did not complete successfully (recorded status: ${receipt.inheritedRun?.status ?? "no completed receipt"}); later method-specific checks may not have run.`;
  const report = `# E-DEMO (compiled Go value methods)\n\n**Outcome: ${receipt.outcome}.** ${receipt.summary ?? "No final summary recorded."}\n\n## Execution\n\n- Mode: \`${receipt.mode}\`\n- Status: \`${receipt.status}\`\n- Attempt: \`${receipt.attempt}\`\n- Invocation: \`${receipt.invocation?.command ?? "not recorded"}\` ${receipt.invocation?.arguments?.join(" ") ?? ""}\n- Source pins: ${sourceStatus} (${receipt.sourceBefore?.length ?? 0} before, ${receipt.sourceAfter?.length ?? 0} after)\n- Started: ${receipt.startedAt}\n- Finished: ${receipt.finishedAt ?? "not finished"}${inherited}\n\n## Commands\n\n${commands || "- None."}\n\n## Versions\n\n${versions}\n\n## Checks\n\n${checks}\n\n## Method build and matrix\n\n\`${receipt.attempt}/\` retains per-backend build requests/results/output pins, the registered native binary, conformance outputs, the HTTP build, smoke JSON, and screenshot. The build uses a single actual GoScript method app per profile. The conformance driver uses the React build's one compiled module in the React, DOM, and swap profiles; React and DOM raw bundle hashes are retained independently.\n\n- Method fixture: \`${rel(fixturePath)}\`\n- Fixture script SHA-256: \`${receipt.fixture?.sha256 ?? "not recorded"}\`\n- Fixture matrix status: \`${receipt.methodMatrix?.status ?? "not run"}\` (${receipt.methodMatrix?.ticks ?? "?"} ticks; ${receipt.methodMatrix?.actions ?? "?"} actions; ${receipt.methodMatrix?.suppressed ?? "?"} suppressed intents)\n- HTTP demo smoke status: \`${receipt.demoSmoke?.status ?? "not run"}\`\n- Screenshot: \`${receipt.demoSmoke?.screenshot?.path ?? "not captured"}\`\n\n## Failures\n\n${failures}\n\n## Limits\n\n- The demo runs the compiled GoScript module with the existing runtime and React/DOM renderers. UI listeners forward Gobi actions; application state transitions remain in Go.\n- The child read-only policy and saved-value behavior are fixture Go methods. The page's renderer selector only calls \`replaceRenderer\`; no JavaScript reducer or WASM runtime is used.\n- ${inheritedStatus}\n- Any uncompleted command, source mismatch, output mismatch, or missing evidence leaves this execution failed/partial.\n`;
  receipt.report = { path: rel(canonicalReport), sha256: hash(Buffer.from(report)) };
  await Promise.all([
    writeFile(canonicalReport, report),
    writeFile(join(attemptRoot, "report.md"), report),
  ]);
  await saveReceipt();
}

async function collectVersions() {
  receipt.versions = {
    node: process.version,
    react: (await readJSON(join(root, "interaction/node_modules/react/package.json"))).version,
    reactDOM: (await readJSON(join(root, "interaction/node_modules/react-dom/package.json"))).version,
    playwright: (await readJSON(join(root, "interaction/node_modules/playwright/package.json"))).version,
    esbuild: (await readJSON(join(root, "interaction/node_modules/esbuild/package.json"))).version,
    packageLocks: {},
  };
  receipt.versions.rootGo = (await execute("version-root-go", "go", ["version"], { env: { GOTOOLCHAIN: "local" } })).trim();
  receipt.versions.compiledGo = (await execute("version-compiled-go", "go", ["version"], { env: { ...linkedWorktreeFlags, GOTOOLCHAIN: "go1.27.3" } })).trim();
  if (!receipt.versions.rootGo.includes("go1.24.")) throw new Error(`root toolchain requires Go 1.24.x; got ${receipt.versions.rootGo}`);
  if (!receipt.versions.compiledGo.includes("go1.27.3")) throw new Error(`compiler toolchain requires Go 1.27.3; got ${receipt.versions.compiledGo}`);
  if (!receipt.versions.node.startsWith("v22.")) throw new Error(`Node 22 is required; got ${receipt.versions.node}`);
  for (const path of ["package-lock.json", "interaction/package-lock.json", "compiled-frontend/package-lock.json"]) {
    receipt.versions.packageLocks[path] = hash(await readFile(join(root, path)));
  }
  await saveReceipt();
}

async function runFocusedMethodTests() {
  const testDirectories = [join(here, "browser"), join(here, "conformance")];
  const testPaths = [];
  for (const directory of testDirectories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".test.mjs")) testPaths.push(join(directory, entry.name));
    }
  }
  testPaths.sort();
  receipt.methodTests = {
    files: await Promise.all(testPaths.map(async (path) => ({ path: rel(path), ...await hashPath(path) }))),
    node: process.version,
  };
  await saveReceipt();
  if (testPaths.length === 0) {
    receipt.checks.push("no compiled-methods/browser or conformance .test.mjs files were present");
    await saveReceipt();
    return;
  }
  await execute("method-owned-node-tests", process.execPath, ["--test", ...testPaths]);
  receipt.checks.push(`Node ${process.version} ran all ${testPaths.length} compiled-methods browser and conformance test files`);
}

async function runMethodConformance(react, dom) {
  const fixtureRecord = { path: rel(fixturePath), sha256: hash(await readFile(fixturePath)) };
  const scheduleRecord = { path: rel(schedulePath), sha256: hash(await readFile(schedulePath)) };
  receipt.fixture = fixtureRecord;
  receipt.swapSchedule = scheduleRecord;
  await mkdir(matrixRoot, { recursive: true });
  const outputPrefix = join(matrixRoot, "methods");
  const commandArgs = [
    driverPath,
    "--app-ir", react.paths.appIR,
    "--compiled", react.paths.module,
    "--helpers", react.paths.encoder,
    "--dom-app-ir", dom.paths.appIR,
    "--dom-compiled", dom.paths.module,
    "--dom-helpers", dom.paths.encoder,
    "--native-bin", nativePath,
    "--fixture", fixturePath,
    "--schedule", schedulePath,
    "--browser-adapter", browserAdapterPath,
    "--output", outputPrefix,
  ];
  if (process.env.CHROMIUM_PATH) commandArgs.push("--chromium", process.env.CHROMIUM_PATH);
  const stdout = await execute("method-conformance", process.execPath, commandArgs, {
    env: process.env.CHROMIUM_PATH ? { CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {},
  });
  const summary = parseLastJSONLine(stdout, "method conformance");
  const runPath = `${outputPrefix}.run.json`;
  const checkPath = `${outputPrefix}.check.json`;
  const manifestPath = `${outputPrefix}.manifest.json`;
  const run = await readJSON(runPath);
  const check = await readJSON(checkPath);
  if (summary.status !== "matched" || run.status !== "matched" || check.status !== "matched") {
    throw new Error("method native/direct/browser conformance did not report matched");
  }
  if (run.summary?.actions !== 18 || run.summary?.ticks !== 19 ||
      check.actions !== 18 || check.ticks !== 19) {
    throw new Error(`method fixture has unexpected actions/ticks: ${check.actions}/${check.ticks}`);
  }
  if (check.suppressedActions !== 4 || check.actions - check.suppressedActions !== 14 ||
      check.swaps !== 18 || summary.swaps !== 18 || check.browserProfiles?.join(",") !== "react,dom,swap") {
    throw new Error(`method fixture suppression/dispatch/swap counts differ: ${check.suppressedActions}/${check.actions - check.suppressedActions}/${check.swaps}`);
  }
  const matrixFiles = [];
  for (const suffix of ["native.json", "direct.json", "value-semantics.json", "read-only-guards.json", "browser.json", "browser.capture.json", "check.json", "manifest.json", "run.json"]) {
    const path = `${outputPrefix}.${suffix}`;
    matrixFiles.push({ path: rel(path), ...await hashPath(path) });
  }
  receipt.methodMatrix = {
    status: run.status,
    fixture: fixtureRecord,
    schedule: scheduleRecord,
    checks: check,
    manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) },
    actions: 18,
    ticks: 19,
    dispatches: 14,
    suppressed: 4,
    profiles: ["react", "dom", "swap"],
    swaps: check.swaps,
    files: matrixFiles,
  };
  receipt.checks.push("native, direct GoScript, React, DOM, and alternating-swap method fixture traces matched");
  await saveReceipt();
}

async function runHttpDemo(react) {
  const output = join(demoRoot, "site");
  await mkdir(demoRoot, { recursive: true });
  await execute("build-http-demo", process.execPath, [
    join(here, "demo/build.mjs"),
    "--compiled", react.outputDir,
    "--output", output,
    "--backend", "react",
  ]);
  const before = await hashDirectory(output);
  receipt.demoOutputPinsBeforeSmoke = before;
  await saveReceipt();
  const smokePath = join(demoRoot, "demo-smoke.json");
  const screenshotPath = join(demoRoot, "demo.png");
  const stdout = await execute("http-demo-smoke", process.execPath, [
    join(here, "demo/smoke.mjs"),
    "--demo", output,
    "--output", smokePath,
    "--screenshot", screenshotPath,
  ], {
    env: process.env.CHROMIUM_PATH ? { CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {},
  });
  const smoke = await readJSON(smokePath);
  const printed = parseLastJSONLine(stdout, "HTTP demo smoke");
  if (smoke.status !== "passed" || printed.status !== "passed") throw new Error("HTTP method demo smoke did not report passed");
  if (JSON.stringify(smoke.finalState) !== JSON.stringify({ parent: 0, child: 2, readOnly: false, savedChild: 1 })) {
    throw new Error("HTTP method demo ended with an unexpected Go state");
  }
  const after = await hashDirectory(output);
  stablePins(before, after, "HTTP demo bundle");
  receipt.demoOutputPinsAfterSmoke = after;
  receipt.demoSmoke = {
    ...smoke,
    smokeJson: { path: rel(smokePath), ...await hashPath(smokePath) },
    screenshot: { path: rel(screenshotPath), ...await hashPath(screenshotPath) },
  };
  receipt.checks.push("local HTTP demo exercised Go methods, read-only child behavior, saved capture, and state-preserving renderer swaps");
  await saveReceipt();
}

async function main() {
  if (invalidArgs) throw new Error("supported option: --methods-only (explicit partial run)");
  receipt.sourceBefore = await sourcePins();
  await saveReceipt();
  if (mode === "full") {
    const stdout = await execute("inherited-full-runner", "bash", [join(root, "run-compiled-backends.sh")], {
      env: linkedWorktreeFlags,
    });
    const inheritedPath = join(root, "compiled-backends/coordination/receipts/E-DEMO.json");
    const inherited = await readJSON(inheritedPath);
    const inheritedReport = join(root, "compiled-backends/coordination/reports/E-DEMO.md");
    if (inherited.status !== "passed" || inherited.mode !== "full") throw new Error("inherited full compiled-backends run did not pass in full mode");
    receipt.inheritedRun = {
      path: rel(inheritedPath),
      sha256: hash(await readFile(inheritedPath)),
      report: rel(inheritedReport),
      reportSha256: hash(await readFile(inheritedReport)),
      status: inherited.status,
      mode: inherited.mode,
      versions: inherited.versions,
      commandCount: inherited.commands?.length ?? 0,
      summary: inherited.summary,
      finalOutputLine: stdout.trim().split("\n").at(-1),
    };
    receipt.checks.push("default full run-compiled-backends.sh completed before method-specific validation");
    await saveReceipt();
  } else {
    receipt.checks.push("explicit --methods-only route skipped the inherited full runner");
    await saveReceipt();
  }

  for (const [name, path] of [
    ["syntax-runner", join(here, "run.mjs")],
    ["syntax-demo-app", join(here, "demo/app.mjs")],
    ["syntax-demo-build", join(here, "demo/build.mjs")],
    ["syntax-demo-smoke", join(here, "demo/smoke.mjs")],
  ]) await execute(name, process.execPath, ["--check", path]);
  await execute("syntax-shell-runner", "bash", ["-n", join(root, "run-compiled-methods.sh")]);
  await execute("syntax-shell-inherited", "bash", ["-n", join(root, "run-compiled-backends.sh")]);
  receipt.checks.push("method runner, demo modules, and shell entrypoints passed syntax checks");
  await collectVersions();
  await runFocusedMethodTests();

  await execute("method-go-tests", "go", ["test", "./fixtures/compiled/methods", "./cmd/compiled-native"], {
    env: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
  });
  await execute("build-native", "go", ["build", "-o", nativePath, "./cmd/compiled-native"], {
    env: { ...linkedWorktreeFlags, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
  });
  receipt.nativeBinary = { path: rel(nativePath), ...await hashPath(nativePath) };
  receipt.checks.push("Go 1.24 method fixture and native replay tests passed; native binary built");
  await saveReceipt();

  receipt.methodBuilds = {};
  const react = await buildProfile("react");
  const dom = await buildProfile("dom");
  await compareBuilds(react, dom);
  receipt.outputPinsBefore = {
    react: await hashDirectory(react.outputDir),
    dom: await hashDirectory(dom.outputDir),
  };
  await saveReceipt();
  await runMethodConformance(react, dom);
  await runHttpDemo(react);

  receipt.outputPinsAfter = {
    react: await hashDirectory(react.outputDir),
    dom: await hashDirectory(dom.outputDir),
  };
  stablePins(receipt.outputPinsBefore.react, receipt.outputPinsAfter.react, "React method build");
  stablePins(receipt.outputPinsBefore.dom, receipt.outputPinsAfter.dom, "DOM method build");
  receipt.checks.push("React and DOM method build outputs remained byte-stable through conformance and HTTP smoke");
  receipt.status = "passed";
  receipt.outcome = "mixed_change";
  receipt.summary = "The nested value-method app compiles through the existing GoScript CLI, matches native/direct/React/DOM/swap traces, and runs in a real HTTP demo using the existing runtime and both renderers.";
}

try {
  await main();
} catch (error) {
  receipt.status = "failed";
  receipt.outcome = receipt.methodMatrix || receipt.demoSmoke ? "mixed_change" : "insufficient_evidence";
  receipt.summary = error instanceof Error ? error.message : String(error);
  if (!receipt.failures.some((item) => item.name === "runner")) receipt.failures.push({ name: "runner", error: receipt.summary });
  process.exitCode = 1;
} finally {
  receipt.finishedAt = stamp();
  try {
    receipt.sourceAfter = await sourcePins();
    receipt.sourcePinsMatch = JSON.stringify(receipt.sourceBefore ?? []) === JSON.stringify(receipt.sourceAfter);
    if (receipt.sourcePinsMatch !== true && receipt.status === "passed") {
      receipt.status = "failed";
      receipt.outcome = "mixed_change";
      receipt.summary = "Source pins changed during method build/demo execution.";
      receipt.failures.push({ name: "source-pins", error: "sourceBefore and sourceAfter differ" });
      process.exitCode = 1;
    }
  } catch (error) {
    receipt.sourcePinsMatch = false;
    receipt.failures.push({ name: "source-pins-after", error: error instanceof Error ? error.message : String(error) });
    receipt.status = "failed";
    receipt.outcome = "mixed_change";
    process.exitCode = 1;
  }
  try {
    if (receipt.methodBuilds?.react) receipt.outputPinsAfter = {
      ...(receipt.outputPinsAfter ?? {}),
      react: await hashDirectory(join(buildRoot, "react")),
      dom: await hashDirectory(join(buildRoot, "dom")),
    };
  } catch (error) {
    receipt.failures.push({ name: "output-pins-after", error: error instanceof Error ? error.message : String(error) });
    receipt.status = "failed";
    receipt.outcome = "mixed_change";
    process.exitCode = 1;
  }
  await saveReceipt();
  try { await generateReport(); }
  catch (error) {
    receipt.status = "failed";
    receipt.outcome = "mixed_change";
    receipt.failures.push({ name: "report", error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
    await saveReceipt();
  }
  process.stdout.write(`compiled-methods: ${receipt.status} (${receipt.mode})\n`);
}
