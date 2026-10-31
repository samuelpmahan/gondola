import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const artifacts = join(here, "artifacts");
const reportDirectory = join(here, "coordination/reports");
const receiptDirectory = join(here, "coordination/receipts");
const executionPath = join(artifacts, "execution.json");
const workerReceiptPath = join(receiptDirectory, "E-DEMO.json");
const reportPath = join(reportDirectory, "E-DEMO.md");
const partial = process.argv.includes("--backends-only");
if (process.argv.some(argument => argument !== "--backends-only" && argument !== process.argv[0] && argument !== process.argv[1])) {
  throw new Error("supported option: --backends-only");
}

const names = ["counter", "form", "list", "effect"];
const packagePaths = {
  counter: "github.com/samuelpmahan/gondola/counter",
  form: "github.com/samuelpmahan/gondola/fixtures/compiled/form",
  list: "github.com/samuelpmahan/gondola/fixtures/compiled/list",
  effect: "github.com/samuelpmahan/gondola/fixtures/compiled/effect",
};
const fixturePaths = Object.fromEntries(names.map(name => [name, join(root, "compiled-frontend/fixtures", `${name}.json`)]));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const timestamp = () => new Date().toISOString();
let linkedWorktreeFlags = {};
try {
  if ((await lstat(join(root, ".git"))).isFile()) linkedWorktreeFlags = { GOFLAGS: "-buildvcs=false" };
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const receipt = {
  schema: "gobi.compiled-backends-execution/v1",
  job_id: "E-DEMO",
  worker: "N5",
  mode: partial ? "backends-only" : "full",
  status: "running",
  startedAt: timestamp(),
  commands: [],
  failures: [],
  checks: [],
  environment: Object.fromEntries(["GOTOOLCHAIN", "GOFLAGS", "CHROMIUM_PATH", "CHROMIUM_EXECUTABLE_PATH"].map(key => [key, process.env[key] ?? null])),
};

async function saveReceipt() {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await Promise.all([
    writeFile(executionPath, serialized),
    writeFile(workerReceiptPath, serialized),
  ]);
}

async function recursiveFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const collected = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collected.push(...await recursiveFiles(path));
    else if (entry.isFile()) collected.push(path);
  }
  return collected;
}

async function sourcePins() {
  const directories = [
    "counter", "gobi", "compilercontract", "fixtures/compiled",
    "compiled-frontend/analyze", "compiled-frontend/build", "compiled-frontend/cmd",
    "compiled-frontend/emit", "compiled-frontend/fixtures", "compiled-frontend/conformance",
    "compiled-frontend/frontend", "compiled-frontend/semantic",
    "compiled-backends/demo", "compiled-backends/conformance",
  ];
  const files = [
    "go.mod", "go.sum", "package.json", "package-lock.json", "interaction/package.json",
    "interaction/package-lock.json", "compiled-frontend/go.mod", "compiled-frontend/go.sum",
    "compiled-frontend/package.json", "compiled-frontend/package-lock.json",
    "run-typed-composition.sh", "run-compiled-frontend.sh", "run-compiled-backends.sh",
    ".github/workflows/compiled-backends.yml", "compiled-frontend/run.mjs",
    "compiled-backends/run.mjs",
  ].map(path => join(root, path));
  for (const directory of directories) files.push(...await recursiveFiles(join(root, directory)));
  const unique = [...new Set(files)].filter(path =>
    !path.includes(`${sep}artifacts${sep}`) && !path.includes(`${sep}raw${sep}`),
  ).sort();
  const pins = [];
  for (const path of unique) {
    try {
      pins.push({ path: relative(root, path).split(sep).join("/"), sha256: hash(await readFile(path)) });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return pins;
}

function run(name, command, args, { cwd = root, input, env = {} } = {}) {
  const startedAt = timestamp();
  process.stdout.write(`${name}: ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const entry = {
    name,
    command,
    args,
    cwd,
    environmentOverrides: env,
    startedAt,
    finishedAt: timestamp(),
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    inputSha256: input === undefined ? null : hash(Buffer.from(input)),
    stdoutSha256: hash(Buffer.from(stdout)),
    stderrSha256: hash(Buffer.from(stderr)),
  };
  receipt.commands.push(entry);
  return { result, stdout, stderr, entry };
}

async function execute(name, command, args, options = {}) {
  const value = run(name, command, args, options);
  await Promise.all([
    writeFile(join(artifacts, "logs", `${name}.stdout.log`), value.stdout),
    writeFile(join(artifacts, "logs", `${name}.stderr.log`), value.stderr),
  ]);
  await saveReceipt();
  if (value.result.status !== 0 || value.result.error) {
    const failure = {
      name,
      exitCode: value.result.status,
      signal: value.result.signal,
      error: value.result.error?.message ?? `${name} exited with ${value.result.status}`,
      stdoutSha256: value.entry.stdoutSha256,
      stderrSha256: value.entry.stderrSha256,
    };
    receipt.failures.push(failure);
    await saveReceipt();
    throw new Error(`${name} failed; captured ${name}.stdout.log and ${name}.stderr.log`);
  }
  return value.stdout;
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function recordInheritedExecution() {
  if (partial || receipt.inheritedExecution) return receipt.inheritedExecution ?? null;
  const path = join(root, "compiled-frontend/artifacts/execution.json");
  try {
    const bytes = await readFile(path);
    const inherited = JSON.parse(bytes.toString("utf8"));
    if (!Number.isFinite(Date.parse(inherited.startedAt)) || Date.parse(inherited.startedAt) < Date.parse(receipt.startedAt)) {
      throw new Error("compiled frontend execution receipt predates this backend run");
    }
    receipt.inheritedExecution = {
      path: relative(root, path).split(sep).join("/"),
      sha256: hash(bytes),
      status: inherited.status,
      versions: inherited.versions ?? {},
      commands: inherited.commands ?? [],
      sourceBefore: inherited.sourceBefore ?? [],
      sourceAfter: inherited.sourceAfter ?? [],
      outputPinsBefore: inherited.outputPinsBefore ?? [],
      outputPinsAfter: inherited.outputPinsAfter ?? [],
      apps: inherited.apps ?? [],
      failures: inherited.error ? [inherited.error] : [],
    };
    return receipt.inheritedExecution;
  } catch (error) {
    receipt.inheritedExecutionError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

async function versions() {
  receipt.versions ??= {};
  receipt.versions.node = process.version;
  receipt.versions.react = (await readJSON(join(root, "interaction/node_modules/react/package.json"))).version;
  receipt.versions.reactDOM = (await readJSON(join(root, "interaction/node_modules/react-dom/package.json"))).version;
  receipt.versions.playwright = (await readJSON(join(root, "interaction/node_modules/playwright/package.json"))).version;
  receipt.versions.esbuild = (await readJSON(join(root, "interaction/node_modules/esbuild/package.json"))).version;
  receipt.versions.rootGo = (await execute("version-root-go", "go", ["version"], { env: { GOTOOLCHAIN: "local" } })).trim();
  receipt.versions.compiledGo = (await execute("version-compiled-go", "go", ["version"], { env: { GOTOOLCHAIN: "go1.27.3" } })).trim();
  if (!receipt.versions.rootGo.includes("go1.24.")) throw new Error(`root profile requires Go 1.24.x, got ${receipt.versions.rootGo}`);
  if (!receipt.versions.compiledGo.includes("go1.27.3")) throw new Error(`compiler profile requires Go 1.27.3, got ${receipt.versions.compiledGo}`);
  if (!receipt.versions.node.startsWith("v22.")) throw new Error(`Node 22 is required, got ${receipt.versions.node}`);
  receipt.versions.packageLocks = {};
  for (const path of ["package-lock.json", "interaction/package-lock.json", "compiled-frontend/package-lock.json"]) {
    receipt.versions.packageLocks[path] = hash(await readFile(join(root, path)));
  }
}

function outputLocation(outputDir, outputPath) {
  if (typeof outputPath !== "string" || !outputPath || outputPath.startsWith("/")) throw new Error(`invalid output path ${outputPath}`);
  const full = resolve(outputDir, outputPath);
  if (!full.startsWith(resolve(outputDir) + sep)) throw new Error(`output escapes build directory: ${outputPath}`);
  return full;
}

async function verifyBuild(result, outputDir, backend) {
  if (result.schema !== "gobi.build-result/v1" || result.ok !== true || result.diagnostics.length || result.apps.length !== names.length) {
    throw new Error(`${backend} build did not return a clean four-app success`);
  }
  if (result.preservedPreviousOutput !== false) throw new Error(`${backend} build unexpectedly reported preserved previous output`);
  if (!Array.isArray(result.outputs) || result.outputs.length === 0) throw new Error(`${backend} output inventory is empty`);
  const pins = [];
  for (const item of result.outputs) {
    const path = outputLocation(outputDir, item.path);
    const bytes = await readFile(path);
    const sha256 = hash(bytes);
    if (bytes.length !== item.bytes || sha256 !== item.sha256) throw new Error(`${backend} output pin mismatch: ${item.path}`);
    pins.push({ path: item.path, sha256, bytes: bytes.length });
  }
  const manifest = await readJSON(join(outputDir, "buildmanifest.json"));
  if (!Array.isArray(manifest.apps) || manifest.apps.length !== names.length) throw new Error(`${backend} build manifest must list four apps`);
  const apps = {};
  for (const name of names) {
    const entry = manifest.apps.find(candidate => candidate.packagePath === packagePaths[name]);
    if (!entry || entry.backend !== backend) throw new Error(`${backend} build manifest does not identify ${name} as ${backend}`);
    for (const key of ["appIR", "module", "encoder", "components"]) outputLocation(outputDir, entry[key]);
    apps[name] = entry;
  }
  return { manifest, apps, outputs: pins };
}

async function compareBackendModules(builds) {
  const compared = [];
  const manifestWithoutBackendTags = manifest => ({
    ...manifest,
    apps: manifest.apps.map(({ backend, ...entry }) => entry),
  });
  if (JSON.stringify(manifestWithoutBackendTags(builds.react.manifest)) !== JSON.stringify(manifestWithoutBackendTags(builds.dom.manifest))) {
    throw new Error("React and DOM build manifests differ outside their per-app backend tags");
  }
  const compareExactLists = async (label, reactPaths, domPaths) => {
    const react = [...reactPaths].sort();
    const dom = [...domPaths].sort();
    if (JSON.stringify(react) !== JSON.stringify(dom)) throw new Error(`${label} output inventories differ across backend builds`);
    const files = [];
    for (const path of react) {
      const reactBytes = await readFile(outputLocation(builds.react.outputDir, path));
      const domBytes = await readFile(outputLocation(builds.dom.outputDir, path));
      if (reactBytes.length !== domBytes.length || hash(reactBytes) !== hash(domBytes)) throw new Error(`${label} source differs across backend builds: ${path}`);
      files.push({ path, sha256: hash(reactBytes), bytes: reactBytes.length });
    }
    return files;
  };
  const sharedNodeMap = "react-map.gen.mjs";
  const reactMapReact = await readFile(outputLocation(builds.react.outputDir, sharedNodeMap));
  const reactMapDOM = await readFile(outputLocation(builds.dom.outputDir, sharedNodeMap));
  if (reactMapReact.length !== reactMapDOM.length || hash(reactMapReact) !== hash(reactMapDOM)) {
    throw new Error("backend-specific build changed the shared Gobi node mapping");
  }
  for (const name of names) {
    const react = builds.react.apps[name];
    const dom = builds.dom.apps[name];
    const pins = {};
    for (const key of ["appIR", "encoder", "components"]) {
      const reactBytes = await readFile(outputLocation(builds.react.outputDir, react[key]));
      const domBytes = await readFile(outputLocation(builds.dom.outputDir, dom[key]));
      pins[key] = { sha256: hash(reactBytes), bytes: reactBytes.length, identical: hash(reactBytes) === hash(domBytes) && reactBytes.length === domBytes.length };
      if (!pins[key].identical) throw new Error(`${name} ${key} changed across backend builds`);
    }
    if (JSON.stringify({ ...react, backend: undefined }) !== JSON.stringify({ ...dom, backend: undefined })) {
      throw new Error(`${name} app paths or role bindings changed across backend builds`);
    }
    const reactModule = await readFile(outputLocation(builds.react.outputDir, react.module));
    const domModule = await readFile(outputLocation(builds.dom.outputDir, dom.module));
    pins.module = {
      rawReactSha256: hash(reactModule),
      rawDOMSha256: hash(domModule),
      rawReactBytes: reactModule.length,
      rawDOMBytes: domModule.length,
    };
    compared.push({
      app: name,
      packagePath: packagePaths[name],
      backendTags: [react.backend, dom.backend],
      files: pins,
      forwarderSources: await compareExactLists(`${name} generated Go forwarders`, builds.react.manifest.forwarderSources, builds.dom.manifest.forwarderSources),
      emittedTypeScript: await compareExactLists(`${name} emitted GoScript TypeScript`, builds.react.manifest.emittedTypeScript, builds.dom.manifest.emittedTypeScript),
    });
  }
  receipt.sharedReactMap = { path: sharedNodeMap, sha256: hash(reactMapReact), bytes: reactMapReact.length, identical: true };
  receipt.backendBuildComparison = compared;
  receipt.checks.push("React and DOM manifests match apart from backend tags; AppIR, encoders, components, Gobi node mapping, forwarder sources, and GoScript TypeScript are byte-identical; raw bundle hashes are recorded separately and the demo/harness use one actual bundle with both renderers");
}

function appFiles(build, name) {
  const entry = build.apps[name];
  return {
    appIR: outputLocation(build.outputDir, entry.appIR),
    module: outputLocation(build.outputDir, entry.module),
    encoder: outputLocation(build.outputDir, entry.encoder),
  };
}

async function generateReport() {
  const commandLine = entry => {
    const overrides = Object.keys(entry.environmentOverrides ?? {}).length ? `; env ${JSON.stringify(entry.environmentOverrides)}` : "";
    return `- \`${entry.command} ${entry.args.join(" ")}\` — exit ${entry.exitCode ?? "unknown"} (${entry.name}${overrides}).`;
  };
  const commands = receipt.commands.map(commandLine).join("\n");
  const inheritedCommands = (receipt.inheritedExecution?.commands ?? []).map(entry => commandLine({ ...entry, name: `inherited/${entry.name}` })).join("\n");
  const versionLines = Object.entries(receipt.versions ?? {}).filter(([, value]) => typeof value === "string").map(([key, value]) => `- ${key}: \`${value}\``).join("\n") || "- Versions were not fully recorded.";
  const checkLines = receipt.checks.map(check => `- ${check}`).join("\n") || "- No end-to-end check completed.";
  const failureLines = receipt.failures.map(failure => `- ${failure.name}: ${failure.error} (stdout ${failure.stdoutSha256}, stderr ${failure.stderrSha256}).`).join("\n") || "- None recorded.";
  const sourceChangeCount = receipt.sourceBefore && receipt.sourceAfter ? JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter) ? "unchanged" : "changed during execution" : "not fully recorded";
  const content = `# E-DEMO\n\n**Outcome: ${receipt.outcome ?? "insufficient_evidence"}.** ${receipt.summary ?? "The run did not reach a complete backend demo verification."}\n\n## Execution\n\n- Mode: \`${receipt.mode}\`\n- Status: \`${receipt.status}\`\n- Source pins: ${sourceChangeCount}\n- Started: ${receipt.startedAt}\n- Finished: ${receipt.finishedAt}\n\nExact commands executed:\n\n${commands || "- None."}${inheritedCommands ? `\n\nNested inherited runner commands:\n\n${inheritedCommands}` : ""}\n\n## Versions\n\n${versionLines}\n\n## Checks\n\n${checkLines}\n\n## Failures\n\n${failureLines}\n\n## Limits\n\n- The demo's effect host is in memory and returns the captured argument; it does not send production transport requests.\n- The DOM and React renderers replace physical nodes. The check asserts Go state, focus/selection where the renderer contract covers it, preserved pending effect delivery, and stale callback suppression; it does not assert cross-backend DOM node identity.\n- A renderer replacement failure is surfaced without a visual rollback guarantee.\n- Raw bundle hashes from separate compiler output directories are retained; no bundle normalization is treated as proof. The demo and harness each load one actual raw compiled module and exercise it with both renderers.\n- ${linkedWorktreeFlags.GOFLAGS ? "For this linked worktree, GOFLAGS=-buildvcs=false disables binary VCS stamping only; the command remains in the receipt." : "The checkout uses its configured Go VCS stamping behavior."}\n- ${partial ? "This was the explicit --backends-only route; inherited full regression gates were skipped." : "The inherited full runner was requested before backend-specific checks."}\n`;
  await writeFile(reportPath, content);
}

async function main() {
  await mkdir(reportDirectory, { recursive: true });
  await mkdir(receiptDirectory, { recursive: true });
  await saveReceipt();
  try {
    for (const path of [
      "logs", "compiled", "demo", "conformance", "compiled-native",
      "react-request.json", "dom-request.json", "react-build-result.json", "dom-build-result.json",
      "demo-smoke.json", "demo.png",
    ]) await rm(join(artifacts, path), { recursive: true, force: true });
    await mkdir(join(artifacts, "logs"), { recursive: true });
    receipt.sourceBefore = await sourcePins();
    await saveReceipt();
    for (const [name, path] of [
      ["syntax-runner", join(here, "run.mjs")],
      ["syntax-demo-app", join(here, "demo/app.mjs")],
      ["syntax-demo-build", join(here, "demo/build.mjs")],
      ["syntax-demo-smoke", join(here, "demo/smoke.mjs")],
    ]) await execute(name, process.execPath, ["--check", path]);
    await execute("syntax-shell-runner", "bash", ["-n", join(root, "run-compiled-backends.sh")]);
    await versions();
    if (!partial) {
      await execute("inherited-full-runner", "bash", [join(root, "run-compiled-frontend.sh")], {
        env: { ...linkedWorktreeFlags, GONDOLA_SKIP_NPM_CI: "1", GONDOLA_SKIP_BROWSER_INSTALL: "1" },
      });
      const inherited = await recordInheritedExecution();
      if (!inherited || inherited.status !== "passed") throw new Error("inherited compiled frontend receipt did not report passed");
      receipt.checks.push("full inherited run-compiled-frontend.sh completed before backend-specific checks");
    } else {
      receipt.checks.push("--backends-only explicitly skipped the inherited frontend regression chain");
    }

    const nativePath = join(artifacts, "compiled-native");
    await execute("build-native", "go", ["build", "-o", nativePath, "./cmd/compiled-native"], {
      env: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
    });

    const builds = {};
    receipt.backendBuilds = {};
    for (const backend of ["react", "dom"]) {
      const outputDir = join(artifacts, "compiled", backend);
      await mkdir(outputDir, { recursive: true });
      const request = {
        schema: "gobi.build-request/v1",
        sourceRoot: root,
        entryPackages: names.map(name => packagePaths[name]),
        backend,
        outputDir,
      };
      const requestPath = join(artifacts, `${backend}-request.json`);
      await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);
      const output = await execute(`compile-${backend}`, "go", ["run", "./cmd/gobi-build"], {
        cwd: join(root, "compiled-frontend"),
        input: JSON.stringify(request),
        env: { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" },
      });
      const buildResult = JSON.parse(output);
      builds[backend] = { ...await verifyBuild(buildResult, outputDir, backend), outputDir, buildResult };
      const resultArtifact = join(artifacts, `${backend}-build-result.json`);
      await writeFile(resultArtifact, `${JSON.stringify(buildResult, null, 2)}\n`);
      receipt.backendBuilds[backend] = {
        outputDir: relative(root, outputDir).split(sep).join("/"),
        requestPath: relative(root, requestPath).split(sep).join("/"),
        resultPath: relative(root, resultArtifact).split(sep).join("/"),
        schema: buildResult.schema,
        ok: buildResult.ok,
        appCount: buildResult.apps.length,
        diagnostics: buildResult.diagnostics,
        preservedPreviousOutput: buildResult.preservedPreviousOutput,
        outputPins: builds[backend].outputs,
      };
      receipt.checks.push(`${backend} CLI build published four apps with the requested per-app backend metadata`);
    }
    await compareBackendModules(builds);
    receipt.sharedRuntimeModuleUse = names.map(name => ({
      app: name,
      rawModulePath: relative(root, appFiles(builds.react, name).module).split(sep).join("/"),
      harnessAndDemoRendererSet: ["react", "dom"],
      moduleLoads: 1,
    }));
    receipt.outputPinsBefore = Object.fromEntries(["react", "dom"].map(backend => [backend, builds[backend].outputs]));

    const nativeStats = await readFile(nativePath);
    receipt.nativeBinary = { path: relative(root, nativePath).split(sep).join("/"), sha256: hash(nativeStats), bytes: nativeStats.length };

    const conformanceDirectory = join(artifacts, "conformance");
    await mkdir(conformanceDirectory, { recursive: true });
    const driverPath = join(here, "conformance/run.mjs");
    receipt.backendConformance = [];
    const profiles = [
      ...names.map(name => ({ name, app: name, fixture: fixturePaths[name] })),
      { name: "list-growth", app: "list", fixture: join(root, "compiled-frontend/conformance/fixtures/list-growth.json") },
    ];
    for (const profile of profiles) {
      const { name } = profile;
      const files = appFiles(builds.react, profile.app);
      const args = [
        driverPath,
        "--app-ir", files.appIR,
        "--compiled", files.module,
        "--helpers", files.encoder,
        "--native-bin", nativePath,
        "--fixture", profile.fixture,
        "--output", join(conformanceDirectory, `${name}.json`),
      ];
      const chromiumPath = process.env.CHROMIUM_PATH;
      if (chromiumPath) args.push("--chromium", chromiumPath);
      const output = await execute(`backend-conformance-${name}`, process.execPath, args, {
        env: { ...(process.env.CHROMIUM_PATH ? { CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {}) },
      });
      const conformanceResult = JSON.parse(output.trim().split("\n").at(-1));
      if (conformanceResult.status !== "matched") throw new Error(`${name} backend conformance did not report matched`);
      const stem = join(conformanceDirectory, `${name}.json`);
      const conformanceRun = await readJSON(`${stem}.run.json`);
      const conformanceCheck = await readJSON(`${stem}.check.json`);
      if (conformanceRun.status !== "matched") throw new Error(`${name} conformance receipt did not report matched`);
      receipt.backendConformance.push({
        profile: name,
        status: conformanceRun.status,
        fixture: conformanceRun.inputs.fixture,
        versions: conformanceRun.versions,
        sourcePinsBefore: conformanceRun.sourcePinsBefore,
        sourcePinsAfter: conformanceRun.sourcePinsAfter,
        sourceStable: conformanceRun.sourceStable,
        outputPins: conformanceRun.outputPins,
        check: conformanceCheck,
        files: conformanceRun.outputPaths,
      });
      receipt.checks.push(`${name} native/direct/browser backend conformance passed`);
    }

    const demoOutput = join(artifacts, "demo");
    await execute("build-http-demo", process.execPath, [
      join(here, "demo/build.mjs"),
      "--compiled", builds.react.outputDir,
      "--output", demoOutput,
      "--backend", "react",
    ]);
    const demoPins = await recursiveFiles(demoOutput);
    receipt.demoOutputPinsBeforeSmoke = [];
    for (const path of demoPins) receipt.demoOutputPinsBeforeSmoke.push({ path: relative(root, path).split(sep).join("/"), sha256: hash(await readFile(path)) });

    const smokeOutput = await execute("http-demo-smoke", process.execPath, [join(here, "demo/smoke.mjs"), "--demo", demoOutput], {
      env: process.env.CHROMIUM_PATH ? { CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {},
    });
    const smoke = JSON.parse(smokeOutput.trim().split("\n").at(-1));
    receipt.demoSmoke = smoke;
    if (smoke.status !== "passed") throw new Error("HTTP demo smoke did not report passed");
    const demoAfterSmoke = await recursiveFiles(demoOutput);
    receipt.demoOutputPinsAfterSmoke = [];
    for (const path of demoAfterSmoke) receipt.demoOutputPinsAfterSmoke.push({ path: relative(root, path).split(sep).join("/"), sha256: hash(await readFile(path)) });
    const beforeDemo = receipt.demoOutputPinsBeforeSmoke.map(item => ({
      path: item.path.replace("compiled-backends/artifacts/demo/", ""),
      sha256: item.sha256,
    })).sort((a, b) => a.path.localeCompare(b.path));
    const afterDemo = receipt.demoOutputPinsAfterSmoke.map(item => ({ path: item.path, sha256: item.sha256 })).map(item => ({
      ...item,
      path: item.path.replace("compiled-backends/artifacts/demo/", ""),
    })).sort((a, b) => a.path.localeCompare(b.path));
    if (JSON.stringify(beforeDemo) !== JSON.stringify(afterDemo)) throw new Error("HTTP demo bundle files changed while the browser smoke was running");
    for (const path of [join(artifacts, "demo-smoke.json"), join(artifacts, "demo.png")]) {
      const bytes = await readFile(path);
      (receipt.demoEvidencePins ??= []).push({ path: relative(root, path).split(sep).join("/"), sha256: hash(bytes), bytes: bytes.length });
    }
    receipt.checks.push("four-card HTTP demo passed state, focus/selection, stale callback, pending effect, and no-WASM assertions");
    receipt.status = "passed";
    receipt.outcome = "mixed_change";
    receipt.summary = "The HTTP demo and backend runner now build both compiler profiles, compare their shared AppIR and helper outputs, and exercise each actual GoScript module through state-preserving DOM/React swaps.";
  } catch (error) {
    receipt.status = "failed";
    receipt.outcome = receipt.checks.some(check => /conformance passed|HTTP demo passed/.test(check)) ? "mixed_change" : "insufficient_evidence";
    receipt.summary = error instanceof Error ? error.message : String(error);
    if (!receipt.failures.length) receipt.failures.push({ name: "runner", error: receipt.summary });
    process.exitCode = 1;
  } finally {
    await recordInheritedExecution();
    receipt.finishedAt = timestamp();
    try {
      receipt.sourceAfter = await sourcePins();
      receipt.sourcePinsMatch = JSON.stringify(receipt.sourceBefore ?? []) === JSON.stringify(receipt.sourceAfter);
    } catch (error) {
      receipt.failures.push({ name: "source-pins-after", error: error instanceof Error ? error.message : String(error) });
      receipt.sourcePinsMatch = false;
    }
    receipt.outputPinsAfter = {};
    for (const backend of ["react", "dom"]) {
      const outputDir = join(artifacts, "compiled", backend);
      const files = await recursiveFiles(outputDir);
      receipt.outputPinsAfter[backend] = [];
      for (const path of files) receipt.outputPinsAfter[backend].push({ path: relative(root, path).split(sep).join("/"), sha256: hash(await readFile(path)) });
      if (receipt.outputPinsBefore?.[backend]) {
        const before = receipt.outputPinsBefore[backend].map(item => ({ path: item.path, sha256: item.sha256 })).sort((a, b) => a.path.localeCompare(b.path));
        const after = receipt.outputPinsAfter[backend].map(item => ({ path: item.path.replace(`compiled-backends/artifacts/compiled/${backend}/`, ""), sha256: item.sha256 })).sort((a, b) => a.path.localeCompare(b.path));
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          receipt.status = "failed";
          receipt.outcome = "mixed_change";
          receipt.summary = `${backend} compiled output pins changed during backend conformance or demo smoke.`;
          receipt.failures.push({ name: "output-pins", error: `${backend} output hashes differ before and after browser checks` });
          process.exitCode = 1;
        }
      }
    }
    if (receipt.status === "passed" && receipt.sourcePinsMatch !== true) {
      receipt.status = "failed";
      receipt.outcome = "mixed_change";
      receipt.summary = "Sources changed during the execution; backend output pins remain recorded, but the run is not accepted as a stable build.";
      receipt.failures.push({ name: "source-pins", error: "source pins differ before and after execution" });
      process.exitCode = 1;
    }
    await saveReceipt();
    await generateReport();
    process.stdout.write(`compiled-backends: ${receipt.status} (${receipt.mode})\n`);
  }
}

await mkdir(artifacts, { recursive: true });
await main();
