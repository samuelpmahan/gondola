import { createEffectHost } from "/async-effects/host.mjs";
import { createHTTPTransport } from "/http-effects/transport.mjs";
import { mountHTTPReference, referenceReactDOMVersion, referenceReactVersion }
  from "/http-effects/build/reference.bundle.mjs";
import { mountEditorDOM } from "/controlled-input/dom.mjs";
import { mountEditorReact } from "/controlled-input/build/react.bundle.mjs";

const errors = [];
const goRuns = [];
const renderers = { dom: mountEditorDOM, react: mountEditorReact };
const HTTP_RUNTIME_METHODS = ["init", "dispatch", "complete", "effects", "audit"];

function clone(value) {
  return structuredClone(value);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function errorText(error) {
  return String(error?.stack ?? error);
}

function countRuntime(rawRuntime) {
  const calls = Object.fromEntries(HTTP_RUNTIME_METHODS.map((method) => [method, 0]));
  const runtime = {};
  for (const method of HTTP_RUNTIME_METHODS) {
    runtime[method] = (...args) => {
      calls[method]++;
      return rawRuntime[method](...args);
    };
  }
  runtime.encodeHTTP = (...args) => rawRuntime.encodeHTTP(...args);
  runtime.decodeHTTP = (...args) => rawRuntime.decodeHTTP(...args);
  return { runtime, calls };
}

async function makeRuntime() {
  const previous = globalThis.gobiHTTPSave;
  const go = new Go();
  const response = await fetch("/http-effects/build/http-save.wasm", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP save WASM request failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  const run = go.run(instance);
  run.catch((error) => errors.push(errorText(error)));
  goRuns.push({ go, instance, run });

  // Go publishes the API during WebAssembly startup. Yield by browser frames
  // until that event has happened; the bounded loop is only a startup guard.
  for (let frame = 0; frame < 240; frame++) {
    if (globalThis.gobiHTTPSave && globalThis.gobiHTTPSave !== previous) break;
    await new Promise(requestAnimationFrame);
  }
  const runtime = globalThis.gobiHTTPSave;
  if (!runtime || runtime === previous || HTTP_RUNTIME_METHODS.some((method) => typeof runtime[method] !== "function") ||
      typeof runtime.encodeHTTP !== "function" || typeof runtime.decodeHTTP !== "function") {
    throw new Error("WASM instance did not publish a fresh globalThis.gobiHTTPSave API");
  }
  return runtime;
}

function normalizeServerRequest(record) {
  return {
    ID: record.ID,
    Value: record.Value,
    Mode: record.Mode,
    ResultMode: record.ResultMode,
    State: record.State,
    CancelObserved: record.CancelObserved,
    Status: record.Status,
    ResponseID: record.ResponseID,
    Error: record.Error,
  };
}

function normalizedRecords(data) {
  if (!data || !Array.isArray(data.requests)) throw new Error("HTTP lab returned an invalid request record list");
  return data.requests.map(normalizeServerRequest);
}

async function recordsFor(lane) {
  const url = new URL("/api/requests", location.origin);
  url.searchParams.set("lane", lane);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP lab request listing failed: ${response.status}`);
  return normalizedRecords(await response.json());
}

async function waitForRecord(fixture, id, predicate, description) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const records = await recordsFor(fixture.lane);
    const record = records.find((item) => item.ID === id);
    if (record && predicate(record)) return record;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${description} on ${fixture.lane} request ${id}; last record ${JSON.stringify(record ?? null)}`);
    }
    await new Promise(requestAnimationFrame);
  }
}

async function assertFinalRecord(fixture, id, mode) {
  const expectedState = mode === "drop" ? "dropped" : "completed";
  const record = await waitForRecord(fixture, id, (item) => item.State === expectedState, `${mode} response completion`);
  const expectedStatus = mode === "status" ? 503 : 200;
  const expectedResponseID = mode === "wrong-id" ? id + 1 : ["malformed", "drop"].includes(mode) ? 0 : id;
  const expectedError = {
    error: "server rejected",
    "wrong-id": "wrong response ID",
    malformed: "malformed response body",
    status: "http status 503",
    drop: "connection dropped",
  }[mode] ?? "";
  for (const [field, expected] of Object.entries({
    State: expectedState,
    ResultMode: mode,
    Status: expectedStatus,
    ResponseID: expectedResponseID,
    Error: expectedError,
  })) {
    if (record[field] !== expected) {
      throw new Error(`${fixture.participant} lab record ${id} ${field}=${JSON.stringify(record[field])}, expected ${JSON.stringify(expected)} for ${mode}`);
    }
  }
  return record;
}

function createInstrumentedTransport({ runtime, lane, participant, modeState, onReply }) {
  const modes = new Map();
  const commands = new Map();
  const deliveries = new Map();
  const endpoint = (command) => {
    const mode = modeState.next;
    modeState.next = "success";
    modes.set(command.ID, mode);
    const url = new URL("/api/save", location.origin);
    url.searchParams.set("lane", lane);
    url.searchParams.set("mode", mode);
    return url;
  };
  const transport = createHTTPTransport({ runtime, url: endpoint });
  const wrapped = {
    start(command, deliver) {
      const gate = deferred();
      commands.set(command.ID, clone(command));
      deliveries.set(command.ID, gate);
      return transport.start(command, (reply) => {
        try {
          const result = onReply(reply, deliver);
          gate.resolve({ reply: clone(reply) });
          return result;
        } catch (error) {
          gate.resolve({ error: errorText(error) });
          throw error;
        }
      });
    },
    cancel(id) {
      return transport.cancel(id);
    },
    settled() {
      return transport.settled();
    },
    log() {
      return transport.log();
    },
    dispose() {
      return transport.dispose();
    },
    modeFor(id) {
      return modes.get(id) ?? "success";
    },
    commandFor(id) {
      return commands.get(id) ?? null;
    },
    waitForDelivery(id) {
      const gate = deliveries.get(id);
      if (!gate) throw new Error(`${participant} transport has no start gate for request ${id}`);
      return gate.promise;
    },
    lane,
    participant,
  };
  return wrapped;
}

function assertDeliveredReply(fixture, id, mode, delivered) {
  if (delivered?.error) throw new Error(`${fixture.participant} delivery callback failed: ${delivered.error}`);
  const command = fixture.transport.commandFor(id);
  if (!command || !delivered?.reply) throw new Error(`${fixture.participant} has no normalized reply for ${id}`);
  const expected = {
    success: { ID: id, Value: command.Value, Error: "" },
    error: { ID: id, Value: "", Error: "server rejected" },
    "wrong-id": { ID: id, Value: "", Error: "invalid response" },
    malformed: { ID: id, Value: "", Error: "invalid response" },
    status: { ID: id, Value: "", Error: "http status 503" },
    drop: { ID: id, Value: "", Error: "network error" },
  }[mode];
  if (!expected || JSON.stringify(delivered.reply) !== JSON.stringify(expected)) {
    throw new Error(`${fixture.participant} HTTP reply for ${id}/${mode} was ${JSON.stringify(delivered.reply)}, expected ${JSON.stringify(expected)}`);
  }
}

function nativeStep(action, actualValue = undefined) {
  if (!action) return { Path: "", Event: "", Value: "" };
  if (action.kind === "fill" || action.kind === "type-char" || action.kind === "stale-input") {
    const value = actualValue ?? (action.kind === "type-char" ? action.resultingValue : action.value);
    return { Path: "0", Event: "input", Value: value ?? "" };
  }
  if (action.kind === "click") {
    const path = action.Path ?? ({ save: "3", reset: "4", cancel: "5" }[action.button] ?? "");
    return { Path: path, Event: "click", Value: "" };
  }
  if (action.kind === "swap") return { Path: "", Event: `backend:${action.backend}`, Value: action.host };
  if (action.kind === "mode") return { Path: "", Event: `mode:${action.mode}`, Value: "" };
  if (action.kind === "release") return { Path: "", Event: `release:${action.mode ?? "success"}`, Value: String(action.id) };
  return { Path: "", Event: String(action.kind ?? ""), Value: "" };
}

function pathFromRoot(element, top) {
  const indexes = [];
  let node = element;
  while (node && node !== top) {
    const parent = node.parentNode;
    if (!parent) return null;
    indexes.push(Array.prototype.indexOf.call(parent.childNodes, node));
    node = parent;
  }
  return node === top ? indexes.reverse().join("/") : null;
}

async function inspectAPI(api, fixture) {
  const reported = api.domSnapshot();
  const top = fixture.root.firstElementChild;
  const input = top?.querySelector("input") ?? null;
  const controls = top
    ? Array.from(top.querySelectorAll("input, button"), (element) => ({
      path: pathFromRoot(element, top),
      tag: element.localName,
      value: "value" in element ? element.value : null,
      disabled: Boolean("disabled" in element && element.disabled),
      checked: "checked" in element ? Boolean(element.checked) : null,
    }))
    : [];
  const serverRequests = await recordsFor(fixture.transport.lane);
  const normalized = serverRequests;
  return {
    snapshot: api.snapshot(),
    audit: api.audit(),
    transportLog: fixture.transport.log(),
    serverRequests: normalized,
    pending: normalized.filter((request) => request.State === "held").map((request) => request.ID),
    runtimeCalls: fixture.runtimeCalls ? clone(fixture.runtimeCalls) : null,
    backendName: fixture.host ? fixture.host.backendName() : "reference-react",
    dom: {
      html: fixture.root.innerHTML,
      root: top?.outerHTML ?? "",
      disabled: controls.filter((control) => control.disabled).map((control) => control.path),
      inputPath: input ? pathFromRoot(input, top) : null,
      inputValue: input?.value ?? null,
      inputDisabled: input ? Boolean(input.disabled) : null,
      controlProperties: controls,
      reportedHTML: reported.html,
      reportedDisabled: reported.disabled,
    },
  };
}

const experiment = {
  errors,
  runtimes: null,
  versions: null,
  readyPromise: null,
  current: null,
  async createScenario({ index, name }) {
    if (experiment.current) await experiment.disposeScenario();
    const container = document.getElementById("fixtures");
    const makeRoot = (id) => {
      const root = document.createElement("div");
      root.id = id;
      container.appendChild(root);
      return root;
    };
    const roots = {
      dom: makeRoot(`http-dom-${index}`),
      react: makeRoot(`http-react-${index}`),
      reference: makeRoot(`http-reference-${index}`),
    };
    const scenario = { index, name, participants: {}, referenceEffects: [], releaseResults: [] };

    for (const participant of ["dom", "react"]) {
      const rawRuntime = experiment.runtimes[participant];
      const { runtime, calls } = countRuntime(rawRuntime);
      const modeState = { next: "success" };
      const lane = `e4-${index}-${participant}`;
      const fixture = { participant, root: roots[participant], runtimeCalls: calls, modeState, lane };
      fixture.transport = createInstrumentedTransport({
        runtime,
        lane,
        participant,
        modeState,
        onReply: (reply, deliver) => deliver(reply),
      });
      fixture.host = createEffectHost(roots[participant], runtime, renderers, fixture.transport,
        participant === "dom" ? "dom" : "react");
      fixture.api = fixture.host;
      scenario.participants[participant] = fixture;
    }

    const reference = mountHTTPReference(roots.reference);
    const referenceModeState = { next: "success" };
    const referenceFixture = {
      participant: "reference",
      root: roots.reference,
      lane: `e4-${index}-reference`,
      modeState: referenceModeState,
      api: reference,
    };
    referenceFixture.transport = createInstrumentedTransport({
      runtime: reference,
      lane: referenceFixture.lane,
      participant: "reference",
      modeState: referenceModeState,
      onReply: (reply) => reference.complete(reply),
    });
    scenario.participants.reference = referenceFixture;
    scenario.roots = roots;
    experiment.current = scenario;
    return true;
  },
  rootIDs() {
    if (!experiment.current) throw new Error("no HTTP scenario is active");
    return Object.fromEntries(Object.entries(experiment.current.roots).map(([key, root]) => [key, root.id]));
  },
  mark() {
    if (!experiment.current) throw new Error("no HTTP scenario is active");
    return Object.fromEntries(Object.entries(experiment.current.participants).map(([key, fixture]) => [
      key,
      fixture.transport.log().length,
    ]));
  },
  setMode(mode) {
    if (!experiment.current) throw new Error("no HTTP scenario is active");
    for (const fixture of Object.values(experiment.current.participants)) fixture.modeState.next = mode;
  },
  async drainReferenceEffects() {
    const fixture = experiment.current?.participants.reference;
    if (!fixture) throw new Error("no HTTP reference is active");
    const commands = fixture.api.effects();
    experiment.current.referenceEffects.push(clone(commands));
    for (const command of commands) {
      if (command.Kind === "cancel") fixture.transport.cancel(command.ID);
      else if (command.Kind === "start") {
        fixture.transport.start(command, (reply) => fixture.api.complete(reply));
      } else {
        throw new Error(`reference emitted unsupported effect ${JSON.stringify(command)}`);
      }
    }
    return commands;
  },
  async settleAction(mark) {
    const scenario = experiment.current;
    if (!scenario) throw new Error("no HTTP scenario is active");
    await Promise.all([scenario.participants.dom.host.settled(), scenario.participants.react.host.settled()]);
    const referenceCommands = await experiment.drainReferenceEffects();
    const outcomes = {};

    for (const [name, fixture] of Object.entries(scenario.participants)) {
      const log = fixture.transport.log();
      const previousLength = mark?.[name] ?? 0;
      const recent = log.slice(previousLength);
      const starts = recent.filter((event) => event.Kind === "start");
      const cancels = recent.filter((event) => event.Kind === "cancel");
      for (const event of starts) {
        const mode = fixture.transport.modeFor(event.ID);
        if (mode === "held") {
          await waitForRecord(fixture, event.ID, (record) => record.State === "held", "held request");
        } else {
          const result = await fixture.transport.waitForDelivery(event.ID);
          assertDeliveredReply(fixture, event.ID, mode, result);
          await assertFinalRecord(fixture, event.ID, mode);
        }
      }
      for (const event of cancels) {
        const priorMode = fixture.transport.modeFor(event.ID);
        if (priorMode === "held") {
          await waitForRecord(fixture, event.ID,
            (record) => record.State === "cancelled" && record.CancelObserved,
            "server cancellation observation");
        }
      }
      outcomes[name] = { starts, cancels, referenceEffects: name === "reference" ? clone(referenceCommands) : undefined };
    }

    await Promise.all([scenario.participants.dom.host.settled(), scenario.participants.react.host.settled()]);
    return outcomes;
  },
  async release(id, mode = "success", expectedStatus = 202) {
    const scenario = experiment.current;
    if (!scenario) throw new Error("no HTTP scenario is active");
    const results = {};
    for (const [name, fixture] of Object.entries(scenario.participants)) {
      const prior = await waitForRecord(fixture, id,
        (record) => record.State === "held" || record.State === "cancelled" || record.State === "completed" || record.State === "dropped",
        "request before release");
      const url = new URL("/api/release", location.origin);
      url.searchParams.set("lane", fixture.lane);
      url.searchParams.set("id", String(id));
      url.searchParams.set("mode", mode);
      const response = await fetch(url, { method: "POST" });
      const text = await response.text();
      if (prior.State === "held") {
        if (expectedStatus !== 202 || response.status !== 202) {
          throw new Error(`release of held ${name} request ${id} returned ${response.status}; expected 202 ${text}`);
        }
        const delivered = await fixture.transport.waitForDelivery(id);
        assertDeliveredReply(fixture, id, mode, delivered);
        await assertFinalRecord(fixture, id, mode);
        results[name] = { status: response.status, priorState: prior.State, body: text };
      } else {
        if (expectedStatus !== 409 || response.status !== 409) {
          throw new Error(`late release of ${name} request ${id} returned ${response.status}, expected ${expectedStatus} for ${prior.State}`);
        }
        const after = (await recordsFor(fixture.lane)).find((record) => record.ID === id) ?? null;
        if (JSON.stringify(after) !== JSON.stringify(prior)) {
          throw new Error(`late release changed ${name} request ${id}: before=${JSON.stringify(prior)} after=${JSON.stringify(after)}`);
        }
        results[name] = { status: response.status, priorState: prior.State, body: text };
      }
    }
    await Promise.all([scenario.participants.dom.host.settled(), scenario.participants.react.host.settled()]);
    scenario.releaseResults.push({ id, mode, results });
    return results;
  },
  async swap({ host, backend }) {
    const fixture = experiment.current?.participants[host];
    if (!fixture?.host) throw new Error(`cannot swap unknown candidate host ${host}`);
    fixture.staleInput = fixture.root.querySelector("input");
    fixture.host.replaceBackend(backend);
  },
  staleInput({ host, value }) {
    const fixture = experiment.current?.participants[host];
    if (!fixture?.staleInput) throw new Error(`no detached input was retained for ${host}`);
    fixture.staleInput.value = value;
    fixture.staleInput.dispatchEvent(new Event("input", { bubbles: true }));
  },
  async capture() {
    const scenario = experiment.current;
    if (!scenario) throw new Error("no HTTP scenario is active");
    const observations = {};
    for (const [name, fixture] of Object.entries(scenario.participants)) {
      observations[name] = await inspectAPI(fixture.api, fixture);
    }
    return {
      observations,
      referenceEffects: clone(scenario.referenceEffects),
      releaseResults: clone(scenario.releaseResults),
      errors: clone(errors),
    };
  },
  async disposeScenario() {
    const scenario = experiment.current;
    if (!scenario) return;
    const errorsBefore = errors.length;
    for (const name of ["dom", "react"]) {
      const fixture = scenario.participants[name];
      try { fixture.host.unmount(); } catch (error) { errors.push(errorText(error)); }
      try { fixture.transport.dispose(); } catch (error) { errors.push(errorText(error)); }
      fixture.root.remove();
    }
    const referenceFixture = scenario.participants.reference;
    try { referenceFixture.api.unmount(); } catch (error) { errors.push(errorText(error)); }
    try { referenceFixture.transport.dispose(); } catch (error) { errors.push(errorText(error)); }
    referenceFixture.root.remove();
    experiment.current = null;
    if (errors.length > errorsBefore) throw new Error(errors.slice(errorsBefore).join("\n"));
  },
};

window.__httpHarness = experiment;
experiment.readyPromise = (async () => {
  const domRuntime = await makeRuntime();
  const reactRuntime = await makeRuntime();
  if (domRuntime === reactRuntime) throw new Error("Go HTTP WASM runtime objects are not independent");
  experiment.runtimes = { dom: domRuntime, react: reactRuntime };
  experiment.versions = { react: referenceReactVersion, reactDOM: referenceReactDOMVersion };
  if (referenceReactVersion !== "19.3.1" || referenceReactDOMVersion !== "19.3.1") {
    throw new Error(`expected React and ReactDOM 19.3.1, got ${JSON.stringify(experiment.versions)}`);
  }
  return true;
})().catch((error) => {
  window.__httpInitError = errorText(error);
  errors.push(window.__httpInitError);
  throw error;
});
