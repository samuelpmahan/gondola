import assert from "node:assert/strict";
import test from "node:test";
import * as keyedScripts from "../keyed-editor/scripts.mjs";
import {
  BACKENDS,
  DEFAULT_SEEDS,
  fixedScripts,
  makeScripts,
  seededScripts,
} from "./scripts.mjs";

test("renderer schedules preserve the original keyed reference scenarios and add one bounded fixed script", () => {
  assert.deepEqual(BACKENDS, ["dom", "react", "godom"]);
  assert.deepEqual(fixedScripts.slice(0, keyedScripts.fixedScripts.length).map(({ name }) => name),
    keyedScripts.fixedScripts.map(({ name }) => name));
  assert.equal(fixedScripts.length, keyedScripts.fixedScripts.length + 1);
  assert.equal(fixedScripts.at(-1).name, "all-candidate-actors-cover-directed-backend-swaps");
  assert.deepEqual(DEFAULT_SEEDS, keyedScripts.DEFAULT_SEEDS);
});

test("fixed actor chains cover every directed renderer pair and focus survives all candidates", () => {
  const script = fixedScripts.at(-1);
  const swaps = script.actions;
  assert.ok(swaps.every(({ kind }) => kind === "swap"));
  const current = Object.fromEntries(BACKENDS.map((name) => [name, name]));
  const edges = new Set();
  for (const { host, backend } of swaps) {
    assert.ok(BACKENDS.includes(host));
    assert.ok(BACKENDS.includes(backend));
    assert.notEqual(current[host], backend, `${host} actor must change renderer`);
    edges.add(`${current[host]}->${backend}`);
    current[host] = backend;
  }
  assert.deepEqual([...edges].sort(), [
    "dom->godom", "dom->react", "godom->dom", "godom->react", "react->dom", "react->godom",
  ]);

  const focused = fixedScripts.find(({ name }) => name === "keyed-reorder-keeps-logical-focus-and-selection");
  assert.deepEqual(focused.actions.filter(({ kind }) => kind === "swap").map(({ backend }) => backend),
    ["react", "godom", "dom"]);
});

test("seeded schedules remain reproducible and keep the original action schema", () => {
  const one = makeScripts({ seeds: [7, 8], cases: 3, maxActions: 22 });
  assert.deepEqual(one, makeScripts({ seeds: [7, 8], cases: 3, maxActions: 22 }));
  assert.equal(one.length, fixedScripts.length + 6);
  assert.deepEqual(makeScripts(), [
    ...fixedScripts,
    ...seededScripts(DEFAULT_SEEDS[0]),
    ...seededScripts(DEFAULT_SEEDS[1]),
  ]);
  for (const script of one) {
    assert.ok(script.actions.length > 0 && script.actions.length <= 40);
    for (const action of script.actions) {
      if (action.kind === "swap") {
        assert.ok(BACKENDS.includes(action.host));
        assert.ok(BACKENDS.includes(action.backend));
      }
    }
  }
});

test("godom coverage never pushes a generated script past its caller's action cap", () => {
  for (let maxActions = 1; maxActions <= 40; maxActions += 1) {
    for (const script of seededScripts(9, { cases: 3, maxActions })) {
      assert.ok(script.actions.length <= maxActions,
        `${script.name} exceeds maxActions=${maxActions}`);
    }
  }
});
