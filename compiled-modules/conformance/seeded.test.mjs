import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_SEEDS, SEEDED_EVENT_COUNT, generateSeededModuleScenario } from "./seeded.mjs";

 test("bounded module action seeds are reproducible and contain only physical actions", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261031, 20261032, 20261033]);
  for (const seed of DEFAULT_SEEDS) {
    const first = generateSeededModuleScenario(seed);
    const second = generateSeededModuleScenario(seed);
    assert.deepEqual(first, second);
    assert.equal(first.scenario.events.length, SEEDED_EVENT_COUNT);
    assert.equal(first.metadata.seed, seed);
    assert.equal(first.metadata.containsOnlyPhysicalActions, true);
    assert.deepEqual(new Set(first.scenario.events.map((event) => event.target)), new Set(["parent", "child"]));
    assert(first.scenario.events.some((event) => event.target === "parent" && event.action.path === "2"));
    assert(first.scenario.events.some((event) => event.target === "parent" && event.action.path === "3"));
    assert(first.scenario.events.some((event) => event.target === "parent" && event.action.path === "4"));
    assert(first.scenario.events.some((event) => event.target === "child" && event.action.path === "2/1"));
    assert(first.scenario.events.some((event) => event.target === "child" && event.action.path === "2/2"));
  }
});

test("module action generator rejects unbounded or invalid seed inputs", () => {
  assert.throws(() => generateSeededModuleScenario(-1), /uint32/);
  assert.throws(() => generateSeededModuleScenario(1, 23), /24 through 80/);
  assert.throws(() => generateSeededModuleScenario(1, 81), /24 through 80/);
});
