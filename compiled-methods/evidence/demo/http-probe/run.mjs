import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const compilerOutput = join(root, "compiled-methods/artifacts/compiler-gate/react/output");
const attemptId = new Date().toISOString().replace(/[-:.]/g, "");
const attemptRoot = join(here, `attempt-${attemptId}`);
const logs = join(attemptRoot, "logs");
const site = join(attemptRoot, "site");
const smokePath = join(attemptRoot, "smoke.json");
const screenshotPath = join(attemptRoot, "screenshot.png");
const receiptPath = join(attemptRoot, "receipt.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).split(sep).join("/");
const now = () => new Date().toISOString();

await mkdir(logs, { recursive: true });
const receipt = {
  schema: "gobi.compiled-methods-http-probe/v1",
  job_id: "E-DEMO",
  worker: "N5",
  status: "running",
  outcome: "insufficient_evidence",
  attempt: rel(attemptRoot),
  startedAt: now(),
  invocation: "node compiled-methods/evidence/demo/http-probe/run.mjs",
  environment: {
    nodeExecutable: process.execPath,
    node: process.version,
    PATH: process.env.PATH,
    GOFLAGS: process.env.GOFLAGS ?? null,
    CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? null,
  },
  commands: [],
  checks: [],
  failures: [],
};
await saveReceipt();

async function saveReceipt() {
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

async function hashPath(path) {
  const bytes = await readFile(path);
  return { path: rel(path), bytes: bytes.length, sha256: sha256(bytes) };
}

async function sourcePins() {
  const paths = [
    "compiled-methods/demo/index.html",
    "compiled-methods/demo/demo.css",
    "compiled-methods/demo/app.mjs",
    "compiled-methods/demo/build.mjs",
    "compiled-methods/demo/smoke.mjs",
    "compiled-methods/evidence/demo/http-probe/run.mjs",
    "compiled-methods/run.mjs",
    "run-compiled-methods.sh",
    "compiled-frontend/conformance/browser.mjs",
    "compiled-frontend/conformance/no-wasm.mjs",
    "compiled-frontend/frontend/runtime/runtime.mjs",
    "compiled-frontend/frontend/react/renderer.mjs",
    "compiled-frontend/frontend/dom/renderer.mjs",
    "interaction/package-lock.json",
    "interaction/package.json",
  ];
  const pins = [];
  for (const path of paths) pins.push(await hashPath(join(root, path)));
  return pins;
}

async function directoryPins(directory) {
  const result = [];
  for (const path of await walk(directory)) result.push(await hashPath(path));
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function runCommand(name, args, env = {}) {
  const startedAt = now();
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  const stdoutPath = join(logs, `${name}.stdout.log`);
  const stderrPath = join(logs, `${name}.stderr.log`);
  const record = {
    name,
    command: process.execPath,
    args,
    cwd: root,
    environmentOverrides: env,
    startedAt,
    finishedAt: now(),
    exitCode: child.status,
    signal: child.signal,
    error: child.error?.message ?? null,
    stdoutSha256: sha256(Buffer.from(stdout)),
    stderrSha256: sha256(Buffer.from(stderr)),
    stdoutPath: rel(stdoutPath),
    stderrPath: rel(stderrPath),
  };
  receipt.commands.push(record);
  return { child, stdout, stderr, record, stdoutPath, stderrPath };
}

async function execute(name, args, env = {}) {
  const result = runCommand(name, args, env);
  await Promise.all([
    writeFile(result.stdoutPath, result.stdout),
    writeFile(result.stderrPath, result.stderr),
    saveReceipt(),
  ]);
  if (result.child.error || result.child.status !== 0) {
    const failure = {
      name,
      message: result.child.error?.message ?? (result.stderr.trim() || `${name} exited ${result.child.status}`),
      exitCode: result.child.status,
      signal: result.child.signal,
      stdoutSha256: result.record.stdoutSha256,
      stderrSha256: result.record.stderrSha256,
    };
    receipt.failures.push(failure);
    await saveReceipt();
    throw new Error(`${name} failed with exit ${result.child.status ?? "spawn error"}`);
  }
  return result.stdout;
}

try {
  receipt.sourceBefore = await sourcePins();
  const manifestPath = join(compilerOutput, "buildmanifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.apps?.length !== 1 || manifest.apps[0].backend !== "react" ||
      manifest.apps[0].packagePath !== "github.com/samuelpmahan/gondola/fixtures/compiled/methods") {
    throw new Error("compiler gate does not contain the single React methods app");
  }
  receipt.compilerInput = {
    manifest: await hashPath(manifestPath),
    packagePath: manifest.apps[0].packagePath,
    backend: manifest.apps[0].backend,
    app: {},
    outputPinsBefore: await directoryPins(compilerOutput),
  };
  for (const key of ["appIR", "module", "encoder"]) {
    const path = resolve(compilerOutput, manifest.apps[0][key]);
    if (!path.startsWith(compilerOutput + sep)) throw new Error(`compiler input path escapes output directory: ${key}`);
    receipt.compilerInput.app[key] = await hashPath(path);
  }
  receipt.versions = {
    node: process.version,
    playwright: JSON.parse(await readFile(join(root, "interaction/node_modules/playwright/package.json"), "utf8")).version,
    react: JSON.parse(await readFile(join(root, "interaction/node_modules/react/package.json"), "utf8")).version,
    reactDOM: JSON.parse(await readFile(join(root, "interaction/node_modules/react-dom/package.json"), "utf8")).version,
    esbuild: JSON.parse(await readFile(join(root, "interaction/node_modules/esbuild/package.json"), "utf8")).version,
  };
  receipt.checks.push("captured source pins and compiler-gate React module/AppIR/encoder pins before running the HTTP probe");
  await saveReceipt();

  await execute("build-http-demo", [
    join(root, "compiled-methods/demo/build.mjs"),
    "--compiled", compilerOutput,
    "--output", site,
    "--backend", "react",
  ]);
  receipt.demoOutputPinsBeforeSmoke = await directoryPins(site);
  await saveReceipt();
  await execute("http-demo-smoke", [
    join(root, "compiled-methods/demo/smoke.mjs"),
    "--demo", site,
    "--output", smokePath,
    "--screenshot", screenshotPath,
  ], process.env.CHROMIUM_PATH ? { CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {});
  const smoke = JSON.parse(await readFile(smokePath, "utf8"));
  if (smoke.status !== "passed" || smoke.acceptedDispatches !== 14 || smoke.rendererSwaps !== 3 ||
      JSON.stringify(smoke.finalState) !== JSON.stringify({ parent: 0, child: 2, readOnly: false, savedChild: 1 })) {
    throw new Error("HTTP smoke output did not meet the frozen method-state contract");
  }
  if (smoke.browserErrors?.length !== 0 || smoke.wasmRequests?.length !== 0 ||
      smoke.noWasm?.wasmAPIAttempts?.length !== 0 || smoke.noWasm?.wasmRequests?.length !== 0) {
    throw new Error("HTTP smoke reported browser errors or WebAssembly activity");
  }
  receipt.demoSmoke = {
    ...smoke,
    smoke: await hashPath(smokePath),
    screenshot: await hashPath(screenshotPath),
  };
  receipt.demoOutputPinsAfterSmoke = await directoryPins(site);
  if (JSON.stringify(receipt.demoOutputPinsBeforeSmoke) !== JSON.stringify(receipt.demoOutputPinsAfterSmoke)) {
    throw new Error("HTTP demo files changed during browser smoke");
  }
  receipt.compilerInput.outputPinsAfter = await directoryPins(compilerOutput);
  if (JSON.stringify(receipt.compilerInput.outputPinsBefore) !== JSON.stringify(receipt.compilerInput.outputPinsAfter)) {
    throw new Error("compiler-gate outputs changed during the HTTP probe");
  }
  receipt.sourceAfter = await sourcePins();
  if (JSON.stringify(receipt.sourceBefore) !== JSON.stringify(receipt.sourceAfter)) {
    throw new Error("demo source files changed during HTTP probe");
  }
  receipt.checks.push("real local HTTP route passed the nested methods smoke on React with managed Playwright and remained source/output stable");
  receipt.status = "passed";
  receipt.outcome = "mixed_change";
} catch (error) {
  receipt.status = "failed";
  receipt.outcome = receipt.demoSmoke ? "mixed_change" : "insufficient_evidence";
  receipt.failures.push({ name: "probe", message: error instanceof Error ? error.message : String(error) });
} finally {
  receipt.finishedAt = now();
  try {
    if (!receipt.sourceAfter) receipt.sourceAfter = await sourcePins();
    receipt.sourcePinsMatch = JSON.stringify(receipt.sourceBefore ?? []) === JSON.stringify(receipt.sourceAfter);
  } catch (error) {
    receipt.sourcePinsMatch = false;
    receipt.failures.push({ name: "source-pins-after", message: error instanceof Error ? error.message : String(error) });
    receipt.status = "failed";
  }
  try {
    if (receipt.compilerInput) receipt.compilerInput.outputPinsAfter ??= await directoryPins(compilerOutput);
    if (await lstat(site).then(() => true, () => false)) receipt.demoOutputPinsFinal = await directoryPins(site);
  } catch (error) {
    receipt.failures.push({ name: "output-pins-final", message: error instanceof Error ? error.message : String(error) });
    receipt.status = "failed";
  }
  const report = `# HTTP demo probe\n\n- Attempt: \`${receipt.attempt}\`\n- Status: \`${receipt.status}\`\n- Outcome: \`${receipt.outcome}\`\n- Compiler input: \`${receipt.compilerInput?.app?.module?.path ?? "not resolved"}\`\n- Smoke status: \`${receipt.demoSmoke?.status ?? "not run"}\`\n- Screenshot: \`${receipt.demoSmoke?.screenshot?.path ?? "not captured"}\`\n\n## Checks\n\n${receipt.checks.map((check) => `- ${check}`).join("\n") || "- None completed."}\n\n## Failures\n\n${receipt.failures.map((failure) => `- ${failure.name}: ${failure.message}`).join("\n") || "- None."}\n\nThis is a local HTTP demo probe against the compiler-gate React output. It does not represent the inherited full regression run or a fresh compiler build.\n`;
  const reportPath = join(attemptRoot, "report.md");
  await writeFile(reportPath, report);
  receipt.report = { path: rel(reportPath), bytes: Buffer.byteLength(report), sha256: sha256(Buffer.from(report)) };
  await saveReceipt();
}

console.log(JSON.stringify({ status: receipt.status, attempt: receipt.attempt, browser: receipt.demoSmoke?.browserVersion ?? null }));
if (receipt.status !== "passed") process.exitCode = 1;
