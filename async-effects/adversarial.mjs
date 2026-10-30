// Adversarial browser probes for the Go-owned async-save host. The browser
// fixture supplies real Go WASM sessions; probes marked synthetic exercise
// host behavior with deliberately failing local transports or a retained
// renderer facade.

export const expectedProbeNames = Object.freeze([
  "cancelled-reply-go-id-guard",
  "out-of-order-replies-go-id-guard",
  "duplicate-reply-go-id-guard",
  "error-preserves-saved-then-retry",
  "reset-does-not-reuse-go-id",
  "backend-swap-preserves-pending-request",
  "unmount-late-callback-makes-zero-go-calls",
  "cross-session-id-collision-is-fenced",
  "synthetic-start-transport-error-is-reported",
  "synthetic-cancel-transport-error-is-reported",
  "synthetic-stale-facade-dispatch-is-fenced",
]);

const expectedNameSet = new Set(expectedProbeNames);

/** Validate that a browser run emitted every frozen probe exactly once. */
export function validateProbeSet(probes) {
  if (!Array.isArray(probes)) throw new TypeError("adversarial probes must be an array");
  const names = probes.map((probe) => probe?.name);
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const missing = expectedProbeNames.filter((name) => !counts.has(name));
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([name]) => name);
  const unexpected = [...counts.keys()].filter((name) => !expectedNameSet.has(name));
  const mislabeled = probes.filter((probe) => {
    const expectedKind = typeof probe?.name === "string" && probe.name.startsWith("synthetic-")
      ? "synthetic"
      : "real-go";
    return probe?.kind !== expectedKind;
  }).map((probe) => probe?.name ?? "<unnamed>");
  if (missing.length || duplicates.length || unexpected.length || mislabeled.length) {
    const details = [];
    if (missing.length) details.push(`missing required adversarial probes: ${missing.join(", ")}`);
    if (duplicates.length) details.push(`duplicate adversarial probes: ${duplicates.join(", ")}`);
    if (unexpected.length) details.push(`unregistered adversarial probes: ${unexpected.join(", ")}`);
    if (mislabeled.length) details.push(`mislabelled adversarial probes: ${mislabeled.join(", ")}`);
    const error = new Error(details.join("; "));
    error.probes = probes;
    throw error;
  }

  const failures = probes.filter((probe) => probe.pass !== true).map((probe) => ({
    name: probe.name,
    kind: probe.kind,
    observations: probe.observations ?? null,
  }));
  return {
    ok: failures.length === 0,
    expected: [...expectedProbeNames],
    failures,
  };
}

/**
 * Run serialized real-Go lifecycle scenarios and explicitly labeled synthetic
 * host-fence/transport-failure scenarios in the async-effects browser fixture.
 * A complete report is returned even when individual probes fail.
 */
export async function runAdversarial(page) {
  if (!page || typeof page.evaluate !== "function" || typeof page.locator !== "function" ||
      !page.keyboard || typeof page.keyboard.type !== "function") {
    throw new TypeError("runAdversarial(page) requires a Playwright-compatible page");
  }

  const result = await page.evaluate(async (requiredProbeNames) => {
    const experiment = window.__asyncExperiment;
    const probes = [];
    let rootSequence = 0;

    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const clone = (value) => structuredClone(value);
    const canonical = (value) => JSON.stringify(value);
    const errorText = (error) => String(error?.stack ?? error?.message ?? error);
    const errorTexts = (error, seen = new Set()) => {
      if (error == null || seen.has(error)) return [];
      seen.add(error);
      const lines = [`${error.name ?? "Error"}: ${error.message ?? String(error)}`];
      if (Array.isArray(error.errors)) {
        for (const child of error.errors) lines.push(...errorTexts(child, seen));
      }
      if (error.cause) lines.push(...errorTexts(error.cause, seen));
      return lines;
    };
    const countSnapshot = (fixture) => clone(fixture.runtimeCalls);
    const countDelta = (before, after) => Object.fromEntries(
      Object.keys(after).map((key) => [key, after[key] - (before[key] ?? 0)]),
    );
    const assertDelta = (before, after, expected, label) => {
      const actual = countDelta(before, after);
      for (const [key, value] of Object.entries(expected)) {
        assert(actual[key] === value,
          `${label}: expected ${key} Go calls to increase by ${value}, got ${actual[key]}`);
      }
      return actual;
    };
    const stateOf = (fixture) => fixture.host.snapshot().state;
    const auditOf = (fixture) => fixture.host.audit();
    const settle = async (fixture) => {
      await fixture.host.flush();
      await fixture.host.settled();
    };
    const fill = async (fixture, value) => {
      const input = fixture.root.querySelector('input[type="text"][aria-label="Draft"]');
      assert(input, "DOM renderer did not expose the Draft input");
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await settle(fixture);
    };
    const save = async (fixture, value) => {
      await fill(fixture, value);
      fixture.host.click("3");
      await settle(fixture);
      const state = stateOf(fixture);
      assert(state.PendingID > 0 && state.Status === "pending", "Save did not create a pending Go request");
      return state.PendingID;
    };
    const deliver = async (fixture, id, options) => {
      const reply = fixture.manualTransport.deliver(id, options);
      await settle(fixture);
      return reply;
    };
    const record = async (name, kind, action) => {
      const probe = { name, pass: false, kind, observations: null };
      probes.push(probe);
      try {
        probe.observations = await action();
        probe.pass = true;
      } catch (error) {
        probe.observations = { error: errorText(error) };
      }
    };
    const createFixture = async (runtimeKey = "dom") => {
      assert(experiment && typeof experiment.createFixture === "function",
        "fixture must expose createFixture({backend,runtimeKey,defaultValue})");
      const fixture = await experiment.createFixture({ backend: "dom", runtimeKey });
      assert(fixture && fixture.root && fixture.host && fixture.manualTransport &&
        fixture.runtimeCalls && typeof fixture.dispose === "function",
      "createFixture() returned an incomplete real-Go host fixture");
      return fixture;
    };
    const disposeFixture = async (fixture) => {
      if (fixture && typeof fixture.dispose === "function") await fixture.dispose();
    };
    const releaseAfterHostUnmount = (fixture) => {
      if (fixture?.reference && typeof fixture.reference.unmount === "function") fixture.reference.unmount();
      fixture?.roots?.host?.remove();
      fixture?.roots?.reference?.remove();
      if (!fixture?.roots) fixture?.root?.remove();
    };
    const findStart = (fixture, id) => fixture.manualTransport.pending().find(
      (command) => command.Kind === "start" && command.ID === id,
    );

    if (!experiment || typeof experiment.createFixture !== "function" ||
        typeof experiment.createEffectHost !== "function" ||
        !experiment.renderers?.dom || !experiment.renderers?.react) {
      return { probes: [], fixtureError: "window.__asyncExperiment must expose createFixture, createEffectHost, and both renderers" };
    }
    try {
      await experiment.readyPromise;
    } catch (error) {
      return { probes: [], fixtureError: errorText(error) };
    }

    let realFixture = null;
    await record("cancelled-reply-go-id-guard", "real-go", async () => {
      realFixture = await createFixture("dom");
      const before = countSnapshot(realFixture);
      const id = await save(realFixture, "cancelled-value");
      assert(findStart(realFixture, id), `transport did not record Go start ID ${id}`);
      realFixture.host.click("5");
      await settle(realFixture);
      assert(stateOf(realFixture).Status === "cancelled" && stateOf(realFixture).PendingID === 0,
        "Cancel did not clear the active Go request");
      const reply = await deliver(realFixture, id, { value: "forced-after-cancel" });
      const state = stateOf(realFixture);
      const outcome = auditOf(realFixture).at(-1);
      const calls = assertDelta(before, countSnapshot(realFixture), { dispatch: 3, complete: 1 }, "cancelled reply");
      assert(state.Status === "cancelled" && state.Saved === "" && state.Saves === 0,
        "forced cancelled reply changed saved application state");
      assert(outcome?.ID === id && outcome.Accepted === false && outcome.Reason === "stale",
        "forced cancelled reply was not audited as stale");
      return { id, reply, state, outcome, goCallDelta: calls };
    });

    await record("out-of-order-replies-go-id-guard", "real-go", async () => {
      assert(realFixture, "real Go fixture was not initialized");
      const before = countSnapshot(realFixture);
      const olderID = await save(realFixture, "older-request");
      const newerID = await save(realFixture, "newer-request");
      assert(newerID > olderID, "replacement Save did not allocate a larger Go request ID");
      assert(findStart(realFixture, olderID) && findStart(realFixture, newerID),
        "transport did not record both Go start commands");
      await deliver(realFixture, newerID, { value: "newer-reply" });
      const afterNewer = stateOf(realFixture);
      await deliver(realFixture, olderID, { value: "late-older-reply" });
      const finalState = stateOf(realFixture);
      const outcomes = auditOf(realFixture).slice(-2);
      const calls = assertDelta(before, countSnapshot(realFixture), { dispatch: 4, complete: 2 }, "out-of-order replies");
      assert(afterNewer.Saved === "newer-reply" && afterNewer.Status === "saved",
        "current request reply did not save its value");
      assert(finalState.Saved === "newer-reply" && finalState.Saves === afterNewer.Saves,
        "late older request overwrote the current reply");
      assert(outcomes[0]?.ID === newerID && outcomes[0].Accepted === true && outcomes[0].Reason === "saved" &&
        outcomes[1]?.ID === olderID && outcomes[1].Accepted === false && outcomes[1].Reason === "stale",
      "out-of-order completion audit did not retain accepted-then-stale order");
      return { deliveryOrder: [newerID, olderID], finalState, outcomes, goCallDelta: calls };
    });

    await record("duplicate-reply-go-id-guard", "real-go", async () => {
      assert(realFixture, "real Go fixture was not initialized");
      const before = countSnapshot(realFixture);
      const id = await save(realFixture, "duplicate-request");
      await deliver(realFixture, id, { value: "first-delivery" });
      const afterFirst = realFixture.host.snapshot();
      await deliver(realFixture, id, { value: "second-delivery" });
      const afterDuplicate = realFixture.host.snapshot();
      const outcomes = auditOf(realFixture).slice(-2);
      const calls = assertDelta(before, countSnapshot(realFixture), { dispatch: 2, complete: 2 }, "duplicate reply");
      assert(canonical(afterDuplicate.state) === canonical(afterFirst.state),
        "duplicate completion changed application state");
      assert(afterDuplicate.messages.length === afterFirst.messages.length + 1,
        "duplicate completion did not remain visible as a reply message");
      assert(outcomes[0]?.ID === id && outcomes[0].Accepted === true &&
        outcomes[1]?.ID === id && outcomes[1].Accepted === false && outcomes[1].Reason === "stale",
      "duplicate completion audit did not preserve accepted then stale receipts");
      return { id, firstState: afterFirst.state, duplicateState: afterDuplicate.state, outcomes, goCallDelta: calls };
    });

    await record("error-preserves-saved-then-retry", "real-go", async () => {
      assert(realFixture, "real Go fixture was not initialized");
      const baseline = stateOf(realFixture);
      const before = countSnapshot(realFixture);
      const failedID = await save(realFixture, "temporary-failure");
      await deliver(realFixture, failedID, { error: "synthetic-service-error" });
      const afterError = stateOf(realFixture);
      const errorOutcome = auditOf(realFixture).at(-1);
      assert(afterError.Saved === baseline.Saved && afterError.Saves === baseline.Saves,
        "active error reply changed the last successful save");
      assert(afterError.Status === "error: synthetic-service-error" && afterError.PendingID === 0,
        "active error reply did not clear pending state and expose its status");
      const retryID = await save(realFixture, "retry-success");
      assert(retryID > failedID, "retry did not allocate a fresh Go request ID");
      await deliver(realFixture, retryID, { value: "retry-success" });
      const finalState = stateOf(realFixture);
      const retryOutcome = auditOf(realFixture).at(-1);
      const calls = assertDelta(before, countSnapshot(realFixture), { dispatch: 4, complete: 2 }, "error and retry");
      assert(errorOutcome?.ID === failedID && errorOutcome.Accepted === true && errorOutcome.Reason === "error" &&
        retryOutcome?.ID === retryID && retryOutcome.Accepted === true && retryOutcome.Reason === "saved",
      "error and retry receipts did not report their exact outcomes");
      assert(finalState.Saved === "retry-success" && finalState.Saves === baseline.Saves + 1 &&
        finalState.Status === "saved" && finalState.PendingID === 0,
      "successful retry did not replace saved value and clear pending state");
      return { failedID, retryID, afterError, finalState, outcomes: [errorOutcome, retryOutcome], goCallDelta: calls };
    });

    await record("reset-does-not-reuse-go-id", "real-go", async () => {
      let resetFixture = null;
      try {
        resetFixture = await createFixture("react");
        const before = countSnapshot(resetFixture);
        const resetID = await save(resetFixture, "reset-pending");
        assert(resetID === 1, `fresh Go session should allocate ID 1 before Reset, got ${resetID}`);
        resetFixture.host.click("4");
        await settle(resetFixture);
        const afterReset = resetFixture.host.snapshot();
        assert(afterReset.state.Status === "idle" && afterReset.state.PendingID === 0 &&
          afterReset.state.NextID === resetID && afterReset.state.Draft === "" &&
          afterReset.state.Saved === "" && afterReset.state.Saves === 0,
        "Reset did not clear editor state while preserving NextID=1");
        const nextID = await save(resetFixture, "after-reset");
        assert(nextID === 2, `Reset reused request ID 1 instead of allocating ID 2, got ${nextID}`);
        await deliver(resetFixture, resetID, { value: "stale-reset-reply" });
        const whileCurrentPending = resetFixture.host.snapshot();
        assert(whileCurrentPending.state.PendingID === nextID &&
          whileCurrentPending.state.Saved === afterReset.state.Saved &&
          whileCurrentPending.state.Saves === afterReset.state.Saves &&
          whileCurrentPending.state.Status === "pending",
        "late pre-reset reply changed ID 2 pending state or the reset-empty saved value");
        await deliver(resetFixture, nextID, { value: "after-reset" });
        const finalState = stateOf(resetFixture);
        const outcomes = auditOf(resetFixture).slice(-2);
        const calls = assertDelta(before, countSnapshot(resetFixture), { dispatch: 5, complete: 2 }, "reset ID reuse");
        assert(outcomes[0]?.ID === resetID && outcomes[0].Accepted === false && outcomes[0].Reason === "stale" &&
          outcomes[1]?.ID === nextID && outcomes[1].Accepted === true && outcomes[1].Reason === "saved",
        "late pre-reset and current replies were not classified separately");
        assert(finalState.Saved === "after-reset" && finalState.Status === "saved" && finalState.NextID === nextID,
          "post-reset completion did not retain monotonically increasing IDs");
        return { resetID, nextID, afterReset: afterReset.state, whileCurrentPending: whileCurrentPending.state,
          finalState, outcomes, goCallDelta: calls };
      } finally {
        if (resetFixture) await disposeFixture(resetFixture);
      }
    });

    await record("backend-swap-preserves-pending-request", "real-go", async () => {
      assert(realFixture, "real Go fixture was not initialized");
      const before = countSnapshot(realFixture);
      const id = await save(realFixture, "swap-pending");
      const initCount = realFixture.runtimeCalls.init;
      await realFixture.host.replaceBackend("react");
      await settle(realFixture);
      const swapped = stateOf(realFixture);
      assert(realFixture.host.backendName() === "react", "backend swap did not select React renderer");
      assert(swapped.PendingID === id && swapped.Status === "pending",
        "backend swap lost the active Go request");
      assert(realFixture.runtimeCalls.init === initCount,
        "backend swap reinitialized the Go session");
      assert(findStart(realFixture, id), "backend swap removed the unresolved manual transport request");
      await deliver(realFixture, id, { value: "delivered-after-swap" });
      const finalState = stateOf(realFixture);
      const calls = assertDelta(before, countSnapshot(realFixture), { dispatch: 2, complete: 1, init: 0 }, "backend swap");
      assert(finalState.Saved === "delivered-after-swap" && finalState.Status === "saved",
        "completion after backend swap did not update the same Go session");
      return { id, backend: realFixture.host.backendName(), swapped, finalState, goCallDelta: calls };
    });

    await record("unmount-late-callback-makes-zero-go-calls", "real-go", async () => {
      assert(realFixture, "real Go fixture was not initialized");
      let hostUnmounted = false;
      try {
        const beforeStart = countSnapshot(realFixture);
        const id = await save(realFixture, "unmount-pending");
        const pendingState = stateOf(realFixture);
        const dispatchCalls = assertDelta(beforeStart, countSnapshot(realFixture), { dispatch: 2 }, "unmount setup");
        realFixture.host.unmount();
        hostUnmounted = true;
        const afterUnmount = countSnapshot(realFixture);
        assert(findStart(realFixture, id), "unmount erased the captured late-reply callback");
        const reply = realFixture.manualTransport.deliver(id, { value: "arrived-after-unmount" });
        await Promise.resolve();
        await Promise.resolve();
        const afterDelivery = countSnapshot(realFixture);
        assert(canonical(afterDelivery) === canonical(afterUnmount),
          `late callback made Go calls after unmount: before=${canonical(afterUnmount)} after=${canonical(afterDelivery)}`);
        assert(pendingState.PendingID === id && pendingState.Status === "pending",
          "unmount setup did not retain a pending request before delivery");
        assert(reply.ID === id && reply.Value === "arrived-after-unmount",
          "manual transport did not force the reply after cancellation/unmount");
        return { id, reply, goCallDeltaBeforeUnmount: dispatchCalls, goCallCountsAfterUnmount: afterUnmount,
          goCallCountsAfterLateDelivery: afterDelivery, lateDeliveryDelta: countDelta(afterUnmount, afterDelivery) };
      } finally {
        if (hostUnmounted) releaseAfterHostUnmount(realFixture);
        else await disposeFixture(realFixture);
        realFixture = null;
      }
    });

    await record("cross-session-id-collision-is-fenced", "real-go", async () => {
      let oldFixture = null;
      let newFixture = null;
      let oldHostUnmounted = false;
      let oldFixtureReleased = false;
      try {
        oldFixture = await createFixture("dom");
        const oldBeforeSave = countSnapshot(oldFixture);
        const oldID = await save(oldFixture, "old-session-value");
        assert(oldID === 1, `fresh old Go session should allocate ID 1, got ${oldID}`);
        const oldSaveCalls = assertDelta(oldBeforeSave, countSnapshot(oldFixture), { dispatch: 2 }, "old session setup");
        oldFixture.host.unmount();
        oldHostUnmounted = true;
        const oldCountsAfterUnmount = countSnapshot(oldFixture);
        const oldTransport = oldFixture.manualTransport;
        releaseAfterHostUnmount(oldFixture);
        oldFixtureReleased = true;

        newFixture = await createFixture("dom");
        const newBeforeSave = countSnapshot(newFixture);
        const newID = await save(newFixture, "new-session-value");
        assert(newID === 1, `new Go init should reset NextID and allocate ID 1, got ${newID}`);
        const newSaveCalls = assertDelta(newBeforeSave, countSnapshot(newFixture), { dispatch: 2 }, "new session setup");
        const newStateBeforeOldReply = stateOf(newFixture);
        assert(newStateBeforeOldReply.PendingID === newID && newStateBeforeOldReply.Saved === "",
          "new Go session did not hold the colliding ID while awaiting its own reply");
        const newCountsBeforeOldReply = countSnapshot(newFixture);
        const oldReply = oldTransport.deliver(oldID, { value: "must-not-cross-session" });
        await Promise.resolve();
        await Promise.resolve();
        const oldCountsAfterLateReply = countSnapshot(oldFixture);
        const newCountsAfterLateReply = countSnapshot(newFixture);
        const newStateAfterOldReply = stateOf(newFixture);
        assert(canonical(oldCountsAfterLateReply) === canonical(oldCountsAfterUnmount),
          "old host late callback called Go after its unmount");
        assert(canonical(newCountsAfterLateReply) === canonical(newCountsBeforeOldReply),
          "old host late callback called the reinitialized Go API through the new session");
        assert(newStateAfterOldReply.PendingID === newID && newStateAfterOldReply.Saved === "" &&
          newStateAfterOldReply.Status === "pending",
        "old ID-1 callback was accepted by the new Go session's colliding ID 1 request");
        await deliver(newFixture, newID, { value: "new-session-value" });
        const finalState = stateOf(newFixture);
        assert(finalState.Saved === "new-session-value" && finalState.Status === "saved",
          "new session could not complete its own colliding ID 1 request");
        const completionCalls = newFixture.runtimeCalls.complete;
        assert(completionCalls === 1,
          `new session should call Go Complete once for its own reply, got ${completionCalls}`);
        const result = { oldID, newID, oldReply, oldGoCallsAfterUnmount: oldCountsAfterLateReply,
          newGoCallsBeforeOldReply: newCountsBeforeOldReply, newGoCallsAfterOldReply: newCountsAfterLateReply,
          newStateBeforeOldReply, newStateAfterOldReply, finalState,
          oldSessionGoCallDelta: oldSaveCalls, newSessionGoCallDelta: newSaveCalls,
          label: "real Go IDs with controller-generation fence" };
        await disposeFixture(newFixture);
        newFixture = null;
        return result;
      } finally {
        if (oldFixture && !oldFixtureReleased) {
          if (oldHostUnmounted) releaseAfterHostUnmount(oldFixture);
          else await disposeFixture(oldFixture);
        }
        if (newFixture) await disposeFixture(newFixture);
      }
    });

    await record("synthetic-start-transport-error-is-reported", "synthetic", async () => {
      const fixture = await createFixture("react");
      const marker = "__E6_SYNTHETIC_START_FAILURE__";
      const originalStart = fixture.manualTransport.start;
      fixture.manualTransport.start = () => { throw new Error(marker); };
      const before = countSnapshot(fixture);
      try {
        await fill(fixture, "transport-start-failure");
        fixture.host.click("3");
        let failure = null;
        try { await fixture.host.flush(); } catch (error) { failure = error; }
        assert(failure, "host silently swallowed a synchronous transport.start() failure");
        const chain = errorTexts(failure);
        assert(chain.some((line) => line.includes(marker)),
          `start transport failure did not retain its case-specific error marker: ${chain.join(" -> ")}`);
        assert(chain.some((line) => line.includes("transport.start")),
          `start transport failure was not surfaced as a transport.start failure: ${chain.join(" -> ")}`);
        const calls = assertDelta(before, countSnapshot(fixture), { dispatch: 2 }, "synthetic start transport failure");
        assert(stateOf(fixture).Status === "pending" && stateOf(fixture).PendingID > 0,
          "synthetic transport failure rewrote Go-owned pending state");
        return { marker, failure: chain, state: stateOf(fixture), goCallDelta: calls, label: "synthetic host/transport fault" };
      } finally {
        fixture.manualTransport.start = originalStart;
        await disposeFixture(fixture);
      }
    });

    await record("synthetic-cancel-transport-error-is-reported", "synthetic", async () => {
      const fixture = await createFixture("react");
      const marker = "__E6_SYNTHETIC_CANCEL_FAILURE__";
      const originalCancel = fixture.manualTransport.cancel;
      fixture.manualTransport.cancel = () => { throw new Error(marker); };
      const before = countSnapshot(fixture);
      try {
        const id = await save(fixture, "transport-cancel-failure");
        fixture.host.click("5");
        let failure = null;
        try { await fixture.host.flush(); } catch (error) { failure = error; }
        assert(failure, "host silently swallowed a synchronous transport.cancel() failure");
        const chain = errorTexts(failure);
        assert(chain.some((line) => line.includes(marker)),
          `cancel transport failure did not retain its case-specific error marker: ${chain.join(" -> ")}`);
        assert(chain.some((line) => line.includes("transport.cancel")),
          `cancel transport failure was not surfaced as a transport.cancel failure: ${chain.join(" -> ")}`);
        const calls = assertDelta(before, countSnapshot(fixture), { dispatch: 3 }, "synthetic cancel transport failure");
        const state = stateOf(fixture);
        assert(state.Status === "cancelled" && state.PendingID === 0,
          "synthetic transport failure overrode Go's cancellation state");
        return { id, marker, failure: chain, state, goCallDelta: calls, label: "synthetic host/transport fault" };
      } finally {
        fixture.manualTransport.cancel = originalCancel;
        await disposeFixture(fixture);
      }
    });

    await record("synthetic-stale-facade-dispatch-is-fenced", "synthetic", async () => {
      const fixture = await createFixture("react");
      await disposeFixture(fixture);
      const root = document.createElement("div");
      root.id = `async-adversarial-facade-${++rootSequence}`;
      document.body.appendChild(root);
      const facades = [];
      const mount = (container, facade) => {
        facades.push(facade);
        facade.init();
        container.replaceChildren();
        return {
          snapshot: () => facade.init(),
          domSnapshot: () => ({ html: "", disabled: [] }),
          click: () => {},
          unmount: () => container.replaceChildren(),
        };
      };
      const host = experiment.createEffectHost(root, fixture.runtime, { first: mount, second: mount },
        fixture.manualTransport, "first");
      try {
        assert(facades.length === 1, "initial synthetic renderer did not receive its runtime facade");
        const beforeSwap = countSnapshot(fixture);
        host.replaceBackend("second");
        const afterSwap = countSnapshot(fixture);
        assert(canonical(afterSwap) === canonical(beforeSwap),
          "backend replacement called Go while exercising synthetic facade fencing");
        const stale = facades[0];
        const callsBeforeStaleDispatch = countSnapshot(fixture);
        let rejection = null;
        try { stale.dispatch({ Path: "3", Event: "click", Value: "" }); }
        catch (error) { rejection = error; }
        assert(rejection, "stale renderer facade dispatch was not rejected");
        const chain = errorTexts(rejection);
        assert(chain.some((line) => line.includes("stale renderer")),
          `stale facade dispatch failed for an unexpected reason: ${chain.join(" -> ")}`);
        const afterStaleDispatch = countSnapshot(fixture);
        assert(canonical(afterStaleDispatch) === canonical(callsBeforeStaleDispatch),
          "stale facade dispatch crossed into the counted Go runtime");
        return { rejection: chain, goCallCountsBefore: callsBeforeStaleDispatch,
          goCallCountsAfter: afterStaleDispatch, label: "synthetic retained renderer facade" };
      } finally {
        host.unmount();
        root.remove();
      }
    });

    return { probes, requiredProbeNames };
  }, [...expectedProbeNames]);

  if (!result || !Array.isArray(result.probes)) {
    const error = new Error(result?.fixtureError ?? "browser adversarial runner returned no probe list");
    error.report = result ?? null;
    throw error;
  }
  let validation;
  try {
    validation = validateProbeSet(result.probes);
  } catch (error) {
    error.report = result;
    throw error;
  }
  return {
    ok: validation.ok,
    expectedProbeNames: [...expectedProbeNames],
    probes: result.probes,
    validation,
  };
}
