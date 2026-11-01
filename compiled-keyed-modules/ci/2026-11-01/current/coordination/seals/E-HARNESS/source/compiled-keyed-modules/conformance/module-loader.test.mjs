import assert from "node:assert/strict";
import test from "node:test";

import { validateKeyedHelperDescriptor } from "./module-loader.mjs";

const contract = {
  schema: "gobi.keyed-module-helpers/v1",
  backend: "react",
  packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent",
  componentId: "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent",
  appIR: { path: "react-parent/apps/parent/app-ir.json", bytes: 10, sha256: "a".repeat(64) },
  moduleABI: { path: "react-parent/apps/parent/module-abi.json", bytes: 11, sha256: "b".repeat(64), abiSHA256: "c".repeat(64) },
  helperArtifact: { path: "adapters/react-parent/gobi-keyed-helpers.mjs", bytes: 12, sha256: "d".repeat(64) },
  sourceIdentity: {
    fixtureSource: { path: "fixtures/compiled/keyedmoduleparent/app.go", bytes: 13, sha256: "e".repeat(64) },
    emittedGoScriptSources: [
      { path: "react-parent/emitted-ts/keyed/index.ts", bytes: 14, sha256: "f".repeat(64) },
      { path: "react-parent/emitted-ts/keyed/app.gs.ts", bytes: 15, sha256: "0".repeat(64) },
    ],
  },
  exportName: "gobiKeyedModuleHelpers",
  members: ["children", "receiveKeyed", "isCurrent"],
  symbols: [
    { name: "Children", symbol: "keyedmoduleparent.Children", signature: { params: ["keyedmoduleparent.State"], results: ["[]keyedmodulewire.ChildRef"] } },
    { name: "ReceiveKeyed", symbol: "keyedmoduleparent.ReceiveKeyed", signature: { params: ["keyedmoduleparent.State", "string", "int", "modulewire.Publication"], results: ["keyedmoduleparent.State"] } },
    { name: "IsCurrent", symbol: "keyedmoduleparent.IsCurrent", signature: { params: ["keyedmoduleparent.State", "string", "int"], results: ["bool"] } },
  ],
  childProjection: "children(state) copies the GoScript slice window into a frozen native array of {key,generation} rows",
  stateSemantics: {
    helperFunctions: ["Children", "ReceiveKeyed", "IsCurrent"],
    pureStateHelpers: true,
    usesSharedGlobalState: false,
    receiveKeyedClonesPrimaryGoScriptState: true,
    analyzerReachability: "Children is reachable through View; ReceiveKeyed and IsCurrent are exported GoScript functions but are not AppIR-reachability-admitted by the unchanged shared analyzer",
  },
};

function cloned() { return structuredClone(contract); }

test("keyed helper descriptor must match every source identity pin", () => {
  assert.equal(validateKeyedHelperDescriptor(cloned(), contract), true);
  const mutations = [
    (value) => { value.backend = "dom"; },
    (value) => { value.packagePath = "other/package"; },
    (value) => { value.componentId = "other/component"; },
    (value) => { value.appIR.sha256 = "9".repeat(64); },
    (value) => { value.moduleABI.abiSHA256 = "8".repeat(64); },
    (value) => { value.helperArtifact.sha256 = "7".repeat(64); },
    (value) => { value.sourceIdentity.fixtureSource.sha256 = "6".repeat(64); },
    (value) => { value.sourceIdentity.emittedGoScriptSources[1].path = "wrong.ts"; },
    (value) => { value.symbols[1].signature.results[0] = "wrong.State"; },
  ];
  for (const mutate of mutations) {
    const damaged = cloned();
    mutate(damaged);
    assert.throws(() => validateKeyedHelperDescriptor(damaged, contract), /identity|pin|source|symbol/i);
  }
});
