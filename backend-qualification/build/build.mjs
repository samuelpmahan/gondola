import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const compilerRoot = join(root, "compiled-frontend");
const packagePath = "github.com/samuelpmahan/gondola/fixtures/compiled/publications";
const fixturePath = join(root, "fixtures/compiled/publications/scenario.json");
const planPath = join(root, "backend-qualification/oracle/plan.json");
const expectationsPath = join(root, "compiled-publications/oracle/expectations.json");
const qualificationContractPath = join(root, "backend-qualification/CONTRACT.md");
export const contractBaseCommitRef = "5662efcd7feb7920e4690d38cc76a297fed69d5a";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const compilerGoEnv = {
  GOTOOLCHAIN: "go1.27.3",
  GOFLAGS: "-buildvcs=false",
};

export function validateContractBaseCommitRef(reference, contractText) {
  if (typeof reference !== "string" || !/^[0-9a-f]{40}$/.test(reference)) {
    throw new Error("contract base commit reference must be exactly 40 lowercase hexadecimal characters");
  }
  if (typeof contractText !== "string") throw new Error("qualification contract text is required");
  const match = contractText.match(/^Base([0-9a-f]{40})\(PR17\)/m);
  if (!match) throw new Error("qualification contract must declare a 40-character PR17 base commit");
  if (reference !== match[1]) throw new Error("builder base commit reference does not match backend-qualification/CONTRACT.md");
  return reference;
}

function rel(path) {
  return relative(root, path).split(sep).join("/");
}

function outputRel(outputRoot, path) {
  return relative(outputRoot, path).split(sep).join("/");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function hashFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function hashTreeFiles(paths) {
  const rows = {};
  for (const path of [...new Set(paths)].sort()) {
    rows[rel(path)] = await hashFile(path);
  }
  return rows;
}

async function walkFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "coordination", "build", "output", "evidence", "attempts"].includes(entry.name)) continue;
      files.push(...await walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function collectSourcePins() {
  const sourceDirectories = [
    "fixtures/compiled/publications",
    "cmd/compiled-publications-native",
    "counter",
    "gobi",
    "compilercontract",
    "reactmap",
    "compiled-frontend/analyze",
    "compiled-frontend/build",
    "compiled-frontend/emit",
    "compiled-frontend/frontend",
  ];
  const sourceFiles = [
    "go.mod",
    "compiled-frontend/go.mod",
    "compiled-frontend/go.sum",
    "compiled-frontend/cmd/gobi-build/main.go",
    "compiled-frontend/package.json",
    "compiled-frontend/package-lock.json",
    "package.json",
    "package-lock.json",
    "interaction/package-lock.json",
    "compiled-publications/CONTRACT.md",
    "backend-qualification/CONTRACT.md",
    "compiled-publications/oracle/expectations.json",
    "backend-qualification/build/build.mjs",
    "backend-qualification/oracle/plan.json",
  ].map((path) => join(root, path));
  const all = [...sourceFiles];
  for (const directory of sourceDirectories) {
    all.push(...await walkFiles(join(root, directory)));
  }
  return hashTreeFiles(all);
}

async function locateExecutable(envName, preferred, fallback) {
  const configured = process.env[envName];
  const candidates = [configured, preferred].filter(Boolean);
  for (const candidate of candidates) {
    if (await exists(candidate)) return resolve(candidate);
  }
  return fallback;
}

function run(command, args, { cwd, env, input, label, logRoot }) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const record = {
    label,
    command,
    args,
    cwd: rel(cwd),
    environment: env,
    exitCode: result.status,
    signal: result.signal ?? null,
    spawnError: result.error ? String(result.error.message ?? result.error) : null,
    stdoutBytes: Buffer.byteLength(result.stdout ?? ""),
    stdoutSha256: sha256(Buffer.from(result.stdout ?? "")),
    stderrBytes: Buffer.byteLength(result.stderr ?? ""),
    stderrSha256: sha256(Buffer.from(result.stderr ?? "")),
  };
  if (input !== undefined) {
    record.stdinBytes = Buffer.byteLength(input);
    record.stdinSha256 = sha256(Buffer.from(input));
  }
  return { ...result, record, logRoot };
}

async function saveCommand(outputRoot, commandResult) {
  const { record, stdout, stderr } = commandResult;
  const base = join(outputRoot, "provenance/commands", record.label);
  await mkdir(dirname(base), { recursive: true });
  await Promise.all([
    writeFile(`${base}.command.json`, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" }),
    writeFile(`${base}.stdout.log`, stdout ?? "", { flag: "wx" }),
    writeFile(`${base}.stderr.log`, stderr ?? "", { flag: "wx" }),
  ]);
  if (record.exitCode !== 0 || record.spawnError) {
    throw new Error(`${record.label} failed (exit ${record.exitCode ?? "signal"}): ${(stderr ?? "").trim() || record.spawnError || "no stderr"}`);
  }
  return stdout;
}

function parseOneJSON(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error.message}`);
  }
}

async function assertCleanDirectory(path) {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
    return;
  }
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error(`output path is not a directory: ${path}`);
  if ((await readdir(path)).length !== 0) throw new Error(`output directory must be empty for a fresh build: ${path}`);
}

async function validateBuild(backend, outputRoot, goExecutable, nodeExecutable) {
  const buildRoot = join(outputRoot, "builds", backend);
  const compilerOutputDir = join(buildRoot, "output");
  await mkdir(compilerOutputDir, { recursive: true });
  const request = {
    schema: "gobi.build-request/v1",
    sourceRoot: root,
    entryPackages: [packagePath],
    backend,
    outputDir: compilerOutputDir,
  };
  const requestPath = join(buildRoot, "request.json");
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { flag: "wx" });
  const invocation = run(
    goExecutable,
    ["run", "./cmd/gobi-build"],
    {
      cwd: compilerRoot,
      env: { ...compilerGoEnv, GOBI_NODE: nodeExecutable },
      input: `${JSON.stringify(request)}\n`,
      label: `goscript-${backend}`,
      logRoot: outputRoot,
    },
  );
  const output = await saveCommand(outputRoot, invocation);
  const buildResult = parseOneJSON(output, `${backend} GoScript CLI`);
  if (buildResult.schema !== "gobi.build-result/v1" || buildResult.ok !== true ||
      (buildResult.diagnostics?.length ?? 0) !== 0 || buildResult.apps?.length !== 1 ||
      buildResult.apps[0].packagePath !== packagePath) {
    throw new Error(`${backend} GoScript CLI did not produce one clean publications build`);
  }

  const manifestPath = join(compilerOutputDir, "buildmanifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = parseOneJSON(manifestBytes.toString("utf8"), `${backend} manifest`);
  if (manifest.schema !== "gobi.build-manifest/v1" || manifest.apps?.length !== 1) {
    throw new Error(`${backend} manifest does not contain exactly one app`);
  }
  const app = manifest.apps[0];
  if (app.backend !== backend || app.packagePath !== packagePath || app.componentId !== packagePath) {
    throw new Error(`${backend} manifest app identity does not match the frozen fixture`);
  }

  const artifacts = {};
  for (const key of ["appIR", "module", "encoder"]) {
    const value = app[key];
    if (typeof value !== "string" || !value || value.startsWith("/")) {
      throw new Error(`${backend} manifest has invalid relative path for ${key}`);
    }
    const path = resolve(compilerOutputDir, value);
    if (!path.startsWith(`${compilerOutputDir}${sep}`)) throw new Error(`${backend} manifest path escapes the build output`);
    artifacts[key] = path;
  }
  const appIRBytes = await readFile(artifacts.appIR);
  const appIR = parseOneJSON(appIRBytes.toString("utf8"), `${backend} AppIR`);
  const component = appIR.components?.find((item) => item.id === packagePath && item.packagePath === packagePath);
  if (!component || !Array.isArray(component.capabilities)) throw new Error(`${backend} AppIR has no matching component capabilities`);
  const requiredCapabilities = [
    "effect.cancel",
    "effect.request-reply",
    "numeric.float64",
    "numeric.safe-integer",
    "view.node",
  ];
  for (const capability of requiredCapabilities) {
    if (!component.capabilities.includes(capability)) throw new Error(`${backend} AppIR is missing ${capability}`);
  }

  if (!Array.isArray(buildResult.outputs) || buildResult.outputs.length === 0) {
    throw new Error(`${backend} BuildResult has no output inventory`);
  }
  const outputPins = [];
  const seen = new Set();
  for (const outputRecord of buildResult.outputs) {
    if (typeof outputRecord.path !== "string" || !outputRecord.path || seen.has(outputRecord.path)) {
      throw new Error(`${backend} BuildResult has a missing or duplicate output path`);
    }
    seen.add(outputRecord.path);
    const path = resolve(compilerOutputDir, outputRecord.path);
    if (!path.startsWith(`${compilerOutputDir}${sep}`)) throw new Error(`${backend} BuildResult path escapes output`);
    const actual = await hashFile(path);
    if (actual.bytes !== outputRecord.bytes || actual.sha256 !== outputRecord.sha256) {
      throw new Error(`${backend} BuildResult hash mismatch for ${outputRecord.path}`);
    }
    outputPins.push({ path: outputRecord.path.split(sep).join("/"), ...actual });
  }
  const physicalFiles = (await walkFiles(compilerOutputDir))
    .map((path) => relative(compilerOutputDir, path).split(sep).join("/"))
    .sort();
  const resultFiles = outputPins.map((item) => item.path).sort();
  if (JSON.stringify(physicalFiles) !== JSON.stringify(resultFiles)) {
    throw new Error(`${backend} physical output tree differs from BuildResult inventory`);
  }

  const artifactPins = {};
  for (const [key, path] of Object.entries(artifacts)) artifactPins[key] = { path: outputRel(outputRoot, path), ...await hashFile(path) };
  return {
    backend,
    buildRoot: outputRel(outputRoot, buildRoot),
    request: { path: outputRel(outputRoot, requestPath), ...await hashFile(requestPath) },
    result: buildResult,
    manifest: { path: outputRel(outputRoot, manifestPath), ...await hashFile(manifestPath) },
    componentId: component.id,
    capabilities: component.capabilities,
    requiredCapabilities,
    artifacts: artifactPins,
    outputCount: outputPins.length,
    outputs: outputPins,
    modulePath: artifacts.module,
    helperPath: artifacts.encoder,
    appIRBytes: appIRBytes.length,
    appIRSha256: sha256(appIRBytes),
  };
}

/**
 * Build fresh React and DOM GoScript outputs, capture the native Go trace, and
 * return process-ready artifact paths together with portable provenance.
 */
export async function buildQualificationInputs({ outputDir }) {
  if (typeof outputDir !== "string" || !outputDir.trim()) throw new Error("outputDir is required");
  validateContractBaseCommitRef(contractBaseCommitRef, await readFile(qualificationContractPath, "utf8"));
  const outputRoot = resolve(root, outputDir);
  await mkdir(outputRoot, { recursive: true });
  await assertCleanDirectory(join(outputRoot, "builds"));
  await assertCleanDirectory(join(outputRoot, "native"));
  await assertCleanDirectory(join(outputRoot, "provenance"));

  for (const path of [qualificationContractPath, fixturePath, planPath, expectationsPath]) {
    if (!(await exists(path))) throw new Error(`required qualification input is missing: ${rel(path)}`);
  }
  const scenario = parseOneJSON(await readFile(fixturePath, "utf8"), "publications scenario");
  if (scenario.schema !== "gobi.compiled-publications-scenario/v1" || scenario.packagePath !== packagePath || scenario.events?.length !== 50) {
    throw new Error("publications scenario no longer matches its frozen 50-event source profile");
  }
  const plan = parseOneJSON(await readFile(planPath, "utf8"), "qualification plan");
  const expectations = parseOneJSON(await readFile(expectationsPath, "utf8"), "baseline expectations");
  if (plan.schema !== "gobi.backend-qualification-oracle-plan/v1" || plan.caseCount !== 13 || plan.cases?.length !== 13) {
    throw new Error("qualification plan does not match the frozen 13-case schema");
  }
  const fixtureHash = (await hashFile(fixturePath)).sha256;
  const oracleHash = (await hashFile(expectationsPath)).sha256;
  if (plan.scenario?.path !== rel(fixturePath) || plan.scenario?.sha256 !== fixtureHash) {
    throw new Error("qualification plan scenario pin does not match the fixture bytes");
  }
  if (expectations.schema !== "gobi.compiled-publications-oracle-expectations/v1" ||
      plan.baselineOracle?.path !== rel(expectationsPath) || plan.baselineOracle?.schema !== expectations.schema ||
      plan.baselineOracle?.sha256 !== oracleHash) {
    throw new Error("qualification plan baseline-oracle pin does not match its source bytes");
  }

  const goExecutable = await locateExecutable("GOBI_GO_BIN", "/tmp/gondola-go/bin/go", "go");
  const nodeExecutable = await locateExecutable("GOBI_NODE", "/tmp/gondola-node22/node_modules/node/bin/node", "node");
  const beforePins = await collectSourcePins();

  const nodeVersion = run(nodeExecutable, ["--version"], {
    cwd: root,
    env: {},
    label: "node-version",
    logRoot: outputRoot,
  });
  const rootGoVersion = run(goExecutable, ["version"], {
    cwd: root,
    env: rootGoEnv,
    label: "native-go-version",
    logRoot: outputRoot,
  });
  const compilerGoVersion = run(goExecutable, ["version"], {
    cwd: compilerRoot,
    env: compilerGoEnv,
    label: "compiler-go-version",
    logRoot: outputRoot,
  });
  const versions = {
    node: (await saveCommand(outputRoot, nodeVersion)).trim(),
    nativeGo: (await saveCommand(outputRoot, rootGoVersion)).trim(),
    compilerGo: (await saveCommand(outputRoot, compilerGoVersion)).trim(),
    goExecutable,
    nodeExecutable,
  };
  if (!versions.node.startsWith("v22.")) throw new Error(`Node 22 required, got ${versions.node}`);
  if (!versions.nativeGo.includes("go1.24.")) throw new Error(`native Go 1.24 required, got ${versions.nativeGo}`);
  if (!versions.compilerGo.includes("go1.27.3")) throw new Error(`compiler Go 1.27.3 required, got ${versions.compilerGo}`);

  const nativeResult = run(
    goExecutable,
    ["run", "./cmd/compiled-publications-native", "--script", "fixtures/compiled/publications/scenario.json"],
    { cwd: root, env: rootGoEnv, label: "native-publications-trace", logRoot: outputRoot },
  );
  const nativeStdout = await saveCommand(outputRoot, nativeResult);
  const nativeTrace = parseOneJSON(nativeStdout, "native publications CLI");
  if (nativeTrace.schema !== "gobi.compiled-publications-native/v1" || nativeTrace.packagePath !== packagePath ||
      nativeTrace.events?.length !== 50 || nativeTrace.steps?.length !== 45) {
    throw new Error("fresh native trace differs from the frozen 50-event/45-update profile");
  }
  const nativePath = join(outputRoot, "native/native-trace.json");
  await writeFile(nativePath, `${JSON.stringify(nativeTrace, null, 2)}\n`, { flag: "wx" });

  const react = await validateBuild("react", outputRoot, goExecutable, nodeExecutable);
  const dom = await validateBuild("dom", outputRoot, goExecutable, nodeExecutable);
  if (react.appIRSha256 !== dom.appIRSha256 || react.capabilities.join("\n") !== dom.capabilities.join("\n")) {
    throw new Error("React and DOM outputs disagree on AppIR or component capabilities");
  }

  const afterPins = await collectSourcePins();
  if (JSON.stringify(beforePins) !== JSON.stringify(afterPins)) throw new Error("pinned source changed during builds");
  const lockPaths = [
    "go.mod",
    "compiled-frontend/go.mod",
    "compiled-frontend/go.sum",
    "package-lock.json",
    "compiled-frontend/package-lock.json",
    "interaction/package-lock.json",
  ];
  const provenance = {
    schema: "gobi.backend-qualification-build-provenance/v1",
    contractBaseCommitRef,
    packagePath,
    fixture: { path: rel(fixturePath), ...await hashFile(fixturePath) },
    plan: { path: rel(planPath), ...await hashFile(planPath), schema: plan.schema, caseCount: plan.caseCount },
    expectations: { path: rel(expectationsPath), ...await hashFile(expectationsPath), schema: expectations.schema },
    nativeTrace: { path: outputRel(outputRoot, nativePath), ...await hashFile(nativePath), events: nativeTrace.events.length, steps: nativeTrace.steps.length },
    versions,
    locks: Object.fromEntries(lockPaths.map((path) => [path, beforePins[path]])),
    sourcePins: beforePins,
    sourcePinsMatchAfterBuild: true,
    react,
    dom,
  };
  const provenancePath = join(outputRoot, "provenance/build-inputs.json");
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" });

  return {
    reactCompiled: react.modulePath,
    reactHelpers: react.helperPath,
    domCompiled: dom.modulePath,
    domHelpers: dom.helperPath,
    fixturePath,
    expectationsPath,
    nativePath,
    provenancePath,
  };
}
