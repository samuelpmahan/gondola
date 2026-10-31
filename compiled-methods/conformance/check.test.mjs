import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertMethodsMethodContract, runMethodsMutationControls } from "./check.mjs";
import { expectedMethodsDOM } from "../browser/dom-oracle.mjs";
import { encodeFixtureState } from "../../compiled-frontend/conformance/fixture-expectations.mjs";
import { probeValueReceiverSemantics } from "./value-semantics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJSON = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

function appIRFromContract(contract) {
  return {
    schema: "gobi.app-ir/v1",
    packagePath: contract.packagePath,
    components: [{
      id: contract.packagePath,
      packagePath: contract.packagePath,
      stateType: contract.stateType,
      messageType: contract.messageType,
      init: contract.roles.init,
      update: contract.roles.update,
      view: contract.roles.view,
    }],
    symbols: contract.symbols.map((symbol) => ({
      id: symbol.id,
      signature: { params: symbol.params, results: symbol.results },
      calls: [...symbol.calls],
    })),
    types: [
      { id: contract.stateType, kind: "struct", fields: Object.entries(contract.stateFields).map(([name, type]) => ({ name, type })) },
      { id: contract.counterStateType, kind: "struct", fields: [{ name: "Count", type: "float64" }] },
      { id: contract.messageType, kind: "struct", fields: [{ name: "Name", type: "string" }, { name: "Arg", type: "string" }] },
      { id: "bool", kind: "bool" },
      { id: "float64", kind: "float64" },
    ],
  };
}

function traceState(parentCount) {
  return { fields: [{
    name: "Parent",
    value: { fields: [{ name: "Count", value: { float64Bits: parentCount } }] },
  }] };
}

test("method contract checker accepts the frozen typed call graph", async () => {
  const contract = await readJSON("compiled-methods/conformance/method-contract.json");
  assert.equal(assertMethodsMethodContract(appIRFromContract(contract), contract), true);
});

test("explicit mutation controls reject state, callee, message, and DOM changes", async () => {
  const [contract, fixture] = await Promise.all([
    readJSON("compiled-methods/conformance/method-contract.json"),
    readJSON("compiled-methods/conformance/fixtures/methods.json"),
  ]);
  const appIR = appIRFromContract(contract);
  const nativeTrace = {
    schema: "gobi.trace/v1",
    appId: contract.packagePath,
    ticks: fixture.expectations.map((entry, index) => ({
      index: index + 1,
      action: fixture.actions[entry.actionIndex],
      message: entry.message,
      dispatchId: entry.dispatchId,
      state: traceState("3ff0000000000000"),
      requestedEffects: [],
      completedEffects: [],
    })),
  };
  nativeTrace.ticks[4].state = traceState("4000000000000000");
  nativeTrace.ticks[5].state = traceState("4000000000000000");
  const mutationControls = runMethodsMutationControls({
    appIR,
    contract,
    nativeTrace,
    fixture,
    expectedDOM: expectedMethodsDOM({ parent: 0, child: 0, readOnly: false, savedChild: 0 }),
  });
  assert.equal(mutationControls.detected, 4);
  assert.deepEqual(mutationControls.outcomes.map((item) => item.name), [
    "wrong-method-state",
    "wrong-callee-provenance",
    "wrong-message-value",
    "wrong-dom",
  ]);
  assert.ok(mutationControls.outcomes.every((item) => item.rejected && item.reason.length > 0));
  const messageOutcome = mutationControls.outcomes.find((item) => item.name === "wrong-message-value");
  assert.match(messageOutcome.reason,
    /\$\.mutation\.message\.ticks\[1\]\.message\.name: value differs; expected "childAdd", got "parentAdd"/);
  assert.doesNotMatch(messageOutcome.reason, /object field set differs/);
});

test("method graph checker rejects a receiver method with the wrong callee", async () => {
  const contract = await readJSON("compiled-methods/conformance/method-contract.json");
  const appIR = appIRFromContract(contract);
  appIR.symbols.find((symbol) => symbol.id.endsWith(".State.PublishSaved")).calls = [contract.counterUpdateId];
  assert.throws(() => assertMethodsMethodContract(appIR, contract), /calls/);
});

test("retained-state probe detects nested Parent.Count mutation on PublishSaved", async () => {
  const [contract, fixture] = await Promise.all([
    readJSON("compiled-methods/conformance/method-contract.json"),
    readJSON("compiled-methods/conformance/fixtures/methods.json"),
  ]);
  const appIR = appIRFromContract(contract);
  const initID = contract.roles.init;
  const updateID = contract.roles.update;
  const initial = () => ({ Parent: { Count: 0 }, Child: { Count: 0 }, ReadOnly: false, SavedChild: 0 });
  const update = (state, message) => {
    const next = structuredClone(state);
    switch (message.Name) {
      case "parentAdd": next.Parent.Count += 1; break;
      case "parentReset": next.Parent.Count = 0; break;
      case "childAdd": if (!next.ReadOnly) next.Child.Count += 1; break;
      case "childReset": if (!next.ReadOnly) next.Child.Count = 0; break;
      case "toggleReadOnly": next.ReadOnly = !next.ReadOnly; break;
      case "captureChild": next.SavedChild = next.Child.Count; break;
      case "publishSaved":
        // Model a shallow-copy regression: the nested input Parent is changed too.
        state.Parent.Count = next.SavedChild;
        next.Parent.Count = next.SavedChild;
        break;
      default: throw new Error(`unexpected method probe message ${message.Name}`);
    }
    return [next, []];
  };
  const compiled = {
    appIR,
    symbols: { [initID]: initial, [updateID]: update },
  };
  const helpers = { gobiEncodeState: (state, typeId) => encodeFixtureState(state, typeId, appIR.types) };
  const result = probeValueReceiverSemantics({ compiled, helpers, fixture });
  assert.equal(result.passed, false);
  assert.deepEqual(result.failures.filter((check) => check.actionIndex !== null).map((check) => check.actionIndex), [4, 13]);
  assert.ok(result.snapshotActions.every((witness) => !witness.originalStateUnchanged));
});
