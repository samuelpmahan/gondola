import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  LIFECYCLE_EXPECTED_CANCEL_ORDER,
  LIFECYCLE_STEPS,
  expectedLifecycleStateAtTick,
  expectedLifecycleView,
} from "../../../../../compiled-lifecycle/browser/lifecycle-oracle.mjs";
import { encodeFixtureState } from "../../../../../compiled-frontend/conformance/fixture-expectations.mjs";

const root = resolve(dirname(new URL(import.meta.url).pathname), "../../../../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => JSON.stringify(value);
const dispatchId = (index) => `dispatch-${String(index).padStart(4, "0")}`;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function same(expected, actual, label) {
  try { assert.deepStrictEqual(actual, expected); }
  catch (error) { throw new Error(`${label}: ${error.message}`); }
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function pin(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: hash(bytes) };
}

async function checkRecordedPin(record, label) {
  const path = resolve(root, record.path);
  const actual = await pin(path);
  same({ bytes: record.bytes, sha256: record.sha256 }, actual, `${label} record pin`);
  return { path: relative(root, path).split(sep).join("/"), ...actual };
}

async function walkFiles(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`unexpected symlink in build output: ${path}`);
    if (entry.isDirectory()) rows.push(...await walkFiles(path));
    else if (entry.isFile()) rows.push(path);
    else throw new Error(`unsupported build output file type: ${path}`);
  }
  return rows;
}

function typedEffectSlice(expectedEffects, typeId, types) {
  const elementType = types.find((row) => row.id === typeId)?.elemType;
  check(typeof elementType === "string", `AppIR has no element type for typed effect slice ${typeId}`);
  return encodeFixtureState(expectedEffects.map((effect) => ({
    Kind: effect.kind, Name: effect.name, Arg: effect.arg, Reply: effect.reply,
  })), typeId, types);
}

function expectedRequestedEffects(step) {
  return (step.effects ?? []).map((effect, effectIndex) => ({
    dispatchId: dispatchId(step.stateIndex), effectIndex, effect,
  }));
}

function expectedCompletion(step, requestDispatch) {
  if (step.kind !== "effect-reply") return [];
  const origin = requestDispatch.get(step.token);
  check(origin, `fixture effect reply has no request origin: ${step.token}`);
  return [{ dispatchId: origin, effectIndex: 0, message: structuredClone(step.message) }];
}

function expectedDirectRecords() {
  const records = [];
  const requests = new Map();
  let sequence = 0;
  for (const step of LIFECYCLE_STEPS) {
    if (step.kind === "effect-reply") {
      const request = requests.get(step.token);
      check(request, `direct fixture reply has no request ${step.token}`);
      records.push({ sequence: ++sequence, kind: "deliver", ...request, token: step.token,
        outcome: "accepted", message: structuredClone(step.message) });
    }
    for (let effectIndex = 0; effectIndex < (step.effects ?? []).length; effectIndex += 1) {
      const effect = step.effects[effectIndex];
      const token = effect.arg;
      sequence += 1;
      if (effect.kind === "fixture.request") {
        const request = { dispatchId: dispatchId(step.stateIndex), effectIndex: 0 };
        requests.set(token, request);
        records.push({ sequence, kind: "request", ...request, token, outcome: "queued" });
      } else if (effect.kind === "lifecycle.cancel") {
        const target = requests.get(token);
        check(target, `direct cancellation has no originating request ${token}`);
        records.push({ sequence, kind: "cancel", dispatchId: dispatchId(step.stateIndex), effectIndex,
          token, target: structuredClone(target), outcome: "cancelled" });
      } else throw new Error(`unexpected fixture effect kind ${effect.kind}`);
    }
  }
  return records;
}

async function auditBuild(attemptRoot, receipt, backend) {
  const backendRoot = resolve(attemptRoot, backend);
  const recordPath = resolve(backendRoot, "build-record.json");
  const record = await json(recordPath);
  const resultPath = resolve(backendRoot, "result.json");
  const requestPath = resolve(backendRoot, "request.json");
  const outputRoot = resolve(backendRoot, "output");
  const result = await json(resultPath);
  const request = await json(requestPath);
  const commandName = `compile-${backend}-goscript`;
  const command = receipt.commands.find((row) => row.name === commandName);
  check(command, `missing full-run command ledger row ${commandName}`);
  same({ command: "go", args: ["run", "./cmd/gobi-build"], cwd: "compiled-frontend",
    environmentOverrides: { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" } },
    { command: command.command, args: command.args, cwd: command.cwd, environmentOverrides: command.environmentOverrides },
    `${backend} actual GoScript command`);
  check(command.exitCode === 0 && command.signal === null && command.error === null,
    `${backend} GoScript command did not exit cleanly`);
  check(command.inputSha256 === hash(await readFile(requestPath)), `${backend} CLI stdin does not match its saved request`);
  const stdout = await readFile(resolve(root, command.stdoutPath));
  const stderr = await readFile(resolve(root, command.stderrPath));
  check(hash(stdout) === command.stdoutSha256 && hash(stderr) === command.stderrSha256,
    `${backend} CLI raw stdout/stderr hashes differ from the execution receipt`);
  same(result, JSON.parse(stdout.toString("utf8")), `${backend} raw CLI stdout differs from saved result.json`);
  same({ schema: "gobi.build-request/v1", entryPackages: ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"], backend },
    { schema: request.schema, entryPackages: request.entryPackages, backend: request.backend }, `${backend} build request`);
  check(result.schema === "gobi.build-result/v1" && result.ok === true && result.diagnostics?.length === 0 && result.apps?.length === 1,
    `${backend} actual BuildResult is not one clean app`);
  check(record.backend === backend && record.outputCount === 67 && record.outputPins?.length === 67,
    `${backend} output inventory is not exactly 67 files`);
  same(result.outputs.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })).sort((a, b) => a.path.localeCompare(b.path)),
    record.outputPins.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })).sort((a, b) => a.path.localeCompare(b.path)),
    `${backend} BuildResult outputs versus record`);
  const physicalPaths = (await walkFiles(outputRoot)).map((path) => relative(outputRoot, path).split(sep).join("/")).sort();
  same(record.outputPins.map(({ path }) => path).sort(), physicalPaths, `${backend} physical output inventory`);
  const outputDetails = [];
  for (const row of record.outputPins) {
    check(typeof row.path === "string" && !isAbsolute(row.path) && !row.path.split(/[\\/]/).includes(".."), `${backend} unsafe output pin path`);
    const path = resolve(outputRoot, row.path);
    check(path.startsWith(outputRoot + sep), `${backend} output pin escapes output tree`);
    const actual = await pin(path);
    same({ bytes: row.bytes, sha256: row.sha256 }, actual, `${backend} output ${row.path}`);
    outputDetails.push({ path: row.path, ...actual });
  }
  const app = record.app;
  check(app.packagePath === "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle" && app.backend === backend,
    `${backend} build record app identity`);
  const appIrPath = resolve(outputRoot, app.paths.appIR);
  const modulePath = resolve(outputRoot, app.paths.module);
  const encoderPath = resolve(outputRoot, app.paths.encoder);
  const appIR = await json(appIrPath);
  const component = appIR.components?.find((row) => row.packagePath === app.packagePath);
  const required = ["view.node", "numeric.safe-integer", "numeric.float64", "effect.request-reply", "effect.cancel"];
  same(required, component?.capabilities, `${backend} AppIR capabilities`);
  same(required, record.component.capabilities, `${backend} build-record capabilities`);
  const manifest = await json(resolve(outputRoot, "buildmanifest.json"));
  check(manifest.schema === "gobi.build-manifest/v1" && manifest.apps?.length === 1,
    `${backend} actual build manifest schema/cardinality`);
  check(manifest.apps[0].backend === backend && manifest.apps[0].appIR === app.paths.appIR &&
    manifest.apps[0].module === app.paths.module && manifest.apps[0].encoder === app.paths.encoder,
    `${backend} manifest paths differ from the build record`);
  const recordPins = {
    request: await checkRecordedPin(record.request, `${backend} request`),
    result: await checkRecordedPin(record.result, `${backend} result`),
    manifest: await checkRecordedPin(record.manifest, `${backend} manifest`),
    appIR: await checkRecordedPin(record.appIR, `${backend} AppIR`),
    module: await checkRecordedPin(record.module, `${backend} module`),
    encoder: await checkRecordedPin(record.encoder, `${backend} encoder`),
  };
  same({ path: relative(root, appIrPath).split(sep).join("/"), ...await pin(appIrPath) },
    recordPins.appIR, `${backend} AppIR build-record location`);
  same({ path: relative(root, modulePath).split(sep).join("/"), ...await pin(modulePath) },
    recordPins.module, `${backend} module build-record location`);
  same({ path: relative(root, encoderPath).split(sep).join("/"), ...await pin(encoderPath) },
    recordPins.encoder, `${backend} encoder build-record location`);
  return { record, result, request, manifest, appIR, recordPins, outputDetails };
}

async function main() {
  const attemptArg = process.argv[2];
  check(attemptArg, "usage: node audit.mjs <full-attempt-root>");
  const attemptRoot = resolve(root, attemptArg);
  const receiptPath = resolve(attemptRoot, "execution.json");
  const receipt = await json(receiptPath);
  check(receipt.schema === "gobi.compiled-capabilities-execution/v1" && receipt.job_id === "E-BUILD" && receipt.mode === "full",
    "input is not a full E-BUILD attempt receipt");
  check(receipt.attempt === relative(root, attemptRoot).split(sep).join("/"), "receipt attempt path differs from the audited directory");
  check(receipt.executionParameters?.seed === null && /no random seed/i.test(receipt.executionParameters?.seedPolicy ?? ""),
    "full attempt does not declare the frozen no-random-seed policy");
  check(receipt.executionParameters?.fixture === "fixtures/compiled/lifecycle/scenario.json", "full attempt fixture path differs");
  const executionPin = await pin(receiptPath);
  const fixturePath = resolve(root, receipt.executionParameters.fixture);
  const fixture = await json(fixturePath);
  const contract = await json(resolve(root, "compiled-lifecycle/conformance/lifecycle-contract.json"));
  check(fixture.schema === "gobi.compiled-lifecycle-fixture/v1" && fixture.events.length === 26 && contract.requiredEvents === 26 && contract.requiredGoTicks === 26,
    "frozen fixture/contract event and tick counts differ");
  check(receipt.versions?.node?.startsWith("v22.") && receipt.versions?.compiledGo?.includes("go1.27.3") &&
    receipt.versions?.rootGo?.includes("go1.24."), "full-run toolchain versions differ from the frozen execution contract");
  for (const [name, expectedOutput, expectedEnv] of [
    ["version-root-go", receipt.versions.rootGo, { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" }],
    ["version-compiled-go", receipt.versions.compiledGo, { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" }],
  ]) {
    const row = receipt.commands.find((item) => item.name === name);
    check(row?.command === "go" && canonical(row.args) === canonical(["version"]) && row.exitCode === 0 &&
      row.signal === null && row.error === null && canonical(row.environmentOverrides) === canonical(expectedEnv),
      `${name} command/version provenance differs`);
    const log = await readFile(resolve(root, row.stdoutPath));
    check(hash(log) === row.stdoutSha256 && log.toString("utf8").trim() === expectedOutput,
      `${name} stdout does not match the recorded Go version`);
  }

  const [react, dom] = await Promise.all([auditBuild(attemptRoot, receipt, "react"), auditBuild(attemptRoot, receipt, "dom")]);
  same(react.result.apps, dom.result.apps, "React/DOM BuildResult app records");
  const withoutBackend = (manifest) => ({ ...manifest, apps: manifest.apps.map(({ backend: _backend, ...app }) => app) });
  same(withoutBackend(react.manifest), withoutBackend(dom.manifest), "React/DOM manifest apart from backend tag");
  same(await readFile(resolve(attemptRoot, "react/output", react.record.app.paths.appIR)),
    await readFile(resolve(attemptRoot, "dom/output", dom.record.app.paths.appIR)), "React/DOM AppIR bytes");
  same(await readFile(resolve(attemptRoot, "react/output", react.record.app.paths.encoder)),
    await readFile(resolve(attemptRoot, "dom/output", dom.record.app.paths.encoder)), "React/DOM encoder bytes");
  const reactModules = { sha256: (await pin(resolve(attemptRoot, "react/output", react.record.app.paths.module))).sha256 };
  const domModules = { sha256: (await pin(resolve(attemptRoot, "dom/output", dom.record.app.paths.module))).sha256 };
  check(react.record.outputPins.length === dom.record.outputPins.length, "React/DOM output path counts differ");
  const domPins = new Map(dom.record.outputPins.map((row) => [row.path, row]));
  const modulePaths = new Set([react.record.app.paths.module, dom.record.app.paths.module]);
  for (const row of react.record.outputPins) {
    if (row.path === "buildmanifest.json" || modulePaths.has(row.path)) continue;
    same({ path: row.path, bytes: row.bytes, sha256: row.sha256 }, domPins.get(row.path), `React/DOM non-module output ${row.path}`);
  }

  const matrix = resolve(attemptRoot, "matrix");
  const native = await json(resolve(matrix, "capabilities.lifecycle.native.json"));
  const direct = await json(resolve(matrix, "capabilities.lifecycle.direct.json"));
  const conformanceRun = await json(resolve(matrix, "capabilities.lifecycle.run.json"));
  const conformanceCheck = await json(resolve(matrix, "capabilities.lifecycle.check.json"));
  check(native.schema === "gobi.compiled-lifecycle-native/v1" && direct.schema === "gobi.compiled-lifecycle-direct/v1",
    "native or direct evidence schema mismatch");
  check(native.packagePath === fixture.packagePath && native.componentID === fixture.componentID &&
    direct.packagePath === fixture.packagePath && direct.componentID === fixture.componentID,
    "native/direct package or component identity differs from fixture");
  check(conformanceRun.status === "matched" && conformanceRun.sourceStableThroughCheck === true &&
    conformanceRun.buildOutputsStableThroughCheck === true && conformanceCheck.status === "matched",
    "raw lifecycle conformance run/check did not match or preserve pinned inputs");
  same({ command: receipt.executionParameters.nativeGoExecutable,
    args: ["version"], exitCode: 0, output: receipt.versions.rootGo }, conformanceRun.versions.go,
    "native Go toolchain version captured by conformance");
  same([receipt.executionParameters.nativeGoExecutable, "run", "./cmd/compiled-lifecycle-native", "--script", resolve(root, fixturePath)],
    conformanceRun.nativeCommand, "actual native GoScript lifecycle command");
  same({
    reactAppIR: react.record.appIR.path,
    domAppIR: dom.record.appIR.path,
    reactCompiled: react.record.module.path,
    domCompiled: dom.record.module.path,
  }, {
    reactAppIR: relative(root, conformanceRun.inputs.reactAppIR).split(sep).join("/"),
    domAppIR: relative(root, conformanceRun.inputs.domAppIR).split(sep).join("/"),
    reactCompiled: relative(root, conformanceRun.inputs.reactCompiled).split(sep).join("/"),
    domCompiled: relative(root, conformanceRun.inputs.domCompiled).split(sep).join("/"),
  }, "native/direct conformance input paths");
  const component = react.appIR.components.find((row) => row.packagePath === fixture.packagePath);
  check(component, "React AppIR component missing for fixture");
  const expectedCaps = ["view.node", "numeric.safe-integer", "numeric.float64", "effect.request-reply", "effect.cancel"];
  same(expectedCaps, component.capabilities, "frozen AppIR capability list");
  check(native.steps?.length === 26 && direct.steps?.length === 26 && direct.trace?.ticks?.length === 26,
    "raw native/direct timeline must contain 26 events and 26 direct Gobi ticks");
  same(expectedLifecycleStateAtTick(0), native.initialState, "native initial state");
  same(fixture.initialState.nodes.map((node) => node.id).sort(), ["child", "grandchild", "parent", "sibling"], "fixture initial node identities");
  const requestOrigins = new Map();
  const normalizedNativeEffects = [];
  for (let index = 0; index < LIFECYCLE_STEPS.length; index += 1) {
    const expected = LIFECYCLE_STEPS[index];
    const nativeStep = native.steps[index];
    const directStep = direct.steps[index];
    const expectedState = expectedLifecycleStateAtTick(expected.stateIndex);
    const expectedView = expectedLifecycleView(expectedState);
    same(index, nativeStep.index, `native event ${index} index`);
    same(expected.kind, nativeStep.kind, `native event ${index} kind`);
    same(expected.kind === "renderer-swap" ? null : expected.message, nativeStep.message, `native event ${index} message`);
    same(expected.effects ?? [], nativeStep.effects, `native event ${index} effects`);
    same(expectedState, nativeStep.state, `native event ${index} typed Go application state`);
    same(expectedView.tree, nativeStep.view, `native event ${index} Gobi tree`);
    same(index, directStep.eventIndex, `direct event ${index} index`);
    same(fixture.events[index], directStep.event, `direct event ${index} fixture input`);
    same(expected.kind === "renderer-swap" ? null : expected.message, directStep.message, `direct event ${index} message`);
    const requested = expectedRequestedEffects(expected);
    same(requested, directStep.requestedEffects, `direct event ${index} requested effects`);
    if (expected.kind === "renderer-swap") {
      same(null, directStep.typedEffects, `direct event ${index} has no Go Update typed effects`);
    } else {
      const typed = typedEffectSlice(expected.effects ?? [], directStep.typedEffects?.typeId, react.appIR.types);
      same(typed, directStep.typedEffects, `direct event ${index} typed Gobi Effect values`);
    }
    same(expectedView, directStep.view, `direct event ${index} Gobi tree and bindings`);
    const stateType = component.stateType;
    const typedState = encodeFixtureState(expectedState, stateType, react.appIR.types);
    same(typedState, directStep.state, `direct event ${index} encoded application state`);
    if (expected.kind === "renderer-swap") {
      same({ from: expected.from, to: expected.to, target: expected.target }, nativeStep.rendererSwap, "native renderer swap");
      same("state-preserved", nativeStep.outcome, "native renderer swap outcome");
      same(null, directStep.traceTick, "direct renderer swap does not create a Go tick");
    } else if (expected.kind === "fixture.request") {
      throw new Error("fixture steps must use request effects rather than a fixture.request event");
    } else {
      const directTraceTick = direct.trace.ticks[expected.stateIndex];
      same(expected.stateIndex, directTraceTick.index, `direct Gobi tick ${expected.stateIndex} index`);
      same(typedState, directTraceTick.state, `direct Gobi tick ${expected.stateIndex} typed state`);
      same(expectedView, directTraceTick.view, `direct Gobi tick ${expected.stateIndex} Gobi tree`);
      same(expected.kind === "renderer-swap" ? null : expected.message, directTraceTick.message, `direct Gobi tick ${expected.stateIndex} message`);
      same(expected.kind === "renderer-swap" ? null : dispatchId(expected.stateIndex), directTraceTick.dispatchId,
        `direct Gobi tick ${expected.stateIndex} dispatch ID`);
      same(requested, directTraceTick.requestedEffects, `direct Gobi tick ${expected.stateIndex} requested effects`);
      const completed = expected.kind === "effect-reply" ? expectedCompletion(expected, requestOrigins) : [];
      same(completed, directTraceTick.completedEffects, `direct Gobi tick ${expected.stateIndex} completion correlation`);
      same(directTraceTick, directStep.traceTick, `direct event ${index} trace tick link`);
      if (expected.kind === "effect-reply") same(expected.message, nativeStep.message, `native completion ${expected.token}`);
    }
    for (const effect of expected.effects ?? []) {
      if (effect.kind === "fixture.request") requestOrigins.set(effect.arg, dispatchId(expected.stateIndex));
      normalizedNativeEffects.push(effect);
    }
  }
  same(expectedDirectRecords(), direct.effectRecords, "direct request/cancel/delivery effect record ledger");
  const requests = normalizedNativeEffects.filter((effect) => effect.kind === "fixture.request");
  const cancellations = normalizedNativeEffects.filter((effect) => effect.kind === "lifecycle.cancel");
  check(requests.length === 7, `expected 7 request effects, got ${requests.length}`);
  check(cancellations.length === 3, `expected 3 cancellation effects, got ${cancellations.length}`);
  same(LIFECYCLE_EXPECTED_CANCEL_ORDER, cancellations.map((effect) => effect.arg), "child-first cancellation order");
  same({ events: 26, ticks: 26, clicks: 16, requests: 7, cancellations: 3,
    cancellationOrder: LIFECYCLE_EXPECTED_CANCEL_ORDER }, {
    events: conformanceCheck.events, ticks: conformanceCheck.ticks, clicks: conformanceCheck.clicks,
    requests: conformanceCheck.requests, cancellations: conformanceCheck.cancellations,
    cancellationOrder: conformanceCheck.cancellationOrder,
  }, "lifecycle checker summary versus literal expectations");
  same([], direct.pending, "direct final pending requests");

  const commandRows = receipt.commands.map((row) => ({ name: row.name, exitCode: row.exitCode, signal: row.signal, error: row.error }));
  const fullRunnerFailure = receipt.failures ?? [];
  const result = {
    schema: "gobi.compiled-capabilities-native-data-audit/v1",
    status: "matched",
    execution: {
      path: relative(root, receiptPath).split(sep).join("/"),
      status: receipt.status,
      summary: receipt.summary,
      startedAt: receipt.startedAt,
      finishedAt: receipt.finishedAt,
      seed: receipt.executionParameters.seed,
      seedPolicy: receipt.executionParameters.seedPolicy,
      node: receipt.versions.node,
      rootGo: receipt.versions.rootGo,
      compiledGo: receipt.versions.compiledGo,
      nativeGoExecutable: receipt.executionParameters.nativeGoExecutable,
      fullRunnerFailures: fullRunnerFailure,
      commandFailures: commandRows.filter((row) => row.exitCode !== 0 || row.signal !== null || row.error !== null),
      inheritedLifecycleStage: receipt.stages.find((row) => row.name === "inherited-static-and-interaction-lifecycle") ?? null,
    },
    fixture: { path: "fixtures/compiled/lifecycle/scenario.json", sha256: hash(await readFile(fixturePath)), events: fixture.events.length, goTicks: direct.trace.ticks.length },
    builds: {
      react: { outputCount: react.record.outputCount, appIR: react.recordPins.appIR, encoder: react.recordPins.encoder,
        rawModule: react.recordPins.module, result: react.recordPins.result, manifest: react.recordPins.manifest },
      dom: { outputCount: dom.record.outputCount, appIR: dom.recordPins.appIR, encoder: dom.recordPins.encoder,
        rawModule: dom.recordPins.module, result: dom.recordPins.result, manifest: dom.recordPins.manifest },
      appIRByteIdentical: true,
      encoderByteIdentical: true,
      outputInventoryCountEach: 67,
      rawModuleHashesRecordedSeparately: true,
    },
    lifecycle: { events: 26, directTicks: 26, requestEffects: requests.length, cancellationEffects: cancellations.length,
      cancellationOrder: cancellations.map((effect) => effect.arg), nativeSteps: native.steps.length, directSteps: direct.steps.length,
      nativeSha256: hash(await readFile(resolve(matrix, "capabilities.lifecycle.native.json"))),
      directSha256: hash(await readFile(resolve(matrix, "capabilities.lifecycle.direct.json"))),
      conformanceRunStatus: conformanceRun.status, conformanceCheckStatus: conformanceCheck.status },
    rawEvidenceHashes: {
      executionJson: executionPin.sha256,
      nativeJson: hash(await readFile(resolve(matrix, "capabilities.lifecycle.native.json"))),
      directJson: hash(await readFile(resolve(matrix, "capabilities.lifecycle.direct.json"))),
      conformanceRunJson: hash(await readFile(resolve(matrix, "capabilities.lifecycle.run.json"))),
      conformanceCheckJson: hash(await readFile(resolve(matrix, "capabilities.lifecycle.check.json"))),
      reactBuildRecord: hash(await readFile(resolve(attemptRoot, "react/build-record.json"))),
      domBuildRecord: hash(await readFile(resolve(attemptRoot, "dom/build-record.json"))),
    },
    limits: [
      "This audit validates the actual native and direct outputs from the named full E-BUILD attempt; the overall runner receipt is failed at inherited lifecycle receipt validation, so it is not a full-chain acceptance result.",
      "The native step and direct GoScript traces are compared with the frozen literal lifecycle oracle; renderer/browser behavior and the remote CI artifact catalog remain outside this native lane audit.",
      "React and DOM module hashes are recorded separately; no raw generated module equality assertion is made.",
    ],
  };
  console.log(JSON.stringify(result, null, 2));
  const out = resolve(root, "compiled-capabilities/ci/2026-10-31/lanes/native/audit.json");
  await writeFile(out, `${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
