import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";
import { encodeFixtureState, validateFixtureExpectations } from "../../compiled-frontend/conformance/fixture-expectations.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";
import { validateHostScript, validateTrace } from "../../compiled-frontend/conformance/trace.mjs";
import {
  METHODS_ACTIONS,
  METHODS_PACKAGE_PATH,
  METHODS_STATES,
  assertMethodsDOMSnapshot,
  expandMethodsSwapSchedule,
  expectedMethodsDOM,
  expectedMethodsPhysicalControls,
  validateMethodsFixtureScript,
} from "./dom-oracle.mjs";

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ESBUILD = join(REPOSITORY, "interaction/node_modules/esbuild/lib/main.js");
function literal(value) {
  return JSON.stringify(value);
}

function browserEntry({ compiledPath, helpersPath }) {
  return [
    `import { gobiCompiled } from ${literal(resolve(compiledPath))};`,
    `import * as encoder from ${literal(resolve(helpersPath))};`,
    `import { installMethodsBrowser } from ${literal(join(REPOSITORY, "compiled-methods/browser/browser-entry.mjs"))};`,
    "window.__gobiMethods = installMethodsBrowser({ gobiCompiled, encoder });",
    "",
  ].join("\n");
}

async function buildBrowserBundle({ compiledPath, helpersPath, tempRoot }) {
  const entryPath = join(tempRoot, "methods-browser-entry.mjs");
  const bundlePath = join(tempRoot, "methods-browser-entry.bundle.mjs");
  await writeFile(entryPath, browserEntry({ compiledPath: resolve(compiledPath), helpersPath: resolve(helpersPath) }), "utf8");
  const { build } = await import(pathToFileURL(ESBUILD).href);
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    nodePaths: [join(REPOSITORY, "interaction/node_modules")],
    outfile: bundlePath,
    logLevel: "silent",
  });
  return bundlePath;
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

function profileActionExpectations(profile) {
  const activeCount = { value: 0 };
  return profile.actions.map((record) => {
    if (record.expectedMessage !== null) activeCount.value += 1;
    return {
      action: record.action,
      message: record.expectedMessage,
      dispatchId: record.expectedMessage === null ? null : `dispatch-${String(activeCount.value).padStart(4, "0")}`,
    };
  });
}

function backendForAction(actionIndex, transitions) {
  let backend = "react";
  for (const transition of transitions) {
    if (transition.afterActionIndex >= actionIndex) break;
    backend = transition.to;
  }
  return backend;
}

function verifyProfile(profile, fixture, compiled, componentId, expectedSwapTransitions) {
  validateTrace(profile.trace, compiled.appIR);
  validateHostScript(fixture.hostScript, profile.trace);
  validateFixtureExpectations(profile.trace, fixture, compiled.appIR);
  if (profile.trace.appId !== componentId || profile.trace.ticks.length !== METHODS_STATES.length) {
    throw new Error(`${profile.backend} trace identity/tick count differs from the frozen methods contract`);
  }
  const component = compiled.appIR.components.find((item) => item.packagePath === METHODS_PACKAGE_PATH);
  for (let tickIndex = 0; tickIndex < METHODS_STATES.length; tickIndex += 1) {
    const state = METHODS_STATES[tickIndex];
    const rawState = {
      Parent: { Count: state.parent },
      Child: { Count: state.child },
      ReadOnly: state.readOnly,
      SavedChild: state.savedChild,
    };
    const expectedState = encodeFixtureState(rawState, component.stateType, compiled.appIR.types);
    assertExactTraceValue(expectedState, profile.trace.ticks[tickIndex].state, `$.browser.${profile.backend}.state[${tickIndex}]`);
    const expectedDOM = expectedMethodsDOM(state);
    assertMethodsDOMSnapshot(profile.trace.ticks[tickIndex].dom, state, `$.browser.${profile.backend}.traceDOM[${tickIndex}]`);
    assertExactTraceValue(expectedDOM, profile.domOracle[tickIndex].snapshot, `$.browser.${profile.backend}.domOracle[${tickIndex}]`);
    assertExactTraceValue(expectedDOM, profile.physicalDOMSnapshots[tickIndex].snapshot, `$.browser.${profile.backend}.physicalDOMSnapshots[${tickIndex}]`);
    assertExactTraceValue(state, profile.domOracle[tickIndex].state, `$.browser.${profile.backend}.oracleState[${tickIndex}]`);
  }
  if (profile.actions.length !== METHODS_ACTIONS.length) throw new Error(`${profile.backend} action evidence is incomplete`);
  const expectations = profileActionExpectations(profile);
  for (let index = 0; index < profile.actions.length; index += 1) {
    const action = profile.actions[index];
    assertExactTraceValue(expectations[index].action, action.action, `$.browser.${profile.backend}.action[${index}]`);
    assertExactTraceValue(expectations[index].message, action.expectedMessage, `$.browser.${profile.backend}.actionMessage[${index}]`);
    assertExactTraceValue(expectations[index].dispatchId, action.tick.dispatchId, `$.browser.${profile.backend}.actionDispatch[${index}]`);
    const stateBeforeAction = METHODS_STATES[index];
    const expectedControl = expectedMethodsPhysicalControls(stateBeforeAction).find((control) => control.path === action.action.path);
    assertExactTraceValue({
      connected: true,
      disabled: expectations[index].message === null,
      value: "",
      type: "submit",
      text: expectedControl.text,
    }, action.target, `$.browser.${profile.backend}.target[${index}]`);
    if (expectations[index].message === null) {
      assertExactTraceValue({ method: "HTMLElement.click", attempted: true, disabled: true, traceTicksUnchanged: true }, action.physicalClick,
        `$.browser.${profile.backend}.disabledClick[${index}]`);
      if (!action.suppressedDispatch || action.suppressedDispatch.accepted !== true || action.suppressedDispatch.dispatchId !== null) {
        throw new Error(`${profile.backend} disabled action ${index} lacks a suppressed runtime record`);
      }
      assertExactTraceValue(null, action.observed, `$.browser.${profile.backend}.disabledObservation[${index}]`);
    } else {
      const expectedBackend = profile.backend === "swap" ? backendForAction(index, expectedSwapTransitions) : profile.backend;
      assertExactTraceValue({
        action: expectations[index].action,
        message: { Name: expectations[index].message.name, Arg: expectations[index].message.arg },
        backend: expectedBackend,
      }, action.observed, `$.browser.${profile.backend}.rendererObservation[${index}]`);
    }
    if (action.tickIndex !== index + 1 || action.afterTickCount !== index + 2) {
      throw new Error(`${profile.backend} action ${index} tick accounting is inconsistent`);
    }
  }
  if (profile.callbackCounts.dispatch !== 14 || profile.callbackCounts.stale !== (profile.backend === "swap" ? expectedSwapTransitions.length : 0)) {
    throw new Error(`${profile.backend} callback totals differ from 14 dispatches and the scheduled stale probes`);
  }
  if (profile.noWasm.apiAttempts.length !== 0 || profile.noWasm.wasmRequests.length !== 0) {
    throw new Error(`${profile.backend} profile attempted a WebAssembly fallback`);
  }
  if (profile.pageErrors.length !== 0 || profile.unmount.physicalDOM.html !== "" || profile.unmount.physicalDOM.controls !== 0) {
    throw new Error(`${profile.backend} profile had page errors or left mounted DOM after unmount`);
  }
  if (profile.backend === "swap") {
    const expectedSequence = ["react", ...expectedSwapTransitions.map((entry) => entry.to)];
    assertExactTraceValue(expectedSequence, profile.rendererSequence, "$.browser.swap.rendererSequence");
    assertExactTraceValue(expectedSwapTransitions, profile.swaps.map(({ afterActionIndex, to }) => ({ afterActionIndex, to })), "$.browser.swap.schedule");
    if (profile.swaps.length !== expectedSwapTransitions.length || profile.retiredCallbacks.length !== expectedSwapTransitions.length) {
      throw new Error("swap profile must contain one swap and retired-callback record per scheduled transition");
    }
    for (const swap of profile.swaps) {
      if (!swap.stateUnchanged || !swap.viewUnchanged || !swap.oldRootEmptyAfterUnmount || !swap.oldRootDetached ||
          !swap.newRootDistinct || !swap.retiredCallback.traceTicksUnchanged ||
          swap.retiredCallback.runtimeFenceCountAfter !== swap.retiredCallback.runtimeFenceCountBefore + 1 ||
          swap.retiredCallback.rendererObservation.backend !== swap.from) {
        throw new Error("swap profile did not preserve state/DOM and fence one retired callback");
      }
    }
  }
  return true;
}

export async function runMethodsBrowserConformance({
  compiledPath,
  helpersPath,
  fixturePath,
  outputPrefix,
  schedule,
  chromiumPath = process.env.CHROMIUM_PATH,
}) {
  if (!compiledPath || !helpersPath || !fixturePath || !outputPrefix) {
    throw new TypeError("runMethodsBrowserConformance needs compiledPath, helpersPath, fixturePath, and outputPrefix");
  }
  const normalizedSchedule = expandMethodsSwapSchedule(schedule ?? {
    schema: "gobi.methods-swap-schedule/v1",
    initialBackend: "react",
    backends: ["react", "dom"],
    policy: "alternate-after-each-fixture-action",
  });
  const resolvedCompiledPath = resolve(compiledPath);
  const resolvedHelpersPath = resolve(helpersPath);
  const resolvedFixturePath = resolve(fixturePath);
  const resolvedOutputPrefix = resolve(outputPrefix);
  const fixture = JSON.parse(await readFile(resolvedFixturePath, "utf8"));
  validateMethodsFixtureScript(fixture);
  const compiledModule = await import(pathToFileURL(resolvedCompiledPath).href);
  const compiled = compiledModule.gobiCompiled;
  if (!compiled || compiled.schema !== "gobi.compiled-module/v1") throw new TypeError("compiled module does not export gobiCompiled v1");
  const component = compiled.appIR.components.find((entry) => entry.packagePath === METHODS_PACKAGE_PATH);
  if (!component) throw new TypeError(`compiled module lacks ${METHODS_PACKAGE_PATH}`);
  const tempRoot = await mkdtemp(join(tmpdir(), "gobi-methods-browser-"));
  let serverHandle;
  let browser;
  let page;
  let pageErrors = [];
  let stage = "bundle-browser-entry";
  try {
    const bundlePath = await buildBrowserBundle({ compiledPath: resolvedCompiledPath, helpersPath: resolvedHelpersPath, tempRoot });
    serverHandle = await startServer(bundlePath);
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const noWasm = await installNoWasmGuards(page);
    stage = "load-browser-page";
    await page.goto(serverHandle.url, { waitUntil: "load", timeout: 15000 });
    await page.waitForFunction(() => typeof window.__gobiMethods?.runProfile === "function", null, { timeout: 15000 });
    const browserVersion = await browser.version();
    const profiles = {};
    for (const kind of ["react", "dom", "swap"]) {
      stage = `run-${kind}-profile`;
      const result = await page.evaluate(({ profileKind, fixtureScript, componentId, scheduleValue }) =>
        window.__gobiMethods.runProfile({ kind: profileKind, fixtureScript, componentId, schedule: scheduleValue }),
      { profileKind: kind, fixtureScript: fixture, componentId: component.id, scheduleValue: kind === "swap" ? normalizedSchedule.transitions : [] });
      result.pageErrors = [...pageErrors];
      profiles[kind] = result;
      verifyProfile(result, fixture, compiled, component.id, normalizedSchedule.transitions);
      if (pageErrors.length > 0) throw new Error(`browser page error: ${pageErrors.join(" | ")}`);
    }
    stage = "verify-no-wasm";
    const guardEvidence = await noWasm.assertClear();
    const noWasmEvidence = { ...guardEvidence, apiAttempts: guardEvidence.wasmAPIAttempts };
    for (const profile of Object.values(profiles)) profile.noWasm = noWasmEvidence;
    stage = "write-evidence";
    const result = {
      schema: "gobi.methods-browser-conformance/v1",
      appId: component.id,
      packagePath: METHODS_PACKAGE_PATH,
      fixture: fixture.name,
      browser: browserVersion,
      swapSchedule: normalizedSchedule.schedule,
      swapTransitions: normalizedSchedule.transitions,
      profiles,
      pageErrors,
      traceSha256: Object.fromEntries(Object.entries(profiles).map(([kind, profile]) => [
        kind,
        createHash("sha256").update(JSON.stringify(profile.trace)).digest("hex"),
      ])),
    };
    const outputPath = resolvedOutputPrefix.endsWith(".json") ? resolvedOutputPrefix : `${resolvedOutputPrefix}.json`;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  } catch (error) {
    const failurePath = resolvedOutputPrefix.endsWith(".json")
      ? resolvedOutputPrefix.slice(0, -5) + ".failed.json"
      : `${resolvedOutputPrefix}.failed.json`;
    await mkdir(dirname(failurePath), { recursive: true });
    await writeFile(failurePath, `${JSON.stringify({
      schema: "gobi.methods-browser-conformance-failure/v1",
      stage,
      browser: browser ? await browser.version().catch(() => null) : null,
      error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack ?? null : null },
      pageErrors,
    }, null, 2)}\n`, "utf8");
    throw error;
  } finally {
    if (browser) await browser.close();
    if (serverHandle) await new Promise((resolveClose, reject) => serverHandle.server.close((error) => error ? reject(error) : resolveClose()));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

