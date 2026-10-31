import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  archiveAndVerify,
  createExclusiveAttemptDirectory,
  writeImmutableSnapshot,
} from "../compiled-capabilities/archive-helper.mjs";
import { chromiumLaunchOptions } from "../compiled-frontend/conformance/browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const compilerDir = join(root, "compiled-frontend");
const fixturePath = join(root, "fixtures/compiled/moduleparent/scenario.json");
const packagePaths = {
  parent: "github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent",
  child: "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild",
};
const ROOT_GO_ENV = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const COMPILER_GO_ENV = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const commandRecords = [];

const sourceDirectories = [
  "cmd/compiled-modules-native",
  "fixtures/compiled/modulewire",
  "fixtures/compiled/moduleparent",
  "fixtures/compiled/modulechild",
  "moduleabi",
  "counter",
  "gobi",
  "compilercontract",
  "reactmap",
  "compiled-modules",
  "compiled-frontend/analyze",
  "compiled-frontend/build",
  "compiled-frontend/cmd/gobi-build",
  "compiled-frontend/emit",
  "compiled-frontend/frontend/runtime",
  "compiled-frontend/frontend/shared",
  "compiled-frontend/frontend/react",
  "compiled-frontend/frontend/dom",
  "compiled-frontend/conformance",
];
const sourceFiles = [
  "go.mod",
  "package.json",
  "package-lock.json",
  "interaction/package.json",
  "interaction/package-lock.json",
  "compiled-frontend/go.mod",
  "compiled-frontend/go.sum",
  "compiled-frontend/package.json",
  "compiled-frontend/package-lock.json",
  "compiled-capabilities/archive-helper.mjs",
  "compiled-capabilities/archive-helper.test.mjs",
  "compiled-children/browser-version.mjs",
  "compiled-children/conformance/browser-version.test.mjs",
  "run.sh",
  "run-interaction.sh",
  "run-compiled-modules.sh",
  "EXPECTED.json",
  ".github/workflows/gobi-compiled-modules.yml",
  "compiled-modules/.gitignore",
  "compiled-modules/README.md",
  "compiled-modules/RESULTS.md",
  "compiled-modules/run.mjs",
  "compiled-modules/demo/build.mjs",
  "compiled-modules/demo/app.mjs",
  "compiled-modules/demo/index.html",
];
const excludedDirectories = new Set([
  ".git", "node_modules", "output", "evidence", "attempts", "coordination", "rawlogs", "receipts", "reports",
  "__pycache__", ".cache",
]);

function parseArgs(argv) {
  const args = { allowDirty: false, chromium: null, outputRoot: join(here, "output/attempts"), sourceCommit: null };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    if (name === "--allow-dirty") {
      if (args.allowDirty) throw new Error("--allow-dirty may only appear once");
      args.allowDirty = true;
      continue;
    }
    if (name === "--help") return { help: true };
    if (!["--source-commit", "--chromium", "--output-root"].includes(name)) throw new Error(`unknown argument ${name}`);
    if (seen.has(name)) throw new Error(`${name} may only appear once`);
    seen.add(name);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    const key = name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = key === "chromium" || key === "outputRoot" ? resolve(value) : value;
  }
  if (typeof args.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(args.sourceCommit)) {
    throw new Error("--source-commit requires a 40-character lowercase Git commit ID");
  }
  return args;
}

function executable(name) {
  const pathValue = process.env.PATH ?? "";
  for (const directory of pathValue.split(delimiterForPath())) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      const info = spawnSync("test", ["-x", candidate]);
      if (info.status === 0) return candidate;
    } catch { /* continue */ }
  }
  return name;
}

function delimiterForPath() { return process.platform === "win32" ? ";" : ":"; }

const goExecutable = process.env.GOBI_GO_BIN ? resolve(process.env.GOBI_GO_BIN) : executable("go");
const pythonExecutable = process.env.GOBI_PYTHON_BIN ? resolve(process.env.GOBI_PYTHON_BIN) : executable("python3");

let attemptId;
let attemptRoot;
let evidenceRoot;
let archivePath;
let manifestPath;
let logsRoot;
let currentStage = "argument-validation";
let sourcePinsBefore = null;
let buildRecords = [];
let nativeSummary = null;
let conformanceSummary = null;
let demoSummary = null;
let testSummary = [];
let chromiumPath = null;

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function walkFiles(directory, { sourceTree = false } = {}) {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const relativePath = relative(root, path).split(sep).join("/");
      if (sourceTree && (excludedDirectories.has(entry.name) ||
          relativePath === "compiled-modules/compiler/build" ||
          relativePath.startsWith("compiled-modules/compiler/build/") ||
          relativePath.startsWith("compiled-modules/demo/output/"))) continue;
      output.push(...await walkFiles(path, { sourceTree }));
    } else if (entry.isFile()) {
      output.push(path);
    } else {
      throw new Error(`source or attempt inventory contains a non-regular entry: ${path}`);
    }
  }
  return output;
}

async function snapshotSourcePins() {
  const paths = new Set(sourceFiles);
  for (const directory of sourceDirectories) {
    const absolute = join(root, directory);
    for (const path of await walkFiles(absolute, { sourceTree: true })) {
      const relativePath = relative(root, path).split(sep).join("/");
      // Build outputs are not source inputs; the compiler's Go package is still
      // included because the source traversal starts at compiled-frontend/build.
      if (relativePath.startsWith("compiled-modules/compiler/build/") ||
          relativePath.startsWith("compiled-modules/demo/output/")) continue;
      paths.add(relativePath);
    }
  }
  const pins = {};
  for (const path of [...paths].sort()) {
    const bytes = await readFile(join(root, path));
    pins[path] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  return pins;
}

function comparePins(before, after) {
  const paths = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  return paths.filter((path) => !before?.[path] || !after?.[path] ||
    before[path].bytes !== after[path].bytes || before[path].sha256 !== after[path].sha256);
}

async function gitMetadata(phase) {
  if (phase !== "before" && phase !== "after") throw new Error(`unknown Git metadata phase ${phase}`);
  const head = await execute(`git-${phase}-head`, "git", ["rev-parse", "HEAD"], { cwd: root, logDir: logsRoot, env: {} });
  const status = await execute(`git-${phase}-status`, "git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, logDir: logsRoot, env: {} });
  return { head: head.trim(), dirty: status.trim().length !== 0, status: status.trim() };
}

async function compareSourcePinsToGit(pins, head) {
  const output = await execute("git-tree-source-closure", "git", ["ls-tree", "-rz", "--full-tree", head], {
    cwd: root,
    logDir: logsRoot,
    env: {},
    maxBuffer: 128 * 1024 * 1024,
  });
  const blobs = new Map();
  for (const entry of output.split("\0")) {
    if (!entry) continue;
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const metadata = entry.slice(0, tab).split(" ");
    if (metadata.length === 3 && metadata[1] === "blob") blobs.set(entry.slice(tab + 1), metadata[2]);
  }
  const mismatches = [];
  for (const [path, pin] of Object.entries(pins)) {
    const bytes = await readFile(join(root, path));
    const gitBlob = createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256 || blobs.get(path) !== gitBlob) mismatches.push(path);
  }
  return { sourcePinsMatch: mismatches.length === 0, mismatches };
}

async function writeJSON(path, value, { exclusive = true } = {}) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: exclusive ? "wx" : "w", mode: 0o644 });
  return await hashFile(path);
}

async function hashFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function execute(name, command, args, options = {}) {
  const logDir = options.logDir ?? logsRoot;
  await mkdir(logDir, { recursive: true });
  const fileName = safeName(name);
  const startedAt = stamp();
  const environment = options.env ?? {};
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...environment },
    input: options.input,
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
  });
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const record = {
    name,
    command,
    args,
    cwd: options.cwd ?? root,
    environment,
    startedAt,
    completedAt: stamp(),
    exitCode: result.status,
    signal: result.signal ?? null,
    spawnError: result.error ? String(result.error.message ?? result.error) : null,
    stdout: { bytes: stdout.length, sha256: sha256(stdout) },
    stderr: { bytes: stderr.length, sha256: sha256(stderr) },
  };
  if (options.input !== undefined) {
    const input = Buffer.isBuffer(options.input) ? options.input : Buffer.from(String(options.input));
    record.stdin = { bytes: input.length, sha256: sha256(input) };
    await writeFile(join(logDir, `${fileName}.stdin.bin`), input, { flag: "wx" });
  }
  await Promise.all([
    writeFile(join(logDir, `${fileName}.stdout.bin`), stdout, { flag: "wx" }),
    writeFile(join(logDir, `${fileName}.stderr.bin`), stderr, { flag: "wx" }),
  ]);
  await writeJSON(join(logDir, `${fileName}.command.json`), record);
  commandRecords.push(record);
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed (${result.status ?? result.signal ?? "spawn error"})${stderr.length ? `: ${stderr.toString("utf8").trim()}` : ""}`);
  }
  return stdout.toString("utf8");
}

function parseSingleJSON(text, label) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${label} produced empty stdout`);
  try { return JSON.parse(trimmed); } catch { /* fall back for commands that log before a JSON result */ }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* parse the final JSON line */ }
  }
  throw new Error(`${label} produced no parseable JSON result`);
}

function validateRelativeOutput(path, label) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} contains an invalid relative output path`);
  }
}

async function verifyBuildOutput(backend, role, outputDir, buildResult) {
  if (buildResult?.schema !== "gobi.build-result/v1" || buildResult.ok !== true ||
      buildResult.preservedPreviousOutput !== false || buildResult.diagnostics?.length !== 0 ||
      buildResult.apps?.length !== 1 || buildResult.apps[0].packagePath !== packagePaths[role]) {
    throw new Error(`${backend}/${role} GoScript build did not return one clean app`);
  }
  const manifestPath = join(outputDir, "buildmanifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest?.schema !== "gobi.build-manifest/v1" || manifest.apps?.length !== 1 ||
      manifest.apps[0].backend !== backend || manifest.apps[0].packagePath !== packagePaths[role] ||
      manifest.apps[0].componentId !== packagePaths[role] || !manifest.apps[0].moduleABI) {
    throw new Error(`${backend}/${role} buildmanifest has wrong package/backend/component or no module ABI`);
  }
  const actual = [];
  for (const output of buildResult.outputs ?? []) {
    validateRelativeOutput(output.path, `${backend}/${role} BuildResult`);
    const path = join(outputDir, output.path);
    const bytes = await readFile(path);
    if (bytes.length !== output.bytes || sha256(bytes) !== output.sha256) {
      throw new Error(`${backend}/${role} BuildResult output digest mismatch: ${output.path}`);
    }
    actual.push(output.path);
  }
  const files = (await walkFiles(outputDir)).map((path) => relative(outputDir, path).split(sep).join("/")).sort();
  if (new Set(actual).size !== actual.length || JSON.stringify(actual.sort()) !== JSON.stringify(files)) {
    throw new Error(`${backend}/${role} BuildResult inventory does not exactly cover output directory`);
  }
  return {
    backend,
    role,
    packagePath: manifest.apps[0].packagePath,
    componentId: manifest.apps[0].componentId,
    outputDir,
    manifestPath,
    manifest: { bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    outputCount: files.length,
    outputs: buildResult.outputs,
  };
}

async function runBuild(backend, role) {
  currentStage = `build-${backend}-${role}`;
  const folder = join(attemptRoot, "builds", `${backend}-${role}`);
  const outputDir = join(folder, "output");
  await mkdir(folder, { recursive: true });
  const request = {
    schema: "gobi.build-request/v1",
    sourceRoot: root,
    entryPackages: [packagePaths[role]],
    backend,
    outputDir,
  };
  await writeJSON(join(folder, "request.json"), request);
  const stdout = await execute(`build-${backend}-${role}`, goExecutable, ["run", "./cmd/gobi-build"], {
    cwd: compilerDir,
    env: { ...COMPILER_GO_ENV, GOBI_NODE: process.execPath, GOBI_GO_BIN: goExecutable },
    input: `${JSON.stringify(request)}\n`,
  });
  const result = parseSingleJSON(stdout, `build-${backend}-${role}`);
  await writeJSON(join(folder, "build-result.json"), result);
  const record = await verifyBuildOutput(backend, role, outputDir, result);
  buildRecords.push(record);
  return record;
}

async function runNativeTrace() {
  currentStage = "fresh-native-trace";
  const output = await execute("native-trace", goExecutable, ["run", "./cmd/compiled-modules-native", "--script", "fixtures/compiled/moduleparent/scenario.json"], {
    cwd: root,
    env: { ...ROOT_GO_ENV, GOBI_GO_BIN: goExecutable },
  });
  const trace = parseSingleJSON(output, "fresh native trace");
  if (trace.schema !== "gobi.compiled-modules-native/v1" || trace.name !== "independent-module-pair-v1" ||
      trace.events?.length !== 24 || trace.steps?.length !== 16 || !trace.initial) {
    throw new Error("fresh native trace failed the independent-module fixture envelope/count gate");
  }
  const tracePath = join(attemptRoot, "native/native-trace.json");
  await writeJSON(tracePath, trace);
  nativeSummary = {
    path: tracePath,
    sha256: sha256(Buffer.from(`${JSON.stringify(trace, null, 2)}\n`)),
    sourceEvents: trace.events.length,
    goUpdates: trace.steps.length,
    stateCheckpoints: trace.steps.length + 1,
  };
}

async function discoverTests() {
  const roots = [join(here, "abi"), join(here, "runtime"), join(here, "conformance"), join(here, "oracle")];
  const tests = [];
  for (const directory of roots) {
    let files = [];
    try { files = await walkFiles(directory); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    tests.push(...files.filter((path) => path.endsWith(".test.mjs")));
  }
  tests.push(join(root, "compiled-capabilities/archive-helper.test.mjs"));
  return [...new Set(tests)].sort();
}

async function runFocusedTests() {
  currentStage = "focused-node-unit-tests";
  const files = await discoverTests();
  if (files.length === 0) throw new Error("no ABI/runtime/conformance/oracle Node tests were found");
  const args = ["--test", ...files];
  const stdout = await execute("focused-node-tests", process.execPath, args, {
    cwd: root,
    env: { GOBI_GO_BIN: goExecutable, GOBI_GO_EXECUTABLE: goExecutable },
    maxBuffer: 128 * 1024 * 1024,
  });
  const record = {
    command: process.execPath,
    args,
    files: files.map((path) => relative(root, path).split(sep).join("/")),
    result: stdout.trim().split(/\r?\n/).slice(-10),
  };
  testSummary.push(record);
  await writeJSON(join(attemptRoot, "tests/focused-node-tests.json"), record);
  currentStage = "focused-go-tests";
  const goArgs = ["test", "-count=1", "./cmd/compiled-modules-native", "./fixtures/compiled/modulewire", "./fixtures/compiled/moduleparent", "./fixtures/compiled/modulechild", "./moduleabi"];
  const goOutput = await execute("focused-go-tests", goExecutable, goArgs, {
    cwd: root,
    env: ROOT_GO_ENV,
    maxBuffer: 128 * 1024 * 1024,
  });
  const compilerArgs = ["test", "-count=1", "./analyze", "./build", "./emit"];
  const compilerOutput = await execute("focused-compiler-go-tests", goExecutable, compilerArgs, {
    cwd: compilerDir,
    env: COMPILER_GO_ENV,
    maxBuffer: 128 * 1024 * 1024,
  });
  testSummary.push({ command: goExecutable, args: goArgs, result: goOutput.trim().split(/\r?\n/).slice(-10) });
  testSummary.push({ command: goExecutable, args: compilerArgs, cwd: compilerDir, result: compilerOutput.trim().split(/\r?\n/).slice(-10) });
  await writeJSON(join(attemptRoot, "tests/focused-go-tests.json"), testSummary.slice(1));
}

async function runConformance() {
  currentStage = "native-direct-browser-conformance";
  const harnessPath = join(here, "conformance/run.mjs");
  const outputStem = join(attemptRoot, "conformance/module-pair");
  await mkdir(dirname(outputStem), { recursive: true });
  const manifest = (backend, role) => join(attemptRoot, "builds", `${backend}-${role}`, "output/buildmanifest.json");
  const args = [
    harnessPath,
    "--native-go", goExecutable,
    "--fixture", fixturePath,
    "--expectations", join(here, "oracle/expectations.json"),
    "--parent-react-manifest", manifest("react", "parent"),
    "--child-react-manifest", manifest("react", "child"),
    "--parent-dom-manifest", manifest("dom", "parent"),
    "--child-dom-manifest", manifest("dom", "child"),
    "--chromium", chromiumPath,
    "--output", outputStem,
  ];
  const stdout = await execute("module-pair-conformance", process.execPath, args, {
    cwd: root,
    env: { GOBI_GO_BIN: goExecutable, CHROMIUM_PATH: chromiumPath },
    maxBuffer: 256 * 1024 * 1024,
  });
  const summary = parseSingleJSON(stdout, "module pair conformance runner");
  const expectedBrowserProfiles = ["react", "dom", "swap", ...[20261031, 20261032, 20261033]
    .flatMap((seed) => ["react", "dom", "swap"].map((kind) => `seed-${seed}-${kind}`))];
  if (summary.schema !== "gobi.compiled-modules-conformance/v1" || summary.status !== "matched" ||
      summary.fixedEventCount !== 24 || summary.fixedGoUpdates !== 16 ||
      summary.fixedStateCheckpoints !== 17 || !Array.isArray(summary.seededSeeds) ||
      JSON.stringify(summary.seededSeeds) !== JSON.stringify([20261031, 20261032, 20261033]) ||
      summary.seededEventsPerSeed !== 40 || !Array.isArray(summary.browserProfiles) ||
      JSON.stringify(summary.browserProfiles) !== JSON.stringify(expectedBrowserProfiles) || summary.browserProfileCount !== 12 ||
      !Number.isSafeInteger(summary.mutationControlsDetected) || summary.mutationControlsDetected < 5 || summary.pageErrors?.length !== 0 ||
      summary.seededRuns?.length !== 3 || summary.seededRuns.some((run, index) =>
        run.seed !== [20261031, 20261032, 20261033][index] || run.status !== "matched" || run.events !== 40)) {
    throw new Error("module pair native/direct/browser conformance summary did not match the frozen finite profile");
  }
  const captureFiles = {};
  for (const kind of ["fixed.native", "fixed.direct", "seeded.direct", "seeded.summary", "fixed.browser-profiles", "browser", "check", "run"]) {
    const path = `${outputStem}.${kind}.json`;
    const bytes = await readFile(path);
    const capture = JSON.parse(bytes.toString("utf8"));
    if (bytes.length === 0 || capture === null || typeof capture !== "object") {
      throw new Error(`conformance ${kind} capture is empty or malformed`);
    }
    captureFiles[kind] = { path, bytes: bytes.length, sha256: sha256(bytes) };
  }
  conformanceSummary = summary;
  conformanceSummary.captures = captureFiles;
  await writeJSON(join(attemptRoot, "conformance/summary.json"), summary);
}

async function runDemoBuild() {
  currentStage = "demo-build";
  const output = join(attemptRoot, "demo/site");
  const args = [
    join(here, "demo/build.mjs"),
    "--parent-react-manifest", join(attemptRoot, "builds/react-parent/output/buildmanifest.json"),
    "--child-react-manifest", join(attemptRoot, "builds/react-child/output/buildmanifest.json"),
    "--parent-dom-manifest", join(attemptRoot, "builds/dom-parent/output/buildmanifest.json"),
    "--child-dom-manifest", join(attemptRoot, "builds/dom-child/output/buildmanifest.json"),
    "--output", output,
  ];
  const stdout = await execute("demo-build", process.execPath, args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  demoSummary = parseSingleJSON(stdout, "compiled module demo build");
  if (demoSummary.schema !== "gobi.compiled-modules-demo-build/v1" || demoSummary.status !== "passed" ||
      Object.keys(demoSummary.profiles ?? {}).length !== 4 || !demoSummary.output?.sha256) {
    throw new Error("compiled module demo build result is incomplete");
  }
}

async function serveStatic(siteRoot) {
  const canonicalRoot = await realpath(siteRoot);
  const types = new Map([[".html", "text/html"], [".mjs", "text/javascript"], [".css", "text/css"], [".json", "application/json"]]);
  const server = createServer((request, response) => {
    let relativePath;
    try { relativePath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname.slice(1)); }
    catch { response.writeHead(400).end("invalid URL"); return; }
    if (!relativePath) relativePath = "index.html";
    const path = resolve(canonicalRoot, relativePath);
    if (!path.startsWith(`${canonicalRoot}${sep}`)) { response.writeHead(400).end("invalid path"); return; }
    const stream = createReadStream(path);
    stream.once("error", () => { if (!response.headersSent) response.writeHead(404); response.end("not found"); });
    response.writeHead(200, { "content-type": `${types.get(extname(path)) ?? "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    stream.pipe(response);
  });
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function runDemoHTTPSmoke() {
  currentStage = "demo-http-smoke";
  const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
  const siteRoot = join(attemptRoot, "demo/site");
  const server = await serveStatic(siteRoot);
  let browser;
  const errors = [];
  const requests = [];
  try {
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => requests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
    const response = await page.goto(server.url, { waitUntil: "load", timeout: 20000 });
    if (!response || response.status() !== 200) throw new Error("HTTP demo index did not return status 200");
    await page.locator("#module-status[data-state='ready']").waitFor({ timeout: 20000 });
    await page.waitForFunction(() => typeof window.compiledModulesDemo?.snapshot === "function", null, { timeout: 20000 });
    const initial = await page.evaluate(() => window.compiledModulesDemo.snapshot());
    await page.locator("#module-pair .module-step-up").click();
    await page.waitForFunction(() => document.querySelector("#module-pair .module-child-input")?.textContent.includes("Step: 2"));
    await page.locator("#module-pair .counter button.add").click();
    await page.waitForFunction(() => document.querySelector("#module-pair .module-child-publication")?.textContent.toLowerCase().includes("count: 2"));
    const beforeLock = await page.locator("#module-pair .module-child-publication").innerText();
    await page.locator("#module-pair .module-lock-toggle").click();
    const add = page.locator("#module-pair .counter button.add");
    if (!(await add.isDisabled())) throw new Error("locked input did not disable the generated Go child Add control");
    const dispatch = await page.evaluate(() => window.compiledModulesDemo.dispatchGoMessage("child", { Name: "add", Arg: "" }));
    const lockedAfter = await page.locator("#module-pair .module-child-publication").innerText();
    if (!dispatch.accepted || lockedAfter !== beforeLock) throw new Error("Go child did not preserve count for a locked Add message");
    await page.locator("#module-pair .module-input-reset").click();
    await page.waitForFunction(() => document.querySelector("#module-pair .module-child-input")?.textContent.includes("Step: 1"));
    await page.locator("[data-module-backend='react']").click();
    await page.waitForFunction(() => window.compiledModulesDemo.snapshot().backend === "react");
    await page.locator("[data-module-backend='dom']").click();
    await page.waitForFunction(() => window.compiledModulesDemo.snapshot().backend === "dom");
    const evidence = await page.evaluate(() => ({
      activeBackend: window.compiledModulesDemo.snapshot().backend,
      finalSnapshot: window.compiledModulesDemo.snapshot(),
      finalTrace: window.compiledModulesDemo.trace(),
    }));
    if (evidence.activeBackend !== "dom" || errors.length !== 0 || requests.length !== 0) {
      throw new Error(`demo page reported errors: ${JSON.stringify({ errors, requests })}`);
    }
    demoSummary.httpSmoke = {
      schema: "gobi.compiled-modules-demo-http-smoke/v1",
      status: "passed",
      url: server.url,
      httpStatus: response.status(),
      initialSnapshot: initial,
      activeBackendAfterRoundTrip: evidence.activeBackend,
      finalSnapshot: evidence.finalSnapshot,
      finalTrace: evidence.finalTrace,
      disabledAddPassed: true,
      lockedGoAddNoOpPassed: true,
      rendererRoundTripPreserved: true,
      pageErrors: errors,
      failedRequests: requests,
    };
    await writeJSON(join(attemptRoot, "demo/http-smoke.json"), demoSummary.httpSmoke);
  } catch (error) {
    await writeJSON(join(attemptRoot, "demo/http-smoke.failed.json"), {
      schema: "gobi.compiled-modules-demo-http-smoke-failure/v1",
      status: "failed",
      url: server.url,
      pageErrors: errors,
      failedRequests: requests,
      error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
    }).catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((done) => server.server.close(done));
  }
}

async function copySourceSnapshot(pins) {
  for (const [path, expected] of Object.entries(pins)) {
    const source = join(root, path);
    const bytes = await readFile(source);
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`source changed before snapshot copy: ${path}`);
    }
    const target = join(attemptRoot, "source", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o444 });
  }
}

async function makeMembers() {
  const paths = await walkFiles(attemptRoot);
  const members = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    members.push({ path: relative(attemptRoot, path).split(sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) });
  }
  members.sort((left, right) => left.path.localeCompare(right.path));
  return members;
}

async function consumeArchiveIndependently(manifestHash) {
  currentStage = "independent-archive-consumer";
  const python = `import hashlib,json,sys,tarfile\narchive,manifest_path,manifest_hash=sys.argv[1:4]\nmanifest=json.load(open(manifest_path,encoding='utf-8'))\nexpected={item['path']:item for item in manifest['members']}\nwith tarfile.open(archive,'r:gz') as tf:\n members=tf.getmembers()\n actual={}\n for item in members:\n  name=item.name.removeprefix('./')\n  if name in actual: raise SystemExit('duplicate member: '+name)\n  if not item.isfile(): raise SystemExit('non-regular archive member: '+name)\n  actual[name]=item\n if set(actual)!=set(expected): raise SystemExit('archive member set differs from manifest')\n for name,item in expected.items():\n  source=tf.extractfile(actual[name])\n  data=source.read() if source else b''\n  digest=hashlib.sha256(data).hexdigest()\n  if len(data)!=item['bytes'] or digest!=item['sha256']: raise SystemExit('archive content mismatch: '+name)\nprint(json.dumps({'schema':'gobi.compiled-modules-independent-consumer/v1','status':'passed','members':len(actual),'archiveSHA256':manifest['archive']['sha256'],'manifestSHA256':manifest_hash},sort_keys=True))`;
  const output = await execute("independent-archive-consumer", pythonExecutable, ["-c", python, archivePath, manifestPath, manifestHash], {
    cwd: root,
    env: {},
    logDir: join(evidenceRoot, "consumer-logs"),
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseSingleJSON(output, "independent Python archive consumer");
}

async function freezeArchive(sourcePinsAfter) {
  currentStage = "archive-inventory-and-roundtrip";
  const changed = comparePins(sourcePinsBefore, sourcePinsAfter);
  if (changed.length !== 0) throw new Error(`source inputs changed during the run: ${changed.join(", ")}`);
  await copySourceSnapshot(sourcePinsBefore);
  const sourcePinsAfterCopy = await snapshotSourcePins();
  const changedAfterCopy = comparePins(sourcePinsBefore, sourcePinsAfterCopy);
  if (changedAfterCopy.length !== 0) throw new Error(`source inputs changed while copying the archive snapshot: ${changedAfterCopy.join(", ")}`);
  await writeImmutableSnapshot(join(attemptRoot, "metadata/execution-before-archive.json"), {
    schema: "gobi.compiled-modules-execution-snapshot/v1",
    sourceCommit: sourceCommitArgument,
    verifierGitHead: gitStart.head,
    verifierGitDirty: gitStart.dirty,
    verifierSourcePinsMatch: gitStart.sourcePinsMatch,
    verifierSourcePinMismatches: gitStart.sourcePinMismatches,
    sourcePins: sourcePinsBefore,
    commands: commandRecords,
    moduleCounts: { fixedEvents: 24, fixedGoUpdates: 16, fixedStateCheckpoints: 17 },
  });
  const members = await makeMembers();
  const verifyRoot = await mkdtemp(join(tmpdir(), "gobi-module-archive-verify-"));
  let producerResult;
  try {
    producerResult = await archiveAndVerify({
      attemptRoot,
      archivePath,
      verifyRoot,
      includePaths: ["source", "builds", "native", "tests", "conformance", "demo", "metadata", "logs"],
      members,
      execute: async (name, command, args) => execute(`archive-${name}`, command, args, {
        cwd: root,
        env: {},
        logDir: join(evidenceRoot, "archive-logs"),
        maxBuffer: 16 * 1024 * 1024,
      }),
      hashPath: async (path) => hashFile(path),
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    });
  } finally {
    await rm(verifyRoot, { recursive: true, force: true });
  }
  if (producerResult.archivedSnapshot?.schema !== "gobi.compiled-modules-execution-snapshot/v1" ||
      producerResult.archivedSnapshot.sourceCommit !== sourceCommitArgument ||
      JSON.stringify(producerResult.archivedSnapshot.sourcePins) !== JSON.stringify(sourcePinsBefore)) {
    throw new Error("archive round-trip did not preserve the immutable pre-archive source snapshot");
  }
  const manifest = {
    schema: "gobi.compiled-modules-archive-manifest/v1",
    sourceCommit: sourceCommitArgument,
    verifierGitHead: gitStart.head,
    verifierGitDirty: gitStart.dirty,
    verifierSourcePinsMatch: gitStart.sourcePinsMatch,
    members,
    archive: { path: archivePath, ...producerResult.archive },
    sourcePinsBefore: sourcePinsBefore,
    archivedSnapshotVerified: true,
  };
  await writeJSON(manifestPath, manifest);
  const manifestHash = await hashFile(manifestPath);
  const consumer = await consumeArchiveIndependently(manifestHash.sha256);
  const afterConsumerArchive = await hashFile(archivePath);
  if (afterConsumerArchive.bytes !== manifest.archive.bytes || afterConsumerArchive.sha256 !== manifest.archive.sha256 ||
      consumer.status !== "passed" || consumer.members !== members.length || consumer.manifestSHA256 !== manifestHash.sha256) {
    throw new Error("independent post-command archive consumer did not verify the frozen archive");
  }
  const afterConsumerPins = await snapshotSourcePins();
  const changedAfterConsumer = comparePins(sourcePinsBefore, afterConsumerPins);
  if (changedAfterConsumer.length !== 0) throw new Error(`source files changed during archive verification: ${changedAfterConsumer.join(", ")}`);
  await writeJSON(join(evidenceRoot, "independent-consumer.json"), consumer);
  return { manifest, manifestHash, consumer };
}

let sourceCommitArgument = null;
let gitStart = null;

async function writeFailureReceipt(error, args) {
  if (!evidenceRoot) return;
  const failure = {
    schema: "gobi.compiled-modules-delivery-failure/v1",
    status: "failed",
    sourceCommit: args.sourceCommit,
    verifierGitHead: gitStart?.head ?? null,
    verifierGitDirty: gitStart?.dirty ?? null,
    verifierSourcePinsMatch: gitStart?.sourcePinsMatch ?? null,
    verifierSourcePinMismatches: gitStart?.sourcePinMismatches ?? null,
    stage: currentStage,
    error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
    sourcePinsBefore,
    commandCount: commandRecords.length,
    commands: commandRecords,
    attemptRoot,
    archivePath: archivePath ?? null,
  };
  await writeJSON(join(evidenceRoot, "failure-receipt.json"), failure).catch(() => {});
}

async function run(args) {
  sourceCommitArgument = args.sourceCommit;
  const now = new Date().toISOString().replace(/[-:.]/g, "");
  attemptId = `attempt-${now}-${process.pid}`;
  attemptRoot = join(args.outputRoot, attemptId);
  evidenceRoot = join(here, "evidence/attempts", attemptId);
  archivePath = join(args.outputRoot, `${attemptId}.tar.gz`);
  manifestPath = join(args.outputRoot, `${attemptId}.manifest.json`);
  logsRoot = join(attemptRoot, "logs");
  await createExclusiveAttemptDirectory(attemptRoot);
  await mkdir(dirname(evidenceRoot), { recursive: true });
  await mkdir(evidenceRoot, { recursive: false });
  await mkdir(logsRoot, { recursive: true });

  currentStage = "toolchain-and-source-snapshot";
  const rootGoVersion = await execute("go-version", goExecutable, ["version"], { env: ROOT_GO_ENV });
  if (!/go version go1\.24\./.test(rootGoVersion)) throw new Error(`Go 1.24 required for native/test calls, got: ${rootGoVersion.trim()}`);
  const nodeVersion = process.versions.node;
  if (Number(nodeVersion.split(".")[0]) !== 22) throw new Error(`Node 22 is required, got ${nodeVersion}`);
  const compilerVersion = await execute("compiler-go-version", goExecutable, ["version"], { env: COMPILER_GO_ENV, cwd: compilerDir });
  const tarVersion = await execute("tar-version", "tar", ["--version"], { env: {} });
  const pythonVersion = await execute("python-version", pythonExecutable, ["--version"], { env: {}, logDir: join(evidenceRoot, "consumer-logs") });
  const chromiumRaw = args.chromium ?? process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH;
  if (chromiumRaw) {
    chromiumPath = resolve(chromiumRaw);
  } else {
    const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
    chromiumPath = chromium.executablePath();
  }
  const chromiumVersion = await execute("chromium-version", chromiumPath, ["--version"], { env: {} });
  const playwrightPackage = JSON.parse(await readFile(join(root, "interaction/node_modules/playwright/package.json"), "utf8"));
  gitStart = await gitMetadata("before");
  if (args.sourceCommit !== gitStart.head) throw new Error(`source commit argument ${args.sourceCommit} does not match verifier Git HEAD ${gitStart.head}`);
  if (gitStart.dirty && !args.allowDirty) throw new Error("working tree is dirty; use --allow-dirty for an author-only local run");
  sourcePinsBefore = await snapshotSourcePins();
  const gitClosure = await compareSourcePinsToGit(sourcePinsBefore, gitStart.head);
  gitStart.sourcePinsMatch = gitClosure.sourcePinsMatch && !gitStart.dirty;
  gitStart.sourcePinMismatches = gitClosure.mismatches;
  if (!gitStart.dirty && !gitStart.sourcePinsMatch) {
    throw new Error(`clean checkout source pins do not match Git HEAD: ${gitClosure.mismatches.join(", ")}`);
  }
  await writeJSON(join(attemptRoot, "metadata/source-pins-before.json"), sourcePinsBefore);
  await writeJSON(join(attemptRoot, "metadata/git-source-closure.json"), gitStart);
  await writeJSON(join(attemptRoot, "metadata/runner-context.json"), {
    schema: "gobi.compiled-modules-run-context/v1",
    sourceCommit: args.sourceCommit,
    verifierGitHead: gitStart.head,
    verifierGitDirty: gitStart.dirty,
    verifierGitStatus: gitStart.status,
    tools: {
      go: rootGoVersion.trim(),
      compilerGo: compilerVersion.trim(),
      node: `v${nodeVersion}`,
      platform: process.platform,
      architecture: process.arch,
      chromium: chromiumVersion.trim(),
      playwright: playwrightPackage.version,
      tar: tarVersion.trim().split(/\r?\n/)[0],
      python: pythonVersion.trim(),
    },
    fixture: { path: "fixtures/compiled/moduleparent/scenario.json", sha256: sha256(await readFile(fixturePath)) },
  });

  await runFocusedTests();
  currentStage = "fresh-go-native-capture";
  await runNativeTrace();
  for (const backend of ["react", "dom"]) {
    for (const role of ["parent", "child"]) await runBuild(backend, role);
  }
  await runConformance();
  await runDemoBuild();
  await runDemoHTTPSmoke();

  currentStage = "final-source-pin-comparison";
  const sourcePinsAfter = await snapshotSourcePins();
  const changed = comparePins(sourcePinsBefore, sourcePinsAfter);
  if (changed.length !== 0) throw new Error(`source files changed during the profile: ${changed.join(", ")}`);
  const gitEnd = await gitMetadata("after");
  if (gitEnd.head !== gitStart.head || gitEnd.status !== gitStart.status) {
    throw new Error("Git HEAD or working-tree status changed during the profile");
  }
  await writeJSON(join(attemptRoot, "metadata/source-pins-after.json"), sourcePinsAfter);
  await writeJSON(join(attemptRoot, "metadata/git-source-closure-after.json"), gitEnd);

  const archive = await freezeArchive(sourcePinsAfter);
  currentStage = "final-receipt";
  const receipt = {
    schema: "gobi.compiled-modules-delivery-receipt/v1",
    status: gitStart.sourcePinsMatch ? "passed" : "author-only",
    profile: "one-parent-one-child-independent-module-pair-v1",
    sourceCommit: args.sourceCommit,
    verifier: { gitHead: gitStart.head, dirty: gitStart.dirty, sourcePinsMatch: gitStart.sourcePinsMatch, sourcePinMismatches: gitStart.sourcePinMismatches },
    attempt: { id: attemptId, path: attemptRoot },
    counts: {
      fixedEvents: 24,
      fixedGoUpdates: 16,
      fixedStateCheckpoints: 17,
      seededSeeds: conformanceSummary.seededSeeds,
      browserProfiles: conformanceSummary.browserProfiles,
      browserProfileCount: conformanceSummary.browserProfileCount,
      mutationControlsDetected: conformanceSummary.mutationControlsDetected,
    },
    builds: buildRecords,
    nativeCapture: nativeSummary,
    conformance: conformanceSummary,
    demo: demoSummary,
    tests: testSummary,
    sourcePins: sourcePinsBefore,
    archive: {
      path: archivePath,
      bytes: archive.manifest.archive.bytes,
      sha256: archive.manifest.archive.sha256,
      manifestPath,
      manifestSHA256: archive.manifestHash.sha256,
      members: archive.manifest.members.length,
      independentConsumer: archive.consumer,
    },
    tools: {
      goExecutable,
      nodeExecutable: process.execPath,
      chromiumPath,
    },
    commands: commandRecords,
  };
  await writeJSON(join(evidenceRoot, "receipt.json"), receipt);
  process.stdout.write(`${JSON.stringify({
    schema: "gobi.compiled-modules-delivery-summary/v1",
    status: gitStart.sourcePinsMatch ? "passed" : "author-only",
    sourceCommit: args.sourceCommit,
    attempt: attemptId,
    fixedEvents: 24,
    fixedGoUpdates: 16,
    fixedStateCheckpoints: 17,
    nativeCapture: nativeSummary,
    seededSeeds: conformanceSummary.seededSeeds,
    browserProfileCount: conformanceSummary.browserProfileCount,
    mutationControlsDetected: conformanceSummary.mutationControlsDetected,
    archive: receipt.archive,
    receiptPath: join(evidenceRoot, "receipt.json"),
  })}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: node compiled-modules/run.mjs --source-commit <40-char-sha> --chromium <executable> [--allow-dirty] [--output-root <dir>]\n");
    return;
  }
  try {
    await run(args);
  } catch (error) {
    await writeFailureReceipt(error, args);
    process.stderr.write(`${currentStage}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await main();
