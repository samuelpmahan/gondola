import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assertExactTraceValue } from "./compare.mjs";
import { expectedDOMSnapshots } from "./dom-oracle.mjs";
import { validateFixtureExpectations } from "./fixture-expectations.mjs";
import { validateHostScript, validateTrace, assertTraceMatch } from "./trace.mjs";

function requireNativeDOMNull(trace, name) {
  for (let index = 0; index < trace.ticks.length; index += 1) {
    if (trace.ticks[index].dom !== null) throw new Error(`${name} trace tick ${index} must have dom:null`);
  }
}

function requireBrowserDOM(trace) {
  for (let index = 0; index < trace.ticks.length; index += 1) {
    if (trace.ticks[index].dom === null) throw new Error(`browser trace tick ${index} is missing DOM evidence`);
  }
}

function validateBrowserUnmountEvidence(evidence) {
  assertExactTraceValue({
    physicalDOM: { normalization: "container-innerHTML-v1", html: "", controls: 0 },
    rendererSnapshot: { normalization: "outerHTML-v1", html: "", controls: [] },
  }, evidence.unmount, "$.browser.unmount");
}

function expectedFocusEvidence(fixture) {
  if (fixture.focusWitnesses.length === 0) return null;
  if (fixture.focusWitnesses.length !== 1) {
    throw new Error("browser focus evidence currently requires exactly one fixture focus witness");
  }
  const witness = fixture.focusWitnesses[0];
  return {
    before: {
      activeIsTarget: true,
      start: witness.selectionStart,
      end: witness.selectionEnd,
      direction: witness.selectionDirection,
    },
    immediate: {
      activeIsTarget: true,
      start: witness.selectionStart,
      end: witness.selectionEnd,
      direction: witness.selectionDirection,
      sameKeyedNodeAtNewPath: true,
    },
    settled: {
      activeIsTarget: true,
      start: witness.selectionStart,
      end: witness.selectionEnd,
      direction: witness.selectionDirection,
      sameKeyedNodeAtNewPath: true,
    },
  };
}

function validateFocusEvidence(evidence, fixture) {
  assertExactTraceValue(expectedFocusEvidence(fixture), evidence.focus, "$.browser.focus");
}

function validateBrowserActionEvidence(evidence, fixture) {
  if (!Array.isArray(evidence.actions) || evidence.actions.length !== fixture.actions.length) {
    throw new Error("browser action evidence does not cover each scripted intent");
  }
  for (let index = 0; index < evidence.actions.length; index += 1) {
    const observation = evidence.actions[index];
    const expected = fixture.expectations.find((entry) => entry.actionIndex === index);
    if (!expected) throw new Error(`fixture expectation for browser action ${index} is missing`);
    assertExactTraceValue(fixture.actions[index], observation.intent, `$.browser.actions[${index}].intent`);
    const tick = evidence.trace.ticks[observation.traceTick?.index];
    if (!tick) throw new Error(`browser action ${index} has no recorded tick`);
    assertExactTraceValue(tick, observation.traceTick, `$.browser.actions[${index}].traceTick`);
    assertExactTraceValue(expected.message, tick.message, `$.browser.actions[${index}].message`);
    if (expected.message === null) {
      if (observation.method === "HTMLElement.click()") {
        if (observation.afterPhysical?.ticks !== observation.before?.ticks ||
            observation.afterPhysical?.callbacks?.dispatch !== observation.before?.callbacks?.dispatch ||
            !observation.targetDisabled || !observation.suppressedRecord?.accepted || tick.dispatchId !== null ||
            observation.observedAction !== null) {
          throw new Error(`disabled browser action ${index} lacks physical suppression and null-dispatch evidence`);
        }
      } else if (observation.method === "retained React event callback from detached DOM element") {
        if (observation.targetConnectedBefore || observation.afterPhysical?.ticks !== observation.before?.ticks + 1 ||
            observation.afterPhysical?.callbacks?.dispatch !== observation.before?.callbacks?.dispatch ||
            observation.afterPhysical?.callbacks?.stale !== observation.before?.callbacks?.stale + 1 ||
            tick.dispatchId !== null) throw new Error(`detached callback action ${index} was not fenced`);
        validateObservedAction(observation.observedAction, observation.intent, `$.browser.actions[${index}].observedAction`);
        assertExactTraceValue(observation.intent.value, observation.targetValueAtDispatch, `$.browser.actions[${index}].targetValueAtDispatch`);
        assertExactTraceValue(observation.intent.value, observation.observedAction.value, `$.browser.actions[${index}].observedAction.value`);
      } else {
        throw new Error(`suppressed browser action ${index} uses unknown method ${JSON.stringify(observation.method)}`);
      }
    } else if (observation.afterPhysical?.ticks !== observation.before?.ticks + 1 ||
        observation.afterPhysical?.callbacks?.dispatch !== observation.before?.callbacks?.dispatch + 1) {
      throw new Error(`active browser action ${index} lacks one physical renderer dispatch`);
    } else {
      validateObservedAction(observation.observedAction, observation.intent, `$.browser.actions[${index}].observedAction`);
      if (observation.intent.event === "click") {
        if (typeof observation.targetValueAtDispatch !== "string") {
          throw new Error(`active click action ${index} is missing its physical target value witness`);
        }
        assertExactTraceValue(observation.targetValueAtDispatch, observation.observedAction.value,
          `$.browser.actions[${index}].observedAction.value`);
      } else {
        assertExactTraceValue(observation.intent.value, observation.observedAction.value,
          `$.browser.actions[${index}].observedAction.value`);
      }
    }
  }

  const active = evidence.actions.filter((observation) => observation.expectedMessage !== null);
  const stale = evidence.actions.filter((observation) => observation.method === "retained React event callback from detached DOM element");
  const dispatchObservations = evidence.hostObservations?.dispatch;
  const staleObservations = evidence.hostObservations?.stale;
  if (!Array.isArray(dispatchObservations) || dispatchObservations.length !== active.length) {
    throw new Error("browser renderer dispatch observations do not cover active physical actions");
  }
  if (!Array.isArray(staleObservations) || staleObservations.length !== stale.length) {
    throw new Error("browser renderer stale observations do not cover detached callbacks");
  }
  for (let index = 0; index < active.length; index += 1) {
    assertExactTraceValue(active[index].intent, dispatchObservations[index].action, `$.browser.hostObservations.dispatch[${index}].action`);
    assertExactTraceValue(active[index].observedAction, dispatchObservations[index].observed, `$.browser.hostObservations.dispatch[${index}].observed`);
    assertExactTraceValue({ Name: active[index].expectedMessage.name, Arg: active[index].expectedMessage.arg },
      dispatchObservations[index].message, `$.browser.hostObservations.dispatch[${index}].message`);
  }
  for (let index = 0; index < stale.length; index += 1) {
    assertExactTraceValue(stale[index].intent, staleObservations[index].action, `$.browser.hostObservations.stale[${index}].action`);
    assertExactTraceValue(stale[index].observedAction, staleObservations[index].observed, `$.browser.hostObservations.stale[${index}].observed`);
  }
}

function validateObservedAction(observed, intent, path) {
  if (observed === null || typeof observed !== "object" || typeof observed.value !== "string") {
    throw new Error(`${path} is missing an observed string-valued Action`);
  }
  assertExactTraceValue({ path: intent.path, event: intent.event, value: observed.value }, observed, path);
}

function mutateState(state) {
  const field = state.fields?.[0]?.value;
  if (!field) throw new Error("state mutation control needs a struct state field");
  switch (field.kind) {
    case "bool": field.bool = !field.bool; break;
    case "string": field.string += "!"; break;
    case "int":
    case "uint": field.integer = field.integer === "0" ? "1" : "0"; break;
    case "float64": field.float64Bits = field.float64Bits === "0000000000000000" ? "3ff0000000000000" : "0000000000000000"; break;
    case "slice": field.isNil = !field.isNil; break;
    default: throw new Error(`unsupported first fixture state field kind ${field.kind}`);
  }
}

function mutationControls(nativeTrace, browserEvidence, fixture, domSnapshots) {
  const browserTrace = browserEvidence.trace;
  const controls = [];
  const expectRejected = (name, action) => {
    let rejected = false;
    try { action(); } catch { rejected = true; }
    if (!rejected) throw new Error(`mutation control ${name} was not detected`);
    controls.push({ name, detected: true });
  };
  const mutateDirect = (name, mutate) => expectRejected(name, () => {
    const candidate = structuredClone(nativeTrace);
    mutate(candidate);
    assertExactTraceValue(nativeTrace, candidate);
  });

  mutateDirect("unknown-schema", (trace) => { trace.schema = "gobi.trace/v999"; });
  mutateDirect("missing-tick", (trace) => { trace.ticks.splice(1, 1); });
  mutateDirect("reordered-ticks", (trace) => { [trace.ticks[1], trace.ticks[2]] = [trace.ticks[2], trace.ticks[1]]; });
  mutateDirect("action-intent", (trace) => { trace.ticks.find((tick) => tick.action !== null).action.value += "!"; });
  mutateDirect("message-argument", (trace) => { trace.ticks.find((tick) => tick.message !== null).message.arg += "!"; });
  mutateDirect("dispatch-id", (trace) => { trace.ticks.find((tick) => tick.dispatchId !== null).dispatchId += "-mutated"; });
  mutateDirect("type-aware-state", (trace) => mutateState(trace.ticks[1].state));
  mutateDirect("missing-state-field", (trace) => { trace.ticks[1].state.fields.pop(); });
  mutateDirect("extra-state-field", (trace) => { trace.ticks[1].state.fields.push({ name: "extra", value: { typeId: "string", kind: "string", string: "x" } }); });
  mutateDirect("requested-effect", (trace) => { trace.ticks[0].requestedEffects.push({ dispatchId: "fake", effectIndex: 0, effect: { kind: "fixture.request", name: "fake", arg: "", reply: "" } }); });
  mutateDirect("completed-effect", (trace) => { trace.ticks[0].completedEffects.push({ dispatchId: "fake", effectIndex: 0, message: { name: "fake", arg: "" } }); });
  mutateDirect("view-tree", (trace) => { trace.ticks[0].view.tree.tag += "-mutated"; });
  mutateDirect("view-binding", (trace) => { trace.ticks[0].view.bindings.push({ path: "0", event: "input", message: "fake", source: "target.value" }); });

  expectRejected("browser-dom-html", () => {
    const candidate = structuredClone(browserTrace);
    candidate.ticks[0].dom.html += "<!-- mutated -->";
    assertTraceMatch(nativeTrace, candidate, { domSnapshots });
  });
  expectRejected("browser-dom-control-order", () => {
    const candidate = structuredClone(browserTrace);
    candidate.ticks[0].dom.controls.reverse();
    assertTraceMatch(nativeTrace, candidate, { domSnapshots });
  });

  expectRejected("post-unmount-dom", () => {
    const candidate = structuredClone(browserEvidence.unmount);
    candidate.physicalDOM.html = "<div>orphan</div>";
    assertExactTraceValue({
      physicalDOM: { normalization: "container-innerHTML-v1", html: "", controls: 0 },
      rendererSnapshot: { normalization: "outerHTML-v1", html: "", controls: [] },
    }, candidate, "$.browser.unmount");
  });

  const intentValueOverrideIndex = browserEvidence.actions.findIndex((observation) =>
    observation.expectedMessage !== null && typeof observation.targetValueAtDispatch === "string" &&
    observation.targetValueAtDispatch !== observation.intent.value);
  if (intentValueOverrideIndex >= 0) {
    expectRejected("observed-target-value-independent-of-intent", () => {
      const candidate = structuredClone(browserEvidence);
      const observation = candidate.actions[intentValueOverrideIndex];
      observation.observedAction.value = observation.intent.value;
      const dispatchIndex = candidate.actions.slice(0, intentValueOverrideIndex)
        .filter((entry) => entry.expectedMessage !== null).length;
      candidate.hostObservations.dispatch[dispatchIndex].observed.value = observation.intent.value;
      validateBrowserActionEvidence(candidate, fixture);
    });
  }

  if (fixture.focusWitnesses.length > 0) {
    for (const [name, field, value] of [
      ["focus-selection-range", "start", fixture.focusWitnesses[0].selectionStart + 1],
      ["focus-selection-direction", "direction", fixture.focusWitnesses[0].selectionDirection === "backward" ? "forward" : "backward"],
    ]) {
      expectRejected(name, () => {
        const candidate = structuredClone(browserEvidence.focus);
        candidate.immediate[field] = value;
        assertExactTraceValue(expectedFocusEvidence(fixture), candidate, "$.browser.focus");
      });
    }
  }

  if (fixture.hostScript.steps.length > 0) {
    expectRejected("host-script-missing-request", () => {
      const shortened = structuredClone(fixture.hostScript);
      shortened.steps.pop();
      validateHostScript(shortened, nativeTrace);
    });
    expectRejected("host-script-request-payload", () => {
      const changed = structuredClone(fixture.hostScript);
      changed.steps[0].request.effect.arg += "!";
      validateHostScript(changed, nativeTrace);
    });
  } else {
    expectRejected("unexpected-host-script-request", () => {
      const extra = structuredClone(fixture.hostScript);
      extra.steps.push({ request: { dispatchId: "fake", effectIndex: 0,
        effect: { kind: "fixture.request", name: "fake", arg: "", reply: "" } }, completion: null });
      validateHostScript(extra, nativeTrace);
    });
  }
  return controls;
}

/** Fail-closed native/direct/browser comparison plus hand-authored mutation controls. */
export function checkConformance({ app, fixture, nativeTrace, directTrace, browserEvidence }) {
  if (!browserEvidence || !browserEvidence.trace) throw new TypeError("browser evidence must contain a trace");
  const browserTrace = browserEvidence.trace;
  for (const [name, trace] of [["native", nativeTrace], ["direct-js", directTrace], ["browser", browserTrace]]) {
    validateTrace(trace, app);
    validateHostScript(fixture.hostScript, trace);
    validateFixtureExpectations(trace, fixture, app);
    if (trace.appId !== nativeTrace.appId) throw new Error(`${name} appId differs from native trace`);
  }
  requireNativeDOMNull(nativeTrace, "native");
  requireNativeDOMNull(directTrace, "direct-js");
  requireBrowserDOM(browserTrace);
  validateBrowserUnmountEvidence(browserEvidence);
  validateFocusEvidence(browserEvidence, fixture);
  validateBrowserActionEvidence(browserEvidence, fixture);
  assertExactTraceValue(nativeTrace, directTrace, "$.directJavaScript");
  const domSnapshots = expectedDOMSnapshots(fixture);
  assertTraceMatch(nativeTrace, browserTrace, { domSnapshots });

  if (browserEvidence.strictMode !== (fixture.hostScript.steps.length > 0)) {
    throw new Error("browser StrictMode selection does not match the effect fixture gate");
  }
  if (!browserEvidence.noWasm || browserEvidence.noWasm.wasmRequests.length !== 0 || browserEvidence.noWasm.wasmAPIAttempts.length !== 0) {
    throw new Error("browser evidence does not prove a no-WASM execution");
  }
  const hostEvidence = browserEvidence.effectHostEvidence;
  if (!hostEvidence || !Array.isArray(hostEvidence.requests) || !Array.isArray(hostEvidence.completions)) {
    throw new Error("browser effect-host observations are missing");
  }
  assertExactTraceValue(fixture.hostScript.steps.map((step) => step.request), hostEvidence.requests, "$.browser.effectHost.requests");
  assertExactTraceValue(fixture.hostScript.steps.filter((step) => step.completion !== null).map((step) => ({
    dispatchId: step.request.dispatchId,
    effectIndex: step.request.effectIndex,
    message: step.completion,
  })), hostEvidence.completions, "$.browser.effectHost.completions");
  if (fixture.hostScript.steps.some((step) => step.completion !== null)) {
    const duplicate = browserEvidence.duplicateCompletionEvidence;
    if (!duplicate || duplicate.result?.accepted !== false || duplicate.beforeTickCount !== duplicate.afterTickCount) {
      throw new Error("browser duplicate-completion control did not prove exactly-once delivery");
    }
    if (!Array.isArray(browserEvidence.hostObservations?.requests) ||
        browserEvidence.hostObservations.requests.length !== fixture.hostScript.steps.length) {
      throw new Error("browser host did not retain every request commit observation");
    }
    for (const observation of browserEvidence.hostObservations.requests) {
      if (!observation.snapshot?.dom?.html.includes("Status: pending") ||
          !observation.snapshot.dom.controls.some((control) => control.path === "1" && control.disabled)) {
        throw new Error("effect request was not observed after pending DOM commit");
      }
    }
  }
  const controls = mutationControls(nativeTrace, browserEvidence, fixture, domSnapshots);
  return {
    schema: "gobi.conformance-report/v1",
    appId: nativeTrace.appId,
    fixture: fixture.name,
    status: "matched",
    ticks: nativeTrace.ticks.length,
    actionTicks: nativeTrace.ticks.filter((tick) => tick.action !== null).length,
    replyTicks: nativeTrace.ticks.filter((tick) => tick.action === null && tick.index !== 0).length,
    suppressedTicks: nativeTrace.ticks.filter((tick) => tick.index !== 0 && tick.message === null).length,
    effectRequests: nativeTrace.ticks.reduce((count, tick) => count + tick.requestedEffects.length, 0),
    effectCompletions: nativeTrace.ticks.reduce((count, tick) => count + tick.completedEffects.length, 0),
    comparisons: { nativeVsDirect: "exact", nativeVsBrowser: "exact-except-dom-checked-against-hand-authored-oracle" },
    browser: browserEvidence.browser,
    strictMode: browserEvidence.strictMode,
    noWasm: browserEvidence.noWasm,
    focus: browserEvidence.focus,
    lifecycleEvidence: {
      physicallyEmptyRootAfterUnmount: true,
      detachedReactHandlerAfterNodeRemoval: browserEvidence.actions.some((action) =>
        action.method === "retained React event callback from detached DOM element"),
      retainedHandlerAfterRuntimeUnmount: "not-tested",
    },
    mutationControls: controls,
  };
}

async function json(path) { return JSON.parse(await readFile(path, "utf8")); }

function flag(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) throw new Error(`missing ${name} <path>`);
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const [app, fixture, nativeTraceRaw, directTraceRaw, browserEvidence] = await Promise.all([
    json(flag(args, "--app-ir")),
    json(flag(args, "--fixture")),
    json(flag(args, "--native")),
    json(flag(args, "--direct")),
    json(flag(args, "--browser")),
  ]);
  const nativeTrace = nativeTraceRaw.trace ?? nativeTraceRaw;
  const directTrace = directTraceRaw.trace ?? directTraceRaw;
  const report = checkConformance({ app, fixture, nativeTrace, directTrace, browserEvidence });
  const outputPath = resolve(flag(args, "--output"));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ appId: report.appId, status: report.status, ticks: report.ticks, mutationControls: report.mutationControls.length })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
