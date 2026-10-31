import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  archiveAndVerify,
  createExclusiveAttemptDirectory,
  writeImmutableSnapshot,
} from "../compiled-capabilities/archive-helper.mjs";
import { isChromiumVersionOutput } from "../compiled-children/browser-version.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const buildModule = join(here, "build/build.mjs");
const qualificationModule = join(here, "conformance/qualification.mjs");
const demoBuild = join(here, "demo/build.mjs");
const demoSmoke = join(here, "demo/smoke.mjs");
const archiveVerifier = join(here, "demo/verify-archive.mjs");
const packagePath = "github.com/samuelpmahan/gondola/fixtures/compiled/publications";
const fixturePath = join(root, "fixtures/compiled/publications/scenario.json");
const planPath = join(here, "oracle/plan.json");
const outputBase = join(here, "output/attempts");
const evidenceBase = join(here, "evidence/attempts");
const attemptId = `attempt-${new Date().toISOString().replace(/[-:.]/g, "")}-${process.pid}`;
const attemptRoot = join(outputBase, attemptId);
const evidenceRoot = join(evidenceBase, attemptId);
const archivePath = join(outputBase, `${attemptId}.tar.gz`);
const manifestPath = join(outputBase, `${attemptId}.archive-manifest.json`);
const finalReceiptPath = join(evidenceRoot, "receipt.json");
const finalReportPath = join(evidenceRoot, "report.md");
const rel = (path) => relative(root, path).split(sep).join("/");
const sourcePath = (path) => join(root, path);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const argv = process.argv.slice(2);
const excludedDirectories = new Set([
  ".git", "node_modules", "output", "evidence", "coordination", "rawlogs", "reports", "receipts",
  "attempts", "__pycache__", ".cache", "review-evidence",
]);
const sourceDirectories = [
  "backendqualification",
  "cmd/backend-qualification",
  "cmd/compiled-publications-native",
  "backend-qualification/adapters",
  "backend-qualification/build",
  "backend-qualification/conformance",
  "backend-qualification/demo",
  "backend-qualification/oracle",
  "compiled-capabilities",
  "compiled-children/runtime",
  "compiled-frontend/analyze",
  "compiled-frontend/build",
  "compiled-frontend/cmd/gobi-build",
  "compiled-frontend/conformance",
  "compiled-frontend/emit",
  "compiled-frontend/frontend",
  "compiled-publications/conformance",
  "compiled-publications/oracle",
  "compiled-publications/runtime",
  "compilercontract",
  "counter",
  "fixtures/compiled/publications",
  "gobi",
  "reactmap",
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
  "backend-qualification/CONTRACT.md",
  "backend-qualification/PLAN.md",
  "backend-qualification/.gitignore",
  "backend-qualification/README.md",
  "backend-qualification/RESULTS.md",
  "backend-qualification/run.mjs",
  "backend-qualification/build/build.mjs",
  "backend-qualification/adapters/qualification-decorator.mjs",
  "backend-qualification/conformance/qualification.mjs",
  "backend-qualification/oracle/plan.json",
  "compiled-publications/CONTRACT.md",
  "compiled-publications/oracle/expectations.json",
  "compiled-publications/conformance/browser-entry.mjs",
  "compiled-children/browser-version.mjs",
  "compiled-children/conformance/browser-version.test.mjs",
  "compiled-frontend/conformance/browser.mjs",
  "compiled-frontend/conformance/no-wasm.mjs",
  "compiled-frontend/frontend/react/review-evidence/r2-go-emit.log",
  "compiled-frontend/frontend/react/review-evidence/r2-node-green.log",
  "compiled-frontend/frontend/react/review-evidence/r2-node-red.log",
  "compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.exit-code",
  "compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.raw.json",
  "compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.stderr.log",
  "compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-before.raw.json",
  "compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-before.stderr.log",
  "run-backend-qualification.sh",
  ".github/workflows/gobi-backend-qualification.yml",
];

let sourceCommit = null;
let chromiumPath = process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH ?? null;
let logRoot = join(attemptRoot, "logs");
const commands = [];
const rootGoExecutable = process.env.GOBI_GO_BIN ?? (() => {
  const result = spawnSync("which", ["go"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : "go";
})();

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 1) {
    const name = arguments_[index];
    if (name === "--help") {
      process.stdout.write("Usage: node backend-qualification/run.mjs --source-commit <40-character-sha> [--chromium <path>]\n");
      process.exit(0);
    }
    if (!name.startsWith("--") || values.has(name) || !arguments_[index + 1] || arguments_[index + 1].startsWith("--")) {
      throw new Error(`invalid or duplicate argument near ${name}`);
    }
    values.set(name, arguments_[++index]);
  }
  for (const name of ["--source-commit"]) if (!values.has(name)) throw new Error(`missing ${name} <value>`);
  for (const name of values.keys()) if (!new Set(["--source-commit", "--chromium"]).has(name)) throw new Error(`unknown argument ${name}`);
  if (!/^[0-9a-f]{40}$/.test(values.get("--source-commit"))) throw new Error("--source-commit must be a 40-character lowercase Git SHA");
  return { sourceCommit: values.get("--source-commit"), chromium: values.get("--chromium") ? resolve(values.get("--chromium")) : null };
}

const parsed = parseArguments(argv);
sourceCommit = parsed.sourceCommit;
if (parsed.chromium) chromiumPath = parsed.chromium;
if (!chromiumPath) {
  const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
  chromiumPath = chromium.executablePath();
}
chromiumPath = resolve(chromiumPath);

async function walkFiles(directory, { includeOutput = false } = {}) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name) || (includeOutput && entry.name === "output")) {
        files.push(...await walkFiles(path, { includeOutput }));
      }
    } else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function hashFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: hash(bytes) };
}

async function snapshotSourcePins() {
  const paths = new Set(sourceFiles);
  for (const directory of sourceDirectories) {
    for (const path of await walkFiles(sourcePath(directory))) paths.add(rel(path));
  }
  const pins = {};
  for (const path of [...paths].sort()) {
    const bytes = await readFile(sourcePath(path));
    pins[path] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  return pins;
}

async function writeJSON(path, value, immutable = false) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(path, bytes, { flag: immutable ? "wx" : "w", mode: immutable ? 0o444 : 0o644 });
  return { bytes: bytes.length, sha256: hash(bytes) };
}

async function execute(name, command, args, options = {}) {
  const destination = options.logRoot ?? logRoot;
  await mkdir(destination, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const startedAt = stamp();
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    input: options.input,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const record = {
    name,
    command,
    args,
    cwd: rel(options.cwd ?? root),
    environment: options.env ?? {},
    exitCode: result.status,
    signal: result.signal ?? null,
    spawnError: result.error ? String(result.error.message ?? result.error) : null,
    stdout: { bytes: Buffer.byteLength(stdout), sha256: hash(Buffer.from(stdout)) },
    stderr: { bytes: Buffer.byteLength(stderr), sha256: hash(Buffer.from(stderr)) },
    startedAt,
  };
  if (options.input !== undefined) {
    const input = Buffer.isBuffer(options.input) ? options.input : Buffer.from(String(options.input));
    record.stdin = { bytes: input.length, sha256: hash(input) };
    await writeFile(join(destination, `${safeName}.stdin.txt`), input, { flag: "wx" });
  }
  commands.push(record);
  await Promise.all([
    writeFile(join(destination, `${safeName}.stdout.log`), stdout, { flag: "wx" }),
    writeFile(join(destination, `${safeName}.stderr.log`), stderr, { flag: "wx" }),
  ]);
  record.completedAt = stamp();
  await writeJSON(join(destination, `${safeName}.command.json`), record, true);
  await writeFile(join(destination, `${safeName}.exit-code`), `${record.exitCode ?? "signal"}\n`, { flag: "wx" });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${name} exited ${result.status}: ${stderr.trim()}`);
  return stdout;
}

function lastJSON(text, label) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* scan backward for final JSON output */ }
  }
  throw new Error(`${label} returned no JSON output`);
}

const receipt = {
  schema: "gobi.backend-qualification-execution/v1",
  job_id: "E-DELIVERY",
  worker: "N6",
  attempt: attemptId,
  sourceCommit,
  status: "running",
  outcome: "mixed_change",
  summary: "Backend qualification attempt started; no acceptance result is available yet.",
  startedAt: stamp(),
  invocation: { node: process.execPath, args: argv, chromiumPath },
  versions: {},
  sourceBefore: {},
  sourceAfter: {},
  sourcePinsMatch: false,
  commands,
  stages: [],
  failures: [],
  mismatches: [],
  outputPaths: { attempt: rel(attemptRoot), evidence: rel(evidenceRoot), archive: rel(archivePath), manifest: rel(manifestPath) },
  finalAcceptance: false,
  acceptanceScope: "13-case mounted React/DOM qualification profile only; inherited regression and publication are separate root/CI gates",
};

await createExclusiveAttemptDirectory(attemptRoot);
await mkdir(evidenceRoot, { recursive: true });
for (const directory of ["inputs", "qualification", "certificate", "demo", "provenance", "source", "logs"]) {
  await mkdir(join(attemptRoot, directory), { recursive: true });
}
logRoot = join(attemptRoot, "logs");
let beforePins = {};

async function saveProgress() {
  await writeFile(join(attemptRoot, "progress.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}

async function stage(name, callback) {
  const entry = { name, status: "running", startedAt: stamp() };
  receipt.stages.push(entry);
  await saveProgress();
  try {
    const result = await callback();
    entry.status = "passed";
    entry.completedAt = stamp();
    await saveProgress();
    return result;
  } catch (error) {
    entry.status = "failed";
    entry.completedAt = stamp();
    entry.error = String(error?.message ?? error);
    receipt.failures.push({ stage: name, message: entry.error });
    await saveProgress();
    throw error;
  }
}

function ensureAttemptPath(path, label) {
  const resolved = resolve(path);
  if (!resolved.startsWith(attemptRoot + sep)) throw new Error(`${label} must stay inside the unique attempt directory`);
  return resolved;
}

async function run() {
  beforePins = await snapshotSourcePins();
  receipt.sourceBefore = beforePins;
  await writeJSON(join(attemptRoot, "provenance/source-before.json"), beforePins, true);

  receipt.versions = await stage("toolchains-and-candidate-identity", async () => {
    const nodeVersion = process.version;
    const rootGoVersion = await execute("root-go-version", rootGoExecutable, ["version"], { env: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" } });
    const compilerGoVersion = await execute("compiler-go-version", rootGoExecutable, ["version"], { env: { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" } });
    const gitHead = (await execute("git-candidate-head", "git", ["rev-parse", "HEAD"])).trim();
    const gitTree = (await execute("git-candidate-tree", "git", ["rev-parse", "HEAD^{tree}"])).trim();
    const chromiumVersion = await execute("chromium-version", chromiumPath, ["--version"]);
    const npmVersion = await execute("npm-version", "npm", ["--version"]);
    if (!nodeVersion.startsWith("v22.")) throw new Error(`Node 22 required; got ${nodeVersion}`);
    if (!rootGoVersion.includes("go1.24.")) throw new Error(`native Go 1.24 required; got ${rootGoVersion.trim()}`);
    if (!compilerGoVersion.includes("go1.27.3")) throw new Error(`compiler Go 1.27.3 required; got ${compilerGoVersion.trim()}`);
    if (gitHead !== sourceCommit) throw new Error(`candidate SHA differs from checked-out source: supplied=${sourceCommit} checkout=${gitHead}`);
    if (!isChromiumVersionOutput(chromiumVersion.trim())) throw new Error(`invalid Chromium version output: ${chromiumVersion.trim()}`);
    const packageVersion = async (path) => JSON.parse(await readFile(path, "utf8")).version;
    const versions = {
      node: nodeVersion,
      npm: npmVersion.trim(),
      nativeGo: rootGoVersion.trim(),
      compilerGo: compilerGoVersion.trim(),
      goExecutable: rootGoExecutable,
      nodeExecutable: process.execPath,
      chromium: chromiumVersion.trim(),
      chromiumExecutable: chromiumPath,
      playwright: await packageVersion(join(root, "interaction/node_modules/playwright/package.json")),
      react: await packageVersion(join(root, "node_modules/react/package.json")),
      reactDOM: await packageVersion(join(root, "node_modules/react-dom/package.json")),
      esbuild: await packageVersion(join(root, "interaction/node_modules/esbuild/package.json")),
      sourceCommit,
      sourceTree: gitTree,
      lockfiles: {},
    };
    for (const path of ["package-lock.json", "interaction/package-lock.json", "compiled-frontend/package-lock.json"]) {
      versions.lockfiles[path] = beforePins[path];
    }
    await writeJSON(join(attemptRoot, "provenance/toolchains.json"), versions, true);
    return versions;
  });

  await stage("focused-go-certificate-tests", async () => {
    await execute("focused-go-certificate-tests", rootGoExecutable, ["test", "./backendqualification", "./cmd/backend-qualification"], { env: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" } });
    receipt.checks = ["Go certificate registry and CLI tests passed"];
  });

  const buildInputs = await stage("fresh-native-and-react-dom-builds", async () => {
    const { buildQualificationInputs } = await import(pathToFileURL(buildModule).href);
    const inputs = await buildQualificationInputs({ outputDir: join(attemptRoot, "inputs") });
    const required = ["reactCompiled", "reactHelpers", "domCompiled", "domHelpers", "fixturePath", "expectationsPath", "nativePath", "provenancePath"];
    for (const name of required) {
      if (typeof inputs[name] !== "string" || !inputs[name]) throw new Error(`N2 build input is missing ${name}`);
      await access(inputs[name]);
    }
    for (const name of ["reactCompiled", "reactHelpers", "domCompiled", "domHelpers", "nativePath", "provenancePath"]) {
      ensureAttemptPath(inputs[name], name);
    }
    if (resolve(inputs.fixturePath) !== fixturePath || resolve(inputs.expectationsPath) !== resolve(root, "compiled-publications/oracle/expectations.json")) {
      throw new Error("N2 build inputs resolve to an unexpected frozen fixture or literal oracle");
    }
    const [trace, provenance] = await Promise.all([
      readFile(inputs.nativePath, "utf8").then(JSON.parse),
      readFile(inputs.provenancePath, "utf8").then(JSON.parse),
    ]);
    if (trace.schema !== "gobi.compiled-publications-native/v1" || trace.events?.length !== 50 || trace.steps?.length !== 45) {
      throw new Error("fresh N2 native trace differs from the 50-event/45-update contract");
    }
    if (provenance.schema !== "gobi.backend-qualification-build-provenance/v1" || provenance.sourcePinsMatchAfterBuild !== true) {
      throw new Error("N2 provenance is missing its successful source-build boundary");
    }
    for (const [path, pin] of Object.entries(provenance.sourcePins ?? {})) {
      const runnerPin = beforePins[path];
      if (!runnerPin || runnerPin.bytes !== pin.bytes || runnerPin.sha256 !== pin.sha256) {
        throw new Error(`N2 source input is missing from or differs against the outer source boundary: ${path}`);
      }
    }
    const requiredCapabilities = ["effect.cancel", "effect.request-reply", "numeric.float64", "numeric.safe-integer", "view.node"];
    for (const backend of ["react", "dom"]) {
      const profile = provenance[backend];
      if (!profile || profile.capabilities?.length !== requiredCapabilities.length ||
          !requiredCapabilities.every((capability) => profile.capabilities?.includes(capability)) ||
          profile.outputCount <= 0 || profile.outputCount !== profile.outputs?.length) {
        throw new Error(`N2 ${backend} output is missing a required capability or verified output inventory`);
      }
    }
    if (provenance.react.appIRSha256 !== provenance.dom.appIRSha256 ||
        provenance.react.artifacts?.appIR?.sha256 !== provenance.dom.artifacts?.appIR?.sha256 ||
        provenance.react.artifacts?.encoder?.sha256 !== provenance.dom.artifacts?.encoder?.sha256) {
      throw new Error("React and DOM build outputs disagree on AppIR or encoder bytes");
    }
    for (const [backend, modulePath, encoderPath] of [
      ["react", inputs.reactCompiled, inputs.reactHelpers],
      ["dom", inputs.domCompiled, inputs.domHelpers],
    ]) {
      const profile = provenance[backend];
      const appIRPath = resolve(attemptRoot, "inputs", profile.artifacts.appIR.path);
      if (!appIRPath.startsWith(join(attemptRoot, "inputs") + sep)) {
        throw new Error(`N2 ${backend} AppIR artifact escapes the attempt input directory`);
      }
      const [modulePin, encoderPin, appIRPin] = await Promise.all([
        hashFile(modulePath), hashFile(encoderPath),
        hashFile(appIRPath),
      ]);
      if (modulePin.bytes !== profile.artifacts.module.bytes || modulePin.sha256 !== profile.artifacts.module.sha256 ||
          encoderPin.bytes !== profile.artifacts.encoder.bytes || encoderPin.sha256 !== profile.artifacts.encoder.sha256 ||
          appIRPin.bytes !== profile.artifacts.appIR.bytes || appIRPin.sha256 !== profile.appIRSha256) {
        throw new Error(`N2 ${backend} manifest-resolved module, encoder, or AppIR differs from its output pins`);
      }
      const appIR = JSON.parse(await readFile(appIRPath, "utf8"));
      const component = appIR.components?.find((item) => item.id === packagePath && item.packagePath === packagePath);
      if (!component || !requiredCapabilities.every((capability) => component.capabilities?.includes(capability))) {
        throw new Error(`N2 ${backend} AppIR does not declare the five required host/numeric/view capabilities`);
      }
    }
    const inputRecord = { ...Object.fromEntries(await Promise.all(required.map(async (name) => [name, { path: rel(resolve(inputs[name])), ...await hashFile(resolve(inputs[name])) }]))), contractBaseCommitRef: provenance.contractBaseCommitRef };
    await writeJSON(join(attemptRoot, "provenance/build-inputs-summary.json"), inputRecord, true);
    receipt.build = {
      provenance: { path: rel(inputs.provenancePath), ...await hashFile(inputs.provenancePath) },
      nativeTrace: { path: rel(inputs.nativePath), ...await hashFile(inputs.nativePath), events: trace.events.length, goUpdates: trace.steps.length },
      sourceBase: provenance.contractBaseCommitRef,
      react: provenance.react,
      dom: provenance.dom,
    };
    return inputs;
  });

  const qualification = await stage("thirteen-isolated-mounted-cases", async () => {
    const { runQualification } = await import(pathToFileURL(qualificationModule).href);
    const result = await runQualification({
      inputs: buildInputs,
      outputDir: join(attemptRoot, "qualification"),
      chromiumPath,
      sourceCommit,
    });
    const rawReportPath = ensureAttemptPath(result.rawReportPath, "rawReportPath");
    const summaryPath = ensureAttemptPath(result.summaryPath, "summaryPath");
    const [raw, summary] = await Promise.all([
      readFile(rawReportPath, "utf8").then(JSON.parse),
      readFile(summaryPath, "utf8").then(JSON.parse),
    ]);
    if (raw.schema !== "gobi.backend-qualification-run/v1" || raw.sourceCommit !== sourceCommit || raw.results?.length !== 13) {
      throw new Error("N4 raw report schema, source commit, or 13-case count is invalid");
    }
    if (summary.schema !== "gobi.backend-qualification-summary/v1" || summary.status !== "matched" || summary.sourceCommit !== sourceCommit ||
        summary.sourceAttestation !== "explicit-candidate-source" || summary.matrix?.total !== 13 || summary.matrix?.healthy !== 3 ||
        summary.matrix?.faultCases !== 10 || summary.matrix?.passed !== 13 || summary.matrix?.failed !== 0 ||
        summary.globalInfrastructureErrors?.length !== 0 || summary.baseline?.status !== "matched" ||
        summary.baseline?.events !== 50 || summary.baseline?.goUpdates !== 45 || summary.baseline?.stateCheckpoints !== 46 ||
        summary.baseline?.mutationControlsDetected !== 16 ||
        JSON.stringify(summary.baseline?.browserProfiles) !== JSON.stringify(["react", "dom", "swap"])) {
      throw new Error("N4 mounted qualification or healthy full-replay baseline did not match all 13 cases");
    }
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    if (plan.schema !== "gobi.backend-qualification-oracle-plan/v1" || plan.cases?.length !== 13) throw new Error("N5 oracle plan is invalid");
    const byId = new Map(raw.results.map((item) => [item.id, item]));
    if (byId.size !== 13 || plan.cases.some((expected) => {
      const actual = byId.get(expected.id);
      return !actual || actual.backend !== expected.backend || actual.fault !== expected.fault ||
        (actual.infrastructureErrors?.length ?? 0) !== 0 || (actual.pageErrors?.length ?? 0) !== 0;
    })) throw new Error("N4 raw case matrix differs from N5 plan or contains infrastructure/page errors");
    const healthy = plan.cases.filter((item) => item.fault === "none");
    for (const expected of healthy) {
      const actual = byId.get(expected.id);
      if (actual.activated !== false || actual.activationCount !== 0 || actual.eventsObserved !== 50 || actual.traceTicks !== 46 || actual.observedChannels.length !== 0) {
        throw new Error(`healthy profile ${expected.id} is not a complete 50-event/46-checkpoint baseline`);
      }
    }
    const summaryPin = { path: rel(summaryPath), ...await hashFile(summaryPath) };
    const rawPin = { path: rel(rawReportPath), ...await hashFile(rawReportPath) };
    receipt.qualification = { summary: summaryPin, rawReport: rawPin, matrix: summary.matrix, baseline: summary.baseline };
    await writeJSON(join(attemptRoot, "provenance/qualification-inputs.json"), { rawReport: rawPin, summary: summaryPin, plan: { path: rel(planPath), ...await hashFile(planPath) } }, true);
    return { rawReportPath, summaryPath, raw, summary, plan };
  });

  await stage("focused-adapter-and-oracle-tests", async () => {
    const nodeTestDirectories = ["backend-qualification/adapters", "backend-qualification/oracle"];
    const testPaths = [];
    for (const directory of nodeTestDirectories) {
      for (const path of await walkFiles(sourcePath(directory))) if (path.endsWith(".test.mjs")) testPaths.push(rel(path));
    }
    const requiredSharedTests = ["compiled-children/conformance/browser-version.test.mjs"];
    for (const path of requiredSharedTests) {
      await access(sourcePath(path));
      testPaths.push(path);
    }
    if (testPaths.length < 2) throw new Error("focused adapter and independent oracle Node tests are missing");
    await execute("focused-node-tests", process.execPath, ["--test", ...testPaths.sort()], {
      env: {
        GOBI_GO_BIN: rootGoExecutable,
        GOBI_QUALIFICATION_RAW_REPORT: qualification.rawReportPath,
      },
    });
    receipt.checks = [...(receipt.checks ?? []), "default-off adapter and independent oracle tests passed against this attempt's fresh mounted report"];
  });

  const certificatePath = await stage("authoritative-go-certificate", async () => {
    const outputPath = join(attemptRoot, "certificate/certificate.json");
    await execute("go-backend-qualification-certificate", rootGoExecutable, [
      "run", "./cmd/backend-qualification", "--input", qualification.rawReportPath, "--output", outputPath,
    ], { env: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" } });
    const certificate = JSON.parse(await readFile(outputPath, "utf8"));
    if (certificate.schema !== "gobi.backend-qualification-certificate/v1" || certificate.sourceCommit !== sourceCommit ||
        certificate.qualified !== true || certificate.results?.length !== 13) {
      throw new Error("Go certificate did not issue a qualified 13-case result for the candidate source");
    }
    const planById = new Map(qualification.plan.cases.map((item) => [item.id, item]));
    const rawById = new Map(qualification.raw.results.map((item) => [item.id, item]));
    const resultById = new Map(certificate.results.map((item) => [item.id, item]));
    if (resultById.size !== 13 || qualification.plan.caseIds.some((id) => !resultById.has(id))) throw new Error("Go certificate case set is incomplete or duplicated");
    for (const [id, result] of resultById) {
      const planned = planById.get(id);
      const raw = rawById.get(id);
      if (!planned || !raw || result.backend !== planned.backend || result.fault !== planned.fault || result.passed !== true ||
          JSON.stringify(result.expectedChannels) !== JSON.stringify(planned.expectedChannels)) {
        throw new Error(`Go certificate result is not a passing plan-derived case for ${id}`);
      }
      if (planned.fault !== "none" && (!raw.activated || raw.activationCount < 1 || !result.expectedChannels.some((channel) => raw.observedChannels.includes(channel)))) {
        throw new Error(`mounted fault ${id} did not produce an expected observed channel`);
      }
    }
    const pin = { path: rel(outputPath), ...await hashFile(outputPath) };
    receipt.certificate = { ...pin, schema: certificate.schema, qualified: certificate.qualified, results: certificate.results.length };
    return outputPath;
  });

  const demo = await stage("actual-evidence-viewer-and-http-smoke", async () => {
    const site = join(attemptRoot, "demo/site");
    const buildText = await execute("qualification-demo-build", process.execPath, [
      demoBuild, "--raw-report", qualification.rawReportPath, "--certificate", certificatePath, "--output", site,
    ]);
    const build = lastJSON(buildText, "qualification demo build");
    if (build.schema !== "gobi.backend-qualification-demo-build/v1" || build.status !== "passed" || build.qualified !== true ||
        build.caseCount !== 13 || build.healthyCases !== 3 || build.faultCases !== 10 || build.evidenceFilesVerified !== 13) {
      throw new Error("qualification evidence viewer did not build all cases from verified actual evidence");
    }
    const smokePath = join(attemptRoot, "demo/http-smoke.json");
    const smokeText = await execute("qualification-demo-http-smoke", process.execPath, [
      demoSmoke, "--site", site, "--output", smokePath, "--chromium", chromiumPath,
    ], { env: { CHROMIUM_PATH: chromiumPath } });
    const smoke = lastJSON(smokeText, "qualification demo HTTP smoke");
    if (smoke.schema !== "gobi.backend-qualification-demo-smoke/v1" || smoke.status !== "passed" || smoke.qualified !== true ||
        smoke.caseCount !== 13 || smoke.healthyCases !== 3 || smoke.activatedFaultCases !== 10 || smoke.checkCount < 8 || smoke.pageErrors?.length !== 0) {
      throw new Error("qualification demo HTTP smoke did not display actual evidence and the Go verdict");
    }
    receipt.demo = { build, smoke: { path: rel(smokePath), ...await hashFile(smokePath), checks: smoke.checks } };
    return receipt.demo;
  });

  await stage("source-snapshot-and-command-boundary", async () => {
    const sourceRoot = join(attemptRoot, "source");
    for (const [path, pin] of Object.entries(beforePins)) {
      const bytes = await readFile(sourcePath(path));
      if (bytes.length !== pin.bytes || hash(bytes) !== pin.sha256) throw new Error(`source changed while copying snapshot: ${path}`);
      const target = join(sourceRoot, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    }
    const afterPins = await snapshotSourcePins();
    if (JSON.stringify(beforePins) !== JSON.stringify(afterPins)) throw new Error("pinned source changed during qualification");
    for (const [name, path] of Object.entries({ native: buildInputs.nativePath, rawReport: qualification.rawReportPath, certificate: certificatePath })) {
      const captured = name === "native" ? receipt.build.nativeTrace : name === "rawReport" ? receipt.qualification.rawReport : receipt.certificate;
      const current = await hashFile(path);
      if (current.bytes !== captured.bytes || current.sha256 !== captured.sha256) throw new Error(`${name} changed after its qualification stage`);
    }
    receipt.sourceAfter = afterPins;
    receipt.sourcePinsMatch = true;
    const buildProvenance = JSON.parse(await readFile(buildInputs.provenancePath, "utf8"));
    const n2SourcePins = Object.keys(buildProvenance.sourcePins ?? {});
    receipt.sourceBoundary = {
      outerPinCount: Object.keys(beforePins).length,
      n2ProvenancePinCount: n2SourcePins.length,
      n2SourcePinsMatched: n2SourcePins.length,
      sourcePinFiles: { before: rel(join(attemptRoot, "provenance/source-before.json")), after: rel(join(attemptRoot, "provenance/source-after.json")) },
    };
    await writeJSON(join(attemptRoot, "provenance/source-after.json"), afterPins, true);
    return receipt.sourceBoundary;
  });

  const archive = await stage("immutable-archive-and-independent-consumer", async () => {
    receipt.archivePending = true;
    receipt.finalAcceptance = false;
    await saveProgress();
    const preArchivePath = join(attemptRoot, "execution-before-archive.json");
    const preArchive = {
      schema: "gobi.backend-qualification-pre-archive-snapshot/v1",
      attempt: attemptId,
      sourceCommit,
      sourceTree: receipt.versions.sourceTree,
      sourceBefore: receipt.sourceBefore,
      sourceAfter: receipt.sourceAfter,
      sourcePinsMatch: receipt.sourcePinsMatch,
      build: receipt.build,
      qualification: receipt.qualification,
      certificate: receipt.certificate,
      demo: receipt.demo,
      archivePending: true,
      finalAcceptance: false,
    };
    const snapshot = await writeImmutableSnapshot(preArchivePath, preArchive);
    const filePaths = (await walkFiles(attemptRoot, { includeOutput: true })).map((path) => relFrom(path, attemptRoot)).sort();
    const members = [];
    for (const path of filePaths) members.push({ path, ...await hashFile(join(attemptRoot, path)) });
    const manifest = {
      schema: "gobi.backend-qualification-archive/v1",
      policy: "explicit stable NUL-separated file inventory; no recursive tar traversal",
      attempt: attemptId,
      sourceCommit,
      members,
      preArchiveSnapshot: { path: "execution-before-archive.json", bytes: snapshot.byteLength, sha256: hash(snapshot.bytes) },
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(manifestPath, manifestBytes, { flag: "wx", mode: 0o444 });
    const manifestPin = { bytes: manifestBytes.length, sha256: hash(manifestBytes) };
    const producer = await archiveAndVerify({
      attemptRoot,
      archivePath,
      verifyRoot: join(evidenceRoot, "producer-roundtrip"),
      includePaths: ["inputs", "qualification", "certificate", "demo", "provenance", "source", "logs", "execution-before-archive.json", "progress.json"],
      members,
      execute: (name, command, args) => execute(name, command, args, { logRoot: join(evidenceRoot, "archive-command-logs") }),
      hashPath: hashFile,
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    });
    if (producer.archivedSnapshot.schema !== preArchive.schema || producer.archivedSnapshot.archivePending !== true ||
        producer.archivedSnapshot.finalAcceptance !== false || JSON.stringify(producer.archivedSnapshot.sourceBefore) !== JSON.stringify(beforePins) ||
        JSON.stringify(producer.archivedSnapshot.sourceAfter) !== JSON.stringify(receipt.sourceAfter)) {
      throw new Error("producer round-trip archive snapshot differs from the frozen source boundary");
    }
    const archiveBeforeConsumer = await hashFile(archivePath);
    const consumerPath = join(evidenceRoot, "independent-archive-consumer.json");
    const consumerText = await execute("independent-archive-consumer", process.execPath, [
      archiveVerifier,
      "--archive", archivePath,
      "--manifest", manifestPath,
      "--output", consumerPath,
      "--expected-archive-sha256", archiveBeforeConsumer.sha256,
      "--expected-manifest-sha256", manifestPin.sha256,
    ], { logRoot: join(evidenceRoot, "post-archive-command-logs") });
    const consumer = lastJSON(consumerText, "independent archive consumer");
    if (consumer.schema !== "gobi.backend-qualification-independent-archive-verification/v1" || consumer.status !== "passed" ||
        consumer.members !== members.length || consumer.archive.sha256 !== archiveBeforeConsumer.sha256 || consumer.manifest.sha256 !== manifestPin.sha256) {
      throw new Error(`independent consumer rejected the archive: ${JSON.stringify(consumer)}`);
    }
    const archiveAfterConsumer = await hashFile(archivePath);
    const manifestAfterConsumer = await hashFile(manifestPath);
    const afterPins = await snapshotSourcePins();
    if (JSON.stringify(archiveBeforeConsumer) !== JSON.stringify(archiveAfterConsumer) ||
        manifestAfterConsumer.bytes !== manifestPin.bytes || manifestAfterConsumer.sha256 !== manifestPin.sha256 ||
        JSON.stringify(beforePins) !== JSON.stringify(afterPins)) {
      throw new Error("archive, manifest, or source pins changed after the independent consumer");
    }
    receipt.sourceAfterArchive = afterPins;
    receipt.sourcePinsMatch = true;
    return {
      path: rel(archivePath),
      ...archiveAfterConsumer,
      memberCount: members.length,
      manifest: { path: rel(manifestPath), ...manifestAfterConsumer },
      independentConsumer: { path: rel(consumerPath), ...await hashFile(consumerPath), members: consumer.members, status: consumer.status },
      roundTripVerified: true,
      postCommandBoundary: { archiveHashStable: true, manifestHashStable: true, consumerPassed: true, sourcePinsStable: true },
    };
  });

  receipt.archive = archive;
  receipt.archivePending = false;
  receipt.finalAcceptance = true;
  receipt.status = "passed";
  receipt.completedAt = stamp();
  receipt.summary = `Go certified all 13 mounted cases: three healthy baselines matched and ten activated fault cases were detected. HTTP smoke passed ${demo.smoke.checks.length} checks; the ${archive.memberCount}-member archive passed independent verification.`;
}

function relFrom(path, base) {
  return relative(base, path).split(sep).join("/");
}

function reportText() {
  const stageLines = receipt.stages.map((entry) => `| ${entry.name} | ${entry.status}${entry.error ? ` — ${entry.error}` : ""} |`).join("\n");
  const failureLines = receipt.failures.length ? receipt.failures.map((failure) => `- **${failure.stage}:** ${failure.message}`).join("\n") : "- None.";
  const matrix = receipt.qualification?.matrix;
  const baselineCheckpointSummary = receipt.qualification
    ? "Each of the three healthy captures recorded 46 checkpoints."
    : "The frozen healthy-profile target is 46 checkpoints; no completed baseline evidence is available.";
  return [
    "# E-DELIVERY — mounted backend qualification",
    "",
    `Attempt: \`${attemptId}\`; candidate source: \`${sourceCommit}\`; status: **${receipt.status}**.`,
    "",
    receipt.summary,
    "",
    "## Scope",
    "",
    "This packet covers the admitted React and DOM backends and one healthy React/DOM swap. It does not certify arbitrary third backends. Earlier 16 captured-data mutation controls are separate from the ten mounted fault cases. The Go certificate validates the measured report/evidence pairs and source identity; it is not a proof against a malicious producer fabricating browser evidence.",
    "",
    "The inherited regression chain was not run locally. Full inherited CI, review, and publication remain separate root gates.",
    "",
    "## Evidence summary",
    "",
    `- Cases: ${matrix?.total ?? "not available"} total (${matrix?.healthy ?? "?"} healthy baselines matched, ${matrix?.faultCases ?? "?"} faults detected); Go qualified: \`${receipt.certificate?.qualified === true}\`.`,
    `- Native trace: ${receipt.build?.nativeTrace?.events ?? "?"} events, ${receipt.build?.nativeTrace?.goUpdates ?? "?"} Go updates. ${baselineCheckpointSummary}`,
    "- The 13-case matrix is deterministic and uses the frozen 50-event scenario; no randomized schedule seeds are involved.",
    `- HTTP smoke: ${receipt.demo?.smoke?.checks?.length ?? 0} checks; archive: ${receipt.archive?.memberCount ?? "not produced"} members.`,
    `- Source pins matched: \`${receipt.sourcePinsMatch === true}\`; source pin count: ${Object.keys(receipt.sourceBefore ?? {}).length}.`,
    receipt.sourceBoundary ? `- N2 provenance pins: ${receipt.sourceBoundary.n2ProvenancePinCount}; matched to the outer source boundary: ${receipt.sourceBoundary.n2SourcePinsMatched}.` : "- N2 source-pin union was not completed.",
    "",
    "## Stages",
    "",
    "| Stage | Result |",
    "|---|---|",
    stageLines || "| none | not started |",
    "",
    "## Failures",
    "",
    failureLines,
    "",
    "## Provenance",
    "",
    `- Node: ${receipt.versions.node ?? "not recorded"}; native Go: ${receipt.versions.nativeGo ?? "not recorded"}; compiler Go: ${receipt.versions.compilerGo ?? "not recorded"}.`,
    `- Chromium: ${receipt.versions.chromium ?? "not recorded"}; Playwright: ${receipt.versions.playwright ?? "not recorded"}.`,
    `- Runtime attempt receipt: \`${rel(finalReceiptPath)}\`.`,
    `- Archive: ${receipt.archive ? `\`${receipt.archive.path}\`, ${receipt.archive.bytes} bytes, SHA-256 \`${receipt.archive.sha256}\`.` : "not produced."}`,
    `- Archive manifest: ${receipt.archive?.manifest ? `\`${receipt.archive.manifest.path}\`, SHA-256 \`${receipt.archive.manifest.sha256}\`.` : "not produced."}`,
    `- Post-command independent consumer: ${receipt.archive?.postCommandBoundary?.consumerPassed === true ? "passed; archive and manifest hashes stayed stable." : "not completed."}`,
    "",
    "Full command records and per-case evidence are preserved in the immutable attempt and evidence folders.",
    "",
  ].join("\n");
}

try {
  await run();
} catch (error) {
  receipt.status = "failed";
  receipt.finalAcceptance = false;
  receipt.archivePending = false;
  receipt.completedAt = stamp();
  if (receipt.failures.length === 0) {
    receipt.failures.push({ stage: "initialization", message: String(error?.message ?? error) });
  }
  receipt.summary = `Backend qualification failed${receipt.failures.length ? ` during ${receipt.failures.at(-1).stage}` : " before the first stage"}: ${String(error?.message ?? error)}`;
  await saveProgress().catch(() => {});
}

await mkdir(dirname(finalReportPath), { recursive: true });
const reportBytes = Buffer.from(reportText());
await writeFile(finalReportPath, reportBytes, { flag: "wx" });
receipt.report = { path: rel(finalReportPath), bytes: reportBytes.length, sha256: hash(reportBytes) };
await writeJSON(finalReceiptPath, receipt, true);
const stdout = {
  schema: "gobi.backend-qualification-execution-summary/v1",
  status: receipt.status,
  summary: receipt.summary,
  attempt: rel(attemptRoot),
  receipt: rel(finalReceiptPath),
  report: rel(finalReportPath),
  archive: receipt.archive ?? null,
};
process.stdout.write(`${JSON.stringify(stdout)}\n`);
if (receipt.status !== "passed") process.exitCode = 1;
