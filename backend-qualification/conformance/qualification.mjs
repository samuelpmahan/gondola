import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";
import { checkPublicationsConformance } from "../../compiled-publications/conformance/check.mjs";
import { replayPublicationsDirect } from "../../compiled-publications/conformance/direct.mjs";
import { encodeFixtureState } from "../../compiled-frontend/conformance/fixture-expectations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BROWSER_ENTRY = resolve(ROOT, "compiled-publications/conformance/browser-entry.mjs");
const DECORATOR_MODULE = resolve(ROOT, "backend-qualification/adapters/qualification-decorator.mjs");
const ESBUILD = resolve(ROOT, "interaction/node_modules/esbuild/lib/main.js");
const PLAN_PATH = resolve(ROOT, "backend-qualification/oracle/plan.json");
const BASE_COMMIT = "5662efcd7feb7920e4690d38cc76a297fed69d5a";
const RAW_SCHEMA = "gobi.backend-qualification-run/v1";
const EVIDENCE_SCHEMA = "gobi.backend-qualification-case-evidence/v1";
const SUMMARY_SCHEMA = "gobi.backend-qualification-summary/v1";
const CHANNELS = ["dom", "disabled", "dispatch-count", "trace-count", "state"];

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const clone = (value) => value === undefined ? undefined : structuredClone(value);

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function equalCanonical(left, right) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
    }
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function pinFile(label, path) {
  const absolutePath = resolve(path);
  const bytes = await readFile(absolutePath);
  return { label, path: absolutePath, bytes: bytes.length, sha256: hash(bytes) };
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, jsonText(value), "utf8");
}

async function requireFreshOutput(outputRoot) {
  try {
    await access(resolve(outputRoot, "qualification.raw.json"));
    throw new Error(`refusing to overwrite existing qualification capture in ${outputRoot}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await access(resolve(outputRoot, "qualification.summary.json"));
    throw new Error(`refusing to overwrite existing qualification summary in ${outputRoot}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function sourceForBundle({ inputs }) {
  const quote = (value) => JSON.stringify(resolve(value));
  return [
    `import { gobiCompiled as gobiReact } from ${quote(inputs.reactCompiled)};`,
    `import * as encoderReact from ${quote(inputs.reactHelpers)};`,
    `import { gobiCompiled as gobiDom } from ${quote(inputs.domCompiled)};`,
    `import * as encoderDom from ${quote(inputs.domHelpers)};`,
    `import { installPublicationsBrowser } from ${quote(BROWSER_ENTRY)};`,
    `import { createQualificationDecorator } from ${quote(DECORATOR_MODULE)};`,
    `const fault = new URL(location.href).searchParams.get("fault") || "none";`,
    `const adapter = fault === "none" ? null : createQualificationDecorator({ fault });`,
    `window.__gobiCompiledPublications = installPublicationsBrowser({`,
    `  gobiReact, encoderReact, gobiDom, encoderDom, rendererDecorator: adapter?.rendererDecorator ?? null,`,
    `});`,
    `window.__gobiQualificationAdapter = adapter;`,
    "",
  ].join("\n");
}

async function buildBrowserBundle({ inputs, tempRoot }) {
  const entryPath = resolve(tempRoot, "qualification-entry.mjs");
  const bundlePath = resolve(tempRoot, "qualification.bundle.mjs");
  await writeFile(entryPath, sourceForBundle({ inputs }), "utf8");
  const { build } = await import(pathToFileURL(ESBUILD).href);
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    nodePaths: [resolve(ROOT, "interaction/node_modules")],
    outfile: bundlePath,
    logLevel: "silent",
  });
  return { entryPath, bundlePath };
}

function contentType(path) {
  const extension = extname(path);
  return extension === ".mjs" || extension === ".js" ? "text/javascript; charset=utf-8" : "application/octet-stream";
}

async function startServer(bundlePath) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end("<!doctype html><html><head><meta charset=utf-8></head><body><main id=app></main><script type=module src=/bundle.mjs></script></body></html>");
      return;
    }
    if (url.pathname === "/bundle.mjs") {
      response.writeHead(200, { "content-type": contentType(bundlePath), "cache-control": "no-store" });
      createReadStream(bundlePath).pipe(response);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

function validatePlan(plan, fixture, expectations) {
  requireThat(plan?.schema === "gobi.backend-qualification-oracle-plan/v1", "oracle plan schema differs");
  requireThat(plan.caseCount === 13 && Array.isArray(plan.cases) && plan.cases.length === 13,
    "oracle plan must define exactly 13 cases");
  requireThat(plan.scenario.eventCount === 50 && plan.scenario.goUpdateCount === 45 && plan.scenario.stateProjectionCount === 46,
    "oracle plan fixed baseline counts differ");
  requireThat(fixture?.schema === plan.scenario.schema && fixture?.name === plan.scenario.name && fixture?.events?.length === 50,
    "mounted qualification fixture differs from the oracle plan");
  requireThat(expectations?.schema === plan.baselineOracle.schema &&
    expectations?.stateProjections?.length === plan.scenario.stateProjectionCount,
  "qualification literal oracle differs from the plan");
  requireThat(equalCanonical(plan.caseIds, plan.cases.map((item) => item.id)), "oracle case ID order differs from case table");
  requireThat(CHANNELS.every((channel) => plan.faultPolicy.channelNames.includes(channel)), "oracle plan omits a recognized channel");
  const expectedIDs = [
    "healthy-react", "healthy-dom", "healthy-swap",
    ...["react", "dom"].flatMap((backend) => ["text-corruption", "key-order", "enabled-control", "drop-click", "duplicate-click"]
      .map((fault) => `fault-${backend}-${fault}`)),
  ];
  requireThat(equalCanonical(expectedIDs, plan.caseIds), "oracle plan case matrix differs from the required 13-case matrix");
  return true;
}

function findControl(dom, path) {
  return dom?.controls?.find((item) => item.path === path) ?? null;
}

function expectedChannelsForEvidence(channelComparisons) {
  return CHANNELS.filter((channel) => !equalCanonical(channelComparisons[channel]?.expected, channelComparisons[channel]?.observed));
}

function checkNegativePolicy(planCase, evidence) {
  const rules = planCase.allowedChannels ?? [];
  const required = planCase.expectedChannels ?? [];
  const observed = evidence.observedChannels;
  if (observed.some((channel) => !CHANNELS.includes(channel) || !rules.includes(channel))) return false;
  if (!evidence.activated || evidence.activationCount !== planCase.activation.expectedCount) return false;
  if (evidence.activationRecords?.[0]?.eventIndex !== planCase.activation.eventIndex) return false;
  if (evidence.infrastructureErrors.length || evidence.pageErrors.length) return false;
  if (planCase.channelRule === "any") return required.some((channel) => observed.includes(channel));
  return required.every((channel) => observed.includes(channel));
}

function normalizeError(error) {
  return { name: error?.name ?? "Error", message: String(error?.message ?? error) };
}

async function runPageCase({ browser, serverURL, casePlan, fixture, expectations, chromiumPath }) {
  const page = await browser.newPage();
  const pageErrors = [];
  const infrastructureErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error)));
  let guard;
  let capture = null;
  try {
    guard = await installNoWasmGuards(page);
    await page.goto(`${serverURL}?fault=${encodeURIComponent(casePlan.fault)}`, { waitUntil: "load", timeout: 20000 });
    await page.waitForFunction(() => typeof window.__gobiCompiledPublications?.runProfile === "function", null, { timeout: 20000 });
    capture = await page.evaluate(async ({ caseConfig, sourceFixture, literalExpectations }) => {
      const api = window.__gobiCompiledPublications;
      let profile = null;
      let probeException = null;
      try {
        profile = await api.runProfile({ kind: caseConfig.backend, fixture: sourceFixture, expectations: literalExpectations });
      } catch (error) {
        probeException = { name: error?.name ?? "Error", message: String(error?.message ?? error) };
      }
      let raw = null;
      if (typeof api.inspectRaw === "function") {
        try { raw = api.inspectRaw(); }
        catch (error) { probeException ??= { name: error?.name ?? "Error", message: String(error?.message ?? error) }; }
      }
      const adapter = window.__gobiQualificationAdapter;
      const activationRecords = adapter?.activationRecords?.() ?? [];
      const callbackInvocations = adapter?.callbackInvocations?.() ?? {
        rendererDispatch: 0, rendererStale: 0, forwardedDispatch: 0, forwardedStale: 0,
      };
      return { profile, probeException, raw, activationRecords, callbackInvocations };
    }, { caseConfig: casePlan, sourceFixture: fixture, literalExpectations: expectations });
    try {
      const coverage = await guard.assertClear();
      if (capture?.profile) capture.profile.noWasm = {
        apiAttempts: coverage.wasmAPIAttempts,
        wasmRequests: coverage.wasmRequests,
        guardCoverage: coverage.guardCoverage,
      };
      capture.noWasm = {
        apiAttempts: coverage.wasmAPIAttempts,
        wasmRequests: coverage.wasmRequests,
        guardCoverage: coverage.guardCoverage,
      };
    } catch (error) {
      infrastructureErrors.push(`no-WASM guard: ${error?.message ?? error}`);
    }
    if (pageErrors.length) infrastructureErrors.push("browser page raised an uncaught error");
  } catch (error) {
    infrastructureErrors.push(`page setup/replay: ${error?.message ?? error}`);
  } finally {
    if (page) {
      await page.evaluate(() => window.__gobiCompiledPublications?.dispose?.()).catch((error) => {
        infrastructureErrors.push(`mounted profile cleanup: ${error?.message ?? error}`);
      });
    }
    await page.close().catch((error) => infrastructureErrors.push(`page close: ${error?.message ?? error}`));
  }
  return { capture, pageErrors, infrastructureErrors };
}

function typedStateForProjection(projection, appIR, packagePath) {
  const component = appIR?.components?.find((item) => item.packagePath === packagePath);
  if (!component) throw new Error("compiled AppIR has no publications component for typed state comparison");
  return encodeFixtureState(projection.state, component.stateType, appIR.types);
}

function negativeEvidence({ planCase, capture, expectations, appIR, packagePath, pageErrors, infrastructureErrors }) {
  const checkpoint = planCase.checkpoint;
  const expectedProjection = expectations.stateProjections[checkpoint.stateIndex];
  const raw = capture?.raw;
  const snapshot = raw?.runtime?.snapshot ?? null;
  const trace = raw?.runtime?.trace ?? null;
  const actualDOM = raw?.physicalDOM ?? raw?.rendererDOM ?? null;
  const rawErrors = [
    raw?.runtime?.snapshotError && `runtime.snapshot: ${raw.runtime.snapshotError}`,
    raw?.runtime?.traceError && `runtime.trace: ${raw.runtime.traceError}`,
    raw?.rendererDOMError && `renderer.domSnapshot: ${raw.rendererDOMError}`,
    raw?.physicalDOMError && `physical DOM: ${raw.physicalDOMError}`,
    raw?.effects?.recordsError && `effects.records: ${raw.effects.recordsError}`,
    raw?.effects?.pendingError && `effects.pending: ${raw.effects.pendingError}`,
  ].filter(Boolean);
  const allInfrastructureErrors = [...infrastructureErrors, ...rawErrors];
  const allPageErrors = [...pageErrors, ...(raw?.pageErrors ?? [])];
  const disabledPath = "0/1";
  const expectedDisabled = findControl(expectedProjection.dom, disabledPath)?.disabled ?? null;
  const observedDisabled = findControl(actualDOM, disabledPath)?.disabled ?? null;
  const initialFault = planCase.activation.eventIndex === null;
  const expectedDispatchCount = initialFault ? 0 : planCase.checkpoint.literal.expectedDispatchCount;
  const observedDispatchCount = raw?.callbackCounts?.dispatch ?? null;
  const expectedTraceTicks = initialFault ? 1 : planCase.checkpoint.literal.expectedTraceTicks;
  const observedTraceTicks = Array.isArray(trace?.ticks) ? trace.ticks.length : null;
  const expectedState = typedStateForProjection(expectedProjection, appIR, packagePath);
  const channelComparisons = {
    dom: { expected: expectedProjection.dom.html, observed: actualDOM?.html ?? null },
    disabled: {
      expected: [{ path: disabledPath, disabled: expectedDisabled }],
      observed: [{ path: disabledPath, disabled: observedDisabled }],
    },
    "dispatch-count": { expected: expectedDispatchCount, observed: observedDispatchCount },
    "trace-count": { expected: expectedTraceTicks, observed: observedTraceTicks },
    state: { expected: clone(expectedState), observed: clone(snapshot?.state ?? null) },
  };
  const observedChannels = expectedChannelsForEvidence(channelComparisons);
  const activationRecords = capture?.activationRecords ?? [];
  const activation = activationRecords[0] ?? null;
  const activationCount = activationRecords.length;
  const eventsObserved = initialFault ? 0 : (activation ? planCase.activation.eventIndex + 1 : 0);
  const traceTicks = observedTraceTicks ?? 0;
  return {
    schema: EVIDENCE_SCHEMA,
    id: planCase.id,
    backend: planCase.backend,
    fault: planCase.fault,
    activation: {
      activated: activationCount > 0,
      activationCount,
      eventIndex: activation?.eventIndex ?? null,
      targetPath: activation?.target?.path ?? planCase.activation.targetPath,
      records: clone(activationRecords),
      callbackInvocations: clone(capture?.callbackInvocations ?? null),
    },
    eventsObserved,
    traceTicks,
    probeException: capture?.probeException ?? null,
    infrastructureErrors: allInfrastructureErrors,
    pageErrors: allPageErrors,
    baseline: {
      stateIndex: checkpoint.stateIndex,
      state: clone(expectedState),
      view: clone(expectedProjection.view),
      dom: clone(expectedProjection.dom),
    },
    expected: {
      stateIndex: checkpoint.stateIndex,
      state: clone(expectedState),
      dom: clone(expectedProjection.dom),
      disabled: { path: disabledPath, value: expectedDisabled },
      dispatchCountDelta: expectedDispatchCount,
      traceTicks: expectedTraceTicks,
      eventsObserved: initialFault ? 0 : 1,
    },
    observed: {
      state: clone(snapshot?.state ?? null),
      view: clone(snapshot?.view ?? null),
      dom: clone(actualDOM),
      trace,
      rendererDOM: clone(raw?.rendererDOM ?? null),
      callbackCounts: clone(raw?.callbackCounts ?? null),
      callbackInvocations: clone(capture?.callbackInvocations ?? null),
      effects: clone(raw?.effects ?? null),
      eventsObserved,
      traceTicks,
    },
    channelComparisons,
    observedChannels,
    policyPassed: checkNegativePolicy(planCase, {
      activated: activationCount > 0,
      activationCount,
      activationRecords,
      observedChannels,
      infrastructureErrors: allInfrastructureErrors,
      pageErrors: allPageErrors,
    }),
  };
}

function healthyEvidence({ planCase, result, profile, check, browserVersion, expectations, fixture, appIR, error = null }) {
  const eventsObserved = result?.capture?.profile?.events?.length === 50 ? 50 : 0;
  const traceTicks = result?.capture?.profile?.trace?.ticks?.length ?? 0;
  const infrastructureErrors = [...(result?.infrastructureErrors ?? [])];
  if (error) infrastructureErrors.push(String(error?.message ?? error));
  if (!profile || !check || check.status !== "matched") infrastructureErrors.push("healthy profile did not pass the existing full publications checker");
  const stateIndex = expectations.stateProjections.length - 1;
  const expectedProjection = expectations.stateProjections[stateIndex];
  const observedTrace = profile?.trace?.ticks ?? [];
  const observedSnapshot = observedTrace.at(-1) ?? null;
  const observedDOM = profile?.snapshots?.at(-1)?.physicalDOM ?? null;
  const expectedControl = findControl(expectedProjection.dom, "0/1")?.disabled ?? null;
  const observedControl = findControl(observedDOM, "0/1")?.disabled ?? null;
  const expectedDispatches = fixture.events.filter((event) => event.kind === "click").length;
  const observedDispatches = profile?.actions?.filter((item) => item.method === "HTMLElement.click" && item.attempted).length ?? 0;
  const expectedState = typedStateForProjection(expectedProjection, appIR, fixture.packagePath);
  const channelComparisons = {
    dom: { expected: expectedProjection.dom.html, observed: observedDOM?.html ?? null },
    disabled: {
      expected: [{ path: "0/1", disabled: expectedControl }],
      observed: [{ path: "0/1", disabled: observedControl }],
    },
    "dispatch-count": { expected: expectedDispatches, observed: observedDispatches },
    "trace-count": { expected: 46, observed: traceTicks },
    state: { expected: clone(expectedState), observed: clone(observedSnapshot?.state ?? null) },
  };
  return {
    schema: EVIDENCE_SCHEMA,
    id: planCase.id,
    backend: planCase.backend,
    fault: "none",
    activated: false,
    activationCount: 0,
    observedChannels: [],
    probeException: result?.capture?.probeException ?? (error ? normalizeError(error) : null),
    infrastructureErrors,
    pageErrors: [...(result?.pageErrors ?? [])],
    eventsObserved,
    traceTicks,
    expected: {
      stateIndex,
      state: clone(expectedState),
      dom: clone(expectedProjection.dom),
      disabled: { path: "0/1", value: expectedControl },
      dispatchCount: expectedDispatches,
      traceTicks: 46,
      eventsObserved: 50,
    },
    observed: {
      state: clone(observedSnapshot?.state ?? null),
      dom: clone(observedDOM),
      callbackCounts: { dispatch: observedDispatches },
      eventsObserved,
      traceTicks,
    },
    channelComparisons,
    derivedChannels: expectedChannelsForEvidence(channelComparisons),
    profile: profile ? clone(profile) : null,
    baselineCheck: check ? clone(check) : null,
    browserVersion,
  };
}

async function importBuild(modulePath, helperPath) {
  const [compiled, helpers] = await Promise.all([
    import(pathToFileURL(resolve(modulePath)).href),
    import(pathToFileURL(resolve(helperPath)).href),
  ]);
  return { compiled: compiled.gobiCompiled, helpers };
}

function makeRawCase(planCase, evidencePath, evidenceSHA256, evidence) {
  return {
    id: planCase.id,
    backend: planCase.backend,
    fault: planCase.fault,
    activated: evidence.activation?.activated ?? evidence.activated ?? false,
    activationCount: evidence.activation?.activationCount ?? evidence.activationCount ?? 0,
    observedChannels: evidence.observedChannels ?? [],
    probeException: evidence.probeException ?? null,
    infrastructureErrors: evidence.infrastructureErrors ?? [],
    pageErrors: evidence.pageErrors ?? [],
    eventsObserved: evidence.eventsObserved ?? 0,
    traceTicks: evidence.traceTicks ?? 0,
    evidencePath,
    evidenceSHA256,
  };
}

/**
 * Run three full healthy profiles and ten actual mounted renderer/event faults.
 * Each matrix row gets a new Chromium page. Fault classification is derived
 * from live runtime, DOM, and callback evidence against the independent oracle.
 */
export async function runQualification({ inputs, outputDir, chromiumPath, sourceCommit }) {
  if (!inputs || !outputDir || !sourceCommit) {
    throw new TypeError("runQualification requires inputs, outputDir, and an explicit sourceCommit");
  }
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new TypeError("sourceCommit must be an explicit 40-character lowercase Git SHA");
  const outputRoot = resolve(outputDir);
  const casesRoot = resolve(outputRoot, "cases");
  const rawReportPath = resolve(outputRoot, "qualification.raw.json");
  const summaryPath = resolve(outputRoot, "qualification.summary.json");
  await requireFreshOutput(outputRoot);
  const planBytes = await readFile(PLAN_PATH);
  const plan = JSON.parse(planBytes.toString("utf8"));
  const [fixture, expectations, native] = await Promise.all([
    readJSON(inputs.fixturePath), readJSON(inputs.expectationsPath), readJSON(inputs.nativePath),
  ]);
  validatePlan(plan, fixture, expectations);
  const fixtureBytes = await readFile(inputs.fixturePath);
  const expectationsBytes = await readFile(inputs.expectationsPath);
  requireThat(hash(fixtureBytes) === plan.scenario.sha256, "fixture bytes do not match oracle plan pin");
  requireThat(hash(expectationsBytes) === plan.baselineOracle.sha256, "literal expectation bytes do not match oracle plan pin");
  const [reactBuild, domBuild] = await Promise.all([
    importBuild(inputs.reactCompiled, inputs.reactHelpers),
    importBuild(inputs.domCompiled, inputs.domHelpers),
  ]);
  requireThat(equalCanonical(reactBuild.compiled.appIR, domBuild.compiled.appIR), "React/DOM AppIR differs");
  const appIR = reactBuild.compiled.appIR;
  const sourcePinsBefore = await Promise.all([
    pinFile("reactCompiled", inputs.reactCompiled),
    pinFile("reactHelpers", inputs.reactHelpers),
    pinFile("domCompiled", inputs.domCompiled),
    pinFile("domHelpers", inputs.domHelpers),
    pinFile("fixture", inputs.fixturePath),
    pinFile("expectations", inputs.expectationsPath),
    pinFile("native", inputs.nativePath),
    pinFile("provenance", inputs.provenancePath),
    pinFile("plan", PLAN_PATH),
  ]);
  await mkdir(casesRoot, { recursive: true });

  const results = new Map();
  const summaryCases = [];
  let browser = null;
  let serverHandle = null;
  let tempRoot = null;
  let bundleMeta = null;
  let browserVersion = null;
  let globalInfrastructureErrors = [];
  const profiles = {};
  let baselineCheck = null;

  try {
    tempRoot = resolve(tmpdir(), `gobi-backend-qualification-${process.pid}-${Date.now()}`);
    await mkdir(tempRoot, { recursive: true });
    const bundle = await buildBrowserBundle({ inputs, tempRoot });
    const bundleBytes = await readFile(bundle.bundlePath);
    bundleMeta = { sha256: hash(bundleBytes), bytes: bundleBytes.length };
    serverHandle = await startServer(bundle.bundlePath);
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath ?? process.env.CHROMIUM_PATH));
    browserVersion = browser.version();

    // Each profile is a fresh page. The existing strict publications replay is
    // retained verbatim; only the surrounding page/browser orchestration lives here.
    for (const planCase of plan.cases.filter((item) => item.fault === "none")) {
      let pageResult = null;
      let profile = null;
      let error = null;
      try {
        pageResult = await runPageCase({ browser, serverURL: serverHandle.url, casePlan: planCase, fixture, expectations });
        profile = pageResult.capture?.profile ?? null;
        if (!profile) throw new Error(pageResult.capture?.probeException?.message ?? "healthy runProfile returned no profile");
        profiles[planCase.backend] = profile;
      } catch (caught) {
        error = caught;
        globalInfrastructureErrors.push(`${planCase.id}: ${caught?.message ?? caught}`);
      }
      results.set(planCase.id, { planCase, pageResult, profile, error });
    }

    if (Object.keys(profiles).length === 3) {
      try {
        const directReact = replayPublicationsDirect({ compiled: reactBuild.compiled, helpers: reactBuild.helpers, fixture, label: "qualification-react" });
        const directDom = replayPublicationsDirect({ compiled: domBuild.compiled, helpers: domBuild.helpers, fixture, label: "qualification-dom" });
        const commonNoWasm = clone(profiles.react.noWasm);
        const browserCapture = {
          schema: "gobi.compiled-publications-browser/v1",
          fixture: fixture.name,
          noWasm: commonNoWasm,
          profiles,
        };
        baselineCheck = checkPublicationsConformance({
          native, directReact, directDom, browser: browserCapture, fixture, expectations,
          reactAppIR: reactBuild.compiled.appIR,
          domAppIR: domBuild.compiled.appIR,
        });
      } catch (caught) {
        globalInfrastructureErrors.push(`healthy full checker: ${caught?.message ?? caught}`);
      }
    } else {
      globalInfrastructureErrors.push("one or more healthy browser profiles did not complete");
    }

    for (const planCase of plan.cases.filter((item) => item.fault !== "none")) {
      let pageResult = null;
      let error = null;
      try {
        pageResult = await runPageCase({ browser, serverURL: serverHandle.url, casePlan: planCase, fixture, expectations });
      } catch (caught) {
        error = caught;
        globalInfrastructureErrors.push(`${planCase.id}: ${caught?.message ?? caught}`);
      }
      const evidence = negativeEvidence({
        planCase,
        capture: pageResult?.capture ?? null,
        expectations,
        appIR,
        packagePath: fixture.packagePath,
        pageErrors: pageResult?.pageErrors ?? [],
        infrastructureErrors: [
          ...(pageResult?.infrastructureErrors ?? []),
          ...(error ? [String(error?.message ?? error)] : []),
        ],
      });
      results.set(planCase.id, { planCase, pageResult, evidence });
    }
  } catch (caught) {
    globalInfrastructureErrors.push(`qualification setup: ${caught?.message ?? caught}`);
  } finally {
    if (browser) await browser.close().catch((error) => globalInfrastructureErrors.push(`browser close: ${error?.message ?? error}`));
    if (serverHandle) await new Promise((done) => serverHandle.server.close(done));
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }

  const sourcePinsAfter = await Promise.all(sourcePinsBefore.map((pin) => pinFile(pin.label, pin.path)));
  const sourcePinsStable = equalCanonical(sourcePinsBefore, sourcePinsAfter);
  if (!sourcePinsStable) globalInfrastructureErrors.push("one or more source/artifact pins changed during the browser matrix");

  for (const planCase of plan.cases) {
    const stored = results.get(planCase.id);
    let evidence;
    if (planCase.fault === "none") {
      evidence = healthyEvidence({
        planCase,
        result: stored?.pageResult,
        profile: stored?.profile ?? null,
        check: baselineCheck,
        browserVersion,
        expectations,
        fixture,
        appIR,
        error: stored?.error ?? (globalInfrastructureErrors.length ? new Error(globalInfrastructureErrors.join(" | ")) : null),
      });
      if (globalInfrastructureErrors.length) evidence.infrastructureErrors.push(...globalInfrastructureErrors);
    } else {
      evidence = stored?.evidence ?? negativeEvidence({
        planCase, capture: null, expectations, appIR, packagePath: fixture.packagePath, pageErrors: [],
        infrastructureErrors: [...globalInfrastructureErrors, "case produced no mounted capture"],
      });
      if (globalInfrastructureErrors.length) evidence.infrastructureErrors.push(...globalInfrastructureErrors);
    }
    const evidenceBytes = Buffer.from(jsonText(evidence));
    const relativeEvidencePath = `cases/${planCase.id}.json`;
    const absoluteEvidencePath = resolve(outputRoot, relativeEvidencePath);
    await mkdir(dirname(absoluteEvidencePath), { recursive: true });
    await writeFile(absoluteEvidencePath, evidenceBytes);
    const evidenceSHA256 = hash(evidenceBytes);
    const rawCase = makeRawCase(planCase, relativeEvidencePath, evidenceSHA256, evidence);
    results.set(planCase.id, { ...stored, planCase, evidence, rawCase });
    summaryCases.push({
      id: planCase.id,
      backend: planCase.backend,
      fault: planCase.fault,
      activated: rawCase.activated,
      activationCount: rawCase.activationCount,
      observedChannels: rawCase.observedChannels,
      eventsObserved: rawCase.eventsObserved,
      traceTicks: rawCase.traceTicks,
      evidencePath: relativeEvidencePath,
      evidenceSHA256,
      infrastructureErrors: rawCase.infrastructureErrors,
      pageErrors: rawCase.pageErrors,
      passed: planCase.fault === "none"
        ? rawCase.eventsObserved === 50 && rawCase.traceTicks === 46 && Boolean(baselineCheck) && rawCase.infrastructureErrors.length === 0 && rawCase.pageErrors.length === 0
        : evidence.policyPassed === true && rawCase.infrastructureErrors.length === 0 && rawCase.pageErrors.length === 0,
    });
  }

  const rawReport = {
    schema: RAW_SCHEMA,
    sourceCommit,
    results: plan.cases.map((item) => results.get(item.id).rawCase),
  };
  await writeJSON(rawReportPath, rawReport);
  const passedCases = summaryCases.filter((item) => item.passed).length;
  const summary = {
    schema: SUMMARY_SCHEMA,
    status: passedCases === 13 ? "matched" : "failed",
    sourceCommit,
    sourceAttestation: sourceCommit === BASE_COMMIT ? "author-uncommitted-base-source" : "explicit-candidate-source",
    matrix: { total: 13, healthy: 3, faultCases: 10, passed: passedCases, failed: 13 - passedCases },
    baseline: baselineCheck,
    sourcePins: sourcePinsBefore,
    sourcePinsStable,
    browser: browserVersion,
    browserBundle: bundleMeta,
    planPath: PLAN_PATH,
    planSHA256: hash(planBytes),
    globalInfrastructureErrors,
    cases: summaryCases,
    authoritativeCertificate: null,
  };
  await writeJSON(summaryPath, summary);
  return { rawReportPath, summaryPath };
}

