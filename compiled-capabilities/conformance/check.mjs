function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertSame(expected, actual, message) {
  if (!same(expected, actual)) throw new Error(`${message}: values differ`);
}

function ids(rows) {
  return rows.map((row) => row.id);
}

function assertRejectedBeforeInitialization(rows, label) {
  for (const row of rows) {
    assert(row.rejected && row.errorName === "TypeError", `${label} case ${row.id} was not rejected with TypeError`);
    assert(row.initCalls === 0 && row.updateCalls === 0 && row.viewCalls === 0,
      `${label} case ${row.id} ran a Go role before rejection`);
    assert(row.rendererCalls === 0, `${label} case ${row.id} called a renderer method before rejection`);
    assert(row.containerEmpty, `${label} case ${row.id} touched the physical container before rejection`);
  }
}

function assertRawSwapPreservation(label, before, after, checkLease) {
  assert(before?.snapshot && after?.snapshot, `${label} swap snapshots are missing`);
  assertSame(before.snapshot.state, after.snapshot.state, `${label} raw state preservation`);
  assertSame(before.snapshot.view, after.snapshot.view, `${label} raw view preservation`);
  assertSame(before.snapshot.dom, after.snapshot.dom, `${label} raw DOM preservation`);
  assertSame(before.pending, after.pending, `${label} raw pending-effect preservation`);
  if (checkLease) {
    assert(Number.isInteger(before.diagnostics?.currentGeneration) &&
      before.diagnostics.currentGeneration === after.diagnostics?.currentGeneration,
    `${label} rejected swap changed the active renderer lease generation`);
  }
  return true;
}

function assertTrace(browser) {
  const trace = browser.swap.finalTrace;
  const token = browser.swap.requestRecord.token;
  const expectedMessages = [
    null,
    { name: "addParent", arg: "" },
    { name: "requestParent", arg: "" },
    { name: "addParent", arg: "" },
    { name: "complete", arg: token },
  ];
  assert(trace?.schema === "gobi.trace/v1", "capability swap trace schema differs");
  assert(trace.ticks.length === expectedMessages.length, "capability swap trace tick count differs");
  expectedMessages.forEach((message, index) => {
    const tick = trace.ticks[index];
    assert(tick.index === index, `capability swap tick ${index} is out of order`);
    assertSame(message, tick.message, `capability swap tick ${index} message`);
    assertSame(index === 0 ? null : `dispatch-${String(index).padStart(4, "0")}`, tick.dispatchId,
      `capability swap tick ${index} dispatch ID`);
  });
  const request = trace.ticks[2].requestedEffects;
  assert(request.length === 1, "request tick must carry exactly one Go effect");
  assertSame({
    dispatchId: "dispatch-0002",
    effectIndex: 0,
    effect: { kind: "fixture.request", name: "lookup", arg: token, reply: "complete" },
  }, request[0], "capability swap request effect");
  assertSame([{
    dispatchId: "dispatch-0002",
    effectIndex: 0,
    message: { name: "complete", arg: token },
  }], trace.ticks[4].completedEffects, "capability swap reply correlation");
}

function checkCore({ lifecycle, browser, expectations, outputPaths }) {
  assert(lifecycle?.run?.status === "matched", "inherited compiled lifecycle run did not match");
  assert(lifecycle?.check?.status === "matched", "inherited compiled lifecycle checker did not match");
  assert(browser?.schema === "gobi.compiled-capability-browser/v1", "capability browser evidence schema differs");
  assert(browser.fixture === lifecycle.check.fixture, "capability probe and lifecycle replay fixtures differ");
  for (const capability of ["view.node", "effect.request-reply", "effect.cancel"]) {
    assert(browser.componentCapabilities.includes(capability), `compiled lifecycle AppIR lacks ${capability}`);
  }

  const expectation = expectations.admission;
  const allExpectedRows = [
    ...expectation.rejectBeforeInitOrRender,
    ...expectation.strictHostDeclarations,
    ...expectation.strictRendererDeclarations,
  ];
  const expectedCaseIds = ids(allExpectedRows);
  const actualAdmissions = browser.admissions?.admissions ?? [];
  const actualHostDescriptors = browser.admissions?.hostDescriptorCases ?? [];
  const actualRendererDescriptors = browser.admissions?.rendererDescriptorCases ?? [];
  const observedCaseIds = [...ids(actualAdmissions), ...ids(actualHostDescriptors), ...ids(actualRendererDescriptors)];
  assertSame(expectedCaseIds, observedCaseIds, "capability admission case IDs");
  assertRejectedBeforeInitialization(actualAdmissions, "admission");
  assertRejectedBeforeInitialization(actualHostDescriptors, "host descriptor");
  assertRejectedBeforeInitialization(actualRendererDescriptors, "renderer descriptor");
  for (const row of actualHostDescriptors.filter((item) => item.id === "accessor-host-capability")) {
    assert(row.descriptorGetterCalls === 0, "host capability validation invoked an array-element accessor");
  }
  const optionAccessor = actualHostDescriptors.find((item) => item.id === "accessor-host-capabilities-property");
  assert(optionAccessor?.optionAccessorConstructed === true,
    "host option property case did not construct an own getter descriptor");
  assert(optionAccessor.optionGetterCalls === 0 && optionAccessor.descriptorGetterCalls === 0,
    "host option property getter was invoked during admission");
  for (const row of actualRendererDescriptors.filter((item) =>
    item.id === "accessor-renderer-capability" || item.id === "accessor-renderer-capabilities-property")) {
    assert(row.descriptorGetterCalls === 0 && row.rendererCapabilityGetterCalls === 0,
      `renderer capability validation invoked an accessor in ${row.id}`);
  }

  const swap = browser.swap;
  const expectedRejectedPreservation = [...expectations.swap.preservedAfterRejectedSwap];
  const expectedCompatiblePreservation = [...expectations.swap.compatibleSwapPreserves];
  assertSame(expectations.renderer.knownCapabilities, swap.activeRendererProfiles.dom,
    "mounted DOM renderer profile");
  assertSame(expectations.swap.compatibleRendererCapabilities, swap.activeRendererProfiles.react,
    "mounted React renderer profile");
  assertSame(expectedRejectedPreservation, swap.expectedPreservedAfterRejectedSwap,
    "literal rejected-swap preservation contract");
  assertSame(expectedRejectedPreservation, swap.observedPreservedAfterRejectedSwap,
    "rejected-swap behavior labels");
  assertSame(expectedCompatiblePreservation, swap.compatible.expectedPreserved,
    "literal compatible-swap preservation contract");
  assertSame(expectedCompatiblePreservation, swap.compatible.observedPreserved,
    "compatible-swap behavior labels");

  const actualRequiredRendererCapabilities = browser.componentCapabilities.filter((capability) =>
    expectations.renderer.knownCapabilities.includes(capability));
  assert(actualRequiredRendererCapabilities.length > 0,
    "compiled lifecycle AppIR has no required renderer capability");
  assert(browser.initialAppIRUsedUnmodified === true,
    "active renderer candidate was not checked against the unmodified compiled AppIR");
  assert(swap.rejected.errorName === "TypeError", "incompatible renderer replacement did not throw TypeError");
  assert(actualRequiredRendererCapabilities.includes(swap.rejected.missingCapability),
    "active candidate's missing capability is not required by the compiled AppIR");
  const expectedActiveCandidateCapabilities = actualRequiredRendererCapabilities.filter((capability) =>
    capability !== swap.rejected.missingCapability);
  assertSame(expectedActiveCandidateCapabilities, swap.rejected.candidateCapabilities,
    "actual incompatible renderer candidate profile derived from compiled AppIR requirements");
  assert(swap.rejected.diagnostic?.phase === "admission" && swap.rejected.diagnostic.oldUnmounted === false &&
    swap.rejected.diagnostic.toGeneration === null, "rejected swap diagnostic does not show pre-unmount admission failure");
  assert(Object.values(swap.rejected.candidateCalls).every((count) => count === 0),
    "rejected renderer candidate methods ran");
  assertRawSwapPreservation("rejected", swap.rejected.before, swap.rejected.after, true);
  assertRawSwapPreservation("compatible", swap.compatible.before, swap.compatible.after, false);

  assert(swap.oldActiveClickAccepted === true, "old active physical click did not continue after rejected swap");
  assert(swap.oldActiveClick?.after.ticks === swap.oldActiveClick?.before.ticks + 1 &&
    swap.oldActiveClick.after.generation === swap.oldActiveClick.before.generation &&
    swap.oldActiveClick.before.generation === swap.rejected.after.diagnostics.currentGeneration,
  "old active click did not run on the retained renderer lease after rejected admission");
  assert(swap.compatible.oldRootDetached === true, "compatible swap did not commit and detach the old renderer root");
  assert(swap.oldCallbackFencedAfterCommit === true && swap.oldCallbackResult?.accepted === false &&
    swap.oldCallbackResult?.stale === true, "old renderer callback was not fenced after a real commit");
  assert(swap.oldCallbackFence?.beforeGeneration > swap.rejected.after.diagnostics.currentGeneration &&
    swap.oldCallbackFence.beforeGeneration === swap.oldCallbackFence.afterGeneration,
  "old callback fence was not observed on the committed renderer generation");
  assertSame(swap.oldCallbackFence.beforeTrace, swap.oldCallbackFence.afterTrace,
    "fenced old callback changed the committed trace");
  assert(swap.replyAccepted === true && swap.replyResult?.accepted === true,
    "pending request did not accept a reply after compatible swap");
  assert(swap.disabledClick?.targetDisabled === true && swap.disabledClick.beforeTicks === swap.disabledClick.afterTicks,
    "disabled request control dispatched or changed the Go trace");
  assertSame([
    "init",
    "click-add-parent",
    "click-request-parent",
    "disabled-request-click-suppressed",
    "reject-incompatible-renderer",
    "old-active-click-after-rejection",
    "compatible-renderer-commit",
    "fence-old-callback-after-commit",
    "deliver-pending-reply",
  ], swap.eventOrder, "capability swap event order");
  assertTrace(browser);

  return {
    schema: "gobi.compiled-capability-check/v1",
    status: "matched",
    fixture: lifecycle.check.fixture,
    lifecycle: {
      status: lifecycle.run.status,
      runPath: outputPaths.lifecycleRun,
      checkPath: outputPaths.lifecycleCheck,
    },
    admission: {
      expectedCaseIds,
      observedCaseIds,
      allRejectedBeforeInitOrRender: true,
      strictHost: {
        expectedCaseIds: ids(expectation.strictHostDeclarations),
        observedCaseIds: ids(actualHostDescriptors),
        rejectedWithoutInitOrRender: true,
        hostOptionAccessorConstructed: optionAccessor.optionAccessorConstructed,
        hostOptionGetterCalls: optionAccessor.optionGetterCalls,
      },
      strictRenderer: {
        expectedCaseIds: ids(expectation.strictRendererDeclarations),
        observedCaseIds: ids(actualRendererDescriptors),
        rejectedWithoutInitOrRender: true,
      },
    },
    swap: {
      rejected: {
        errorName: swap.rejected.errorName,
        diagnostic: swap.rejected.diagnostic,
        expectedPreserved: expectedRejectedPreservation,
        observedPreserved: swap.observedPreservedAfterRejectedSwap,
        rawPreservationVerified: true,
        actualRequiredRendererCapabilities,
        candidateCapabilities: swap.rejected.candidateCapabilities,
        missingCapability: swap.rejected.missingCapability,
      },
      oldActiveClickAccepted: swap.oldActiveClickAccepted,
      compatible: {
        expectedPreserved: expectedCompatiblePreservation,
        observedPreserved: swap.compatible.observedPreserved,
        rawPreservationVerified: true,
        oldRootDetached: swap.compatible.oldRootDetached,
      },
      oldCallbackFencedAfterCommit: swap.oldCallbackFencedAfterCommit,
      replyAccepted: swap.replyAccepted,
      disabledClickSuppressed: true,
      eventOrder: swap.eventOrder,
      traceTicks: swap.finalTrace.ticks.length,
    },
    lifecycleSummary: {
      events: lifecycle.check.events,
      ticks: lifecycle.check.ticks,
      clicks: lifecycle.check.clicks,
      requests: lifecycle.check.requests,
      cancellations: lifecycle.check.cancellations,
      cancellationOrder: lifecycle.check.cancellationOrder,
      browserProfiles: lifecycle.check.browserProfiles,
      mutationControlsDetected: lifecycle.check.mutationControlsDetected,
    },
    outputPaths,
  };
}

const CAPABILITY_MUTATIONS = [
  { id: "rejected-state", apply: (browser) => { browser.swap.rejected.after.snapshot.state = null; } },
  { id: "rejected-view", apply: (browser) => { browser.swap.rejected.after.snapshot.view = null; } },
  { id: "rejected-dom", apply: (browser) => { browser.swap.rejected.after.snapshot.dom = null; } },
  { id: "rejected-pending", apply: (browser) => { browser.swap.rejected.after.pending = null; } },
  { id: "compatible-state", apply: (browser) => { browser.swap.compatible.after.snapshot.state = null; } },
  { id: "compatible-view", apply: (browser) => { browser.swap.compatible.after.snapshot.view = null; } },
  { id: "compatible-dom", apply: (browser) => { browser.swap.compatible.after.snapshot.dom = null; } },
  { id: "compatible-pending", apply: (browser) => { browser.swap.compatible.after.pending = null; } },
  { id: "host-option-accessor-construction", apply: (browser) => {
    const row = browser.admissions.hostDescriptorCases.find((item) => item.id === "accessor-host-capabilities-property");
    row.optionAccessorConstructed = false;
  } },
];

export function checkCapabilityConformance(input) {
  const result = checkCore(input);
  const capabilityMutationControls = CAPABILITY_MUTATIONS.map(({ id, apply }) => {
    const mutatedBrowser = structuredClone(input.browser);
    apply(mutatedBrowser);
    let error = null;
    try {
      checkCore({ ...input, browser: mutatedBrowser });
    } catch (caught) {
      error = String(caught?.message ?? caught);
    }
    return { id, detected: error !== null, error: error ?? "checker accepted mutated raw capture" };
  });
  const capabilityMutationControlsDetected = capabilityMutationControls.filter((item) => item.detected).length;
  assert(capabilityMutationControlsDetected === CAPABILITY_MUTATIONS.length,
    `capability checker mutation controls detected ${capabilityMutationControlsDetected}/${CAPABILITY_MUTATIONS.length}`);
  return {
    ...result,
    capabilityMutationControlsDetected,
    capabilityMutationControls,
  };
}
