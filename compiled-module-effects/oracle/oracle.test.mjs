import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SEEDS,
  generateSeededEffectsScenario,
  literalEffectsScenario,
} from "../conformance/scenarios.mjs";
const oracle = await import("./oracle.mjs").catch(() => ({}));

function deriveExpectedReplay(scenario) {
  assert.equal(typeof oracle.deriveExpectedReplay, "function", "oracle must export deriveExpectedReplay");
  return oracle.deriveExpectedReplay(scenario);
}

function childAt(state, key) {
  return state.children.find((child) => child.key === key);
}

test("independent replay owns request IDs, cancellation, reply fencing, and keyed generations", () => {
  const scenario = literalEffectsScenario();
  const replay = deriveExpectedReplay(scenario);
  assert.equal(scenario.schema, "gobi.module-effects-scenario/v1");
  assert.equal(replay.events.length, scenario.events.length);
  assert.equal(replay.events[0].accepted, false, "Reset at zero must be disabled");
  assert.equal(childAt(replay.events[1].state, "a").effectState.Core.Counter.Count, 1);

  assert.deepEqual(replay.events[2].effects, [
    { kind: "fixture.request", name: "save", arg: "a:g1:r1", reply: "complete" },
  ]);
  assert.equal(childAt(replay.events[2].state, "a").effectState.Pending, true);
  assert.equal(childAt(replay.events[3].state, "b").effectState.Pending, true,
    "a sibling request must not replace or cancel a's request");
  assert.deepEqual(replay.events[4].effects, [
    { kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r1", reply: "" },
  ]);
  assert.equal(childAt(replay.events[4].state, "a").effectState.RequestID, 1,
    "cancel keeps the per-generation request sequence");
  assert.equal(childAt(replay.events[5].state, "a").effectState.Token, "a:g1:r2");
  assert.equal(replay.events[6].accepted, true);
  assert.equal(replay.events[7].accepted, false, "duplicate reply must be rejected");
  assert.equal(replay.events[8].accepted, false, "a canceled late reply must be rejected");
  assert.equal(childAt(replay.events[9].state, "a").effectState.Reply, "a:g1:r2");
  assert.equal(replay.events[12].accepted, true,
    "an active request reply remains valid across a renderer swap");
  assert.equal(childAt(replay.events[12].state, "a").effectState.Reply, "a:g1:r3");

  assert.deepEqual(replay.events[15].effects, [
    { kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r4", reply: "" },
  ]);
  assert.equal(replay.events[15].state.controllerState.a.mounted, false);
  assert.equal(childAt(replay.events[16].state, "a").effectState.Generation, 2);
  assert.equal(childAt(replay.events[16].state, "a").effectState.RequestID, 0);
  assert.equal(replay.events[17].effects[0].arg, "a:g2:r1");
  assert.equal(replay.events[18].accepted, false, "a retained old-generation reply cannot reach g2");
  assert.equal(replay.events[20].accepted, true);
  assert.equal(replay.events[21].accepted, false, "duplicate g2 reply must be rejected");
  assert.equal(childAt(replay.events[22].state, "b").effectState.Core.Counter.Count, 1,
    "b's counter stays independent of a's reset");
});

test("seeded replay accepts only the pinned seed set and exact generated event stream", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261104, 20261105, 20261106]);
  for (const seed of DEFAULT_SEEDS) {
    const { scenario: seeded } = generateSeededEffectsScenario(seed);
    const replay = deriveExpectedReplay(seeded);
    assert.equal(replay.events.length, seeded.events.length);
    assert.equal(replay.name, `module-effects-seed-${seed}`);
  }
});

test("oracle exposes fail-closed native, mounted parity, mutation, and build-admission entrypoints", () => {
  for (const name of [
    "assertNativeModuleEffectsCapture",
    "assertModuleEffectsParity",
    "runModuleEffectsMutationControls",
    "assertModuleEffectsBuildAdmission",
    "runModuleEffectsBuildAdmissionMutationControls",
    "assertModuleEffectsReplyLedgerLinks",
  ]) {
    assert.equal(typeof oracle[name], "function", `oracle must export ${name}`);
  }
  assert.throws(() => oracle.assertModuleEffectsBuildAdmission({}), /builds\.schema/);
});

function replyLedgerFixture() {
  const events = Array.from({ length: 9 }, (_, eventIndex) => ({
    eventIndex,
    hostEventIndex: [0, 2, 4, 6].includes(eventIndex) ? eventIndex : null,
    result: [0, 2, 4, 6].includes(eventIndex) ? { eventIndex } : null,
  }));
  const requestA = { dispatchId: "dispatch-a", effectIndex: 0 };
  const requestB = { dispatchId: "dispatch-b", effectIndex: 0 };
  return {
    capture: {
      events,
      orderedLedger: [
        { sequence: 0, kind: "request", token: "a:g1:r3", correlation: requestA, stateEventIndex: 2 },
        { sequence: 1, kind: "request", token: "a:g1:r1", correlation: requestB, stateEventIndex: 0 },
        { sequence: 2, kind: "go-cancel-effect", token: "a:g1:r1", stateEventIndex: 4 },
        { sequence: 3, kind: "reply", token: "a:g1:r3", correlation: requestA, stateEventIndex: 6,
          outcome: "accepted", goCall: true, message: { Name: "complete", Arg: "a:g1:r3" } },
        { sequence: 4, kind: "reply", token: "a:g1:r3", correlation: requestA, stateEventIndex: 2,
          outcome: "ignored-delivered", goCall: false },
        { sequence: 5, kind: "reply", token: "a:g1:r1", correlation: requestB, stateEventIndex: 4,
          outcome: "ignored-cancelled", goCall: false },
      ],
    },
    expected: {
      effects: [
        { eventIndex: 2, effect: { kind: "fixture.request", arg: "a:g1:r3" } },
        { eventIndex: 0, effect: { kind: "fixture.request", arg: "a:g1:r1" } },
        { eventIndex: 4, effect: { kind: "lifecycle.cancel", arg: "a:g1:r1" } },
      ],
      events: [
        { eventIndex: 6, kind: "transport-reply", token: "a:g1:r3", accepted: true, replyStatus: "accepted" },
        { eventIndex: 7, kind: "transport-reply", token: "a:g1:r3", accepted: false, replyStatus: "rejected-duplicate" },
        { eventIndex: 8, kind: "transport-reply", token: "a:g1:r1", accepted: false, replyStatus: "rejected-cancelled" },
      ],
    },
  };
}

test("reply ledger links require original correlations and the causal host state event", () => {
  const fixture = replyLedgerFixture();
  const assertLinks = (value = fixture) => oracle.assertModuleEffectsReplyLedgerLinks({
    capture: value.capture, expected: value.expected, profile: "unit.reply-ledger",
  });
  assertLinks();

  const missingAcceptedCorrelation = structuredClone(fixture);
  delete missingAcceptedCorrelation.capture.orderedLedger[3].correlation;
  assert.throws(() => assertLinks(missingAcceptedCorrelation), /correlation/);

  const wrongAcceptedStateEvent = structuredClone(fixture);
  wrongAcceptedStateEvent.capture.orderedLedger[3].stateEventIndex = 999;
  assert.throws(() => assertLinks(wrongAcceptedStateEvent), /stateEventIndex/);

  const wrongDuplicateStateEvent = structuredClone(fixture);
  wrongDuplicateStateEvent.capture.orderedLedger[4].stateEventIndex = 999;
  assert.throws(() => assertLinks(wrongDuplicateStateEvent), /stateEventIndex/);

  const missingDuplicateCorrelation = structuredClone(fixture);
  delete missingDuplicateCorrelation.capture.orderedLedger[4].correlation;
  assert.throws(() => assertLinks(missingDuplicateCorrelation), /correlation/);

  const missingCancelledCorrelation = structuredClone(fixture);
  delete missingCancelledCorrelation.capture.orderedLedger[5].correlation;
  assert.throws(() => assertLinks(missingCancelledCorrelation), /correlation/);

  const wrongCancelledStateEvent = structuredClone(fixture);
  wrongCancelledStateEvent.capture.orderedLedger[5].stateEventIndex = 999;
  assert.throws(() => assertLinks(wrongCancelledStateEvent), /stateEventIndex/);
});
