import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SEEDS, generateSeededChildrenScenario } from "./seeded.mjs";

const expectedCoverage = [
  "physical-keyed-child-counter-click",
  "growth-beyond-initial-slice-capacity",
  "empty-collection-clear",
  "malformed-key-and-swap-no-ops",
  "unknown-remove-request-counter-no-ops",
  "duplicate-add-and-request-no-ops",
  "alternating-add-remove-reuse",
  "pending-reorder",
  "stale-generation-reducer-completion",
  "child-first-clear-cancellation",
  "parent-remove-and-remount-generation",
];

function message(event, name, arg) {
  return event?.kind === "go-message"
    && event.message?.name === name
    && (arg === undefined || event.message.arg === arg);
}

test("default seeded child schedules are deterministic, varied, and bounded inputs", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261031, 20261032, 20261033]);
  assert.ok(Object.isFrozen(DEFAULT_SEEDS), "the shared default seed list should not be mutable");

  const runs = DEFAULT_SEEDS.map((seed) => {
    const first = generateSeededChildrenScenario(seed);
    const second = generateSeededChildrenScenario(seed);
    assert.deepEqual(second, first, `seed ${seed} must reproduce the same input schedule`);

    const { scenario, metadata } = first;
    assert.equal(scenario.schema, "gobi.compiled-children-scenario/v1");
    assert.equal(scenario.name, `seeded-keyed-children-${seed}`);
    assert.equal(scenario.packagePath, "github.com/samuelpmahan/gondola/fixtures/compiled/children");
    assert.equal(scenario.componentID, scenario.packagePath);
    assert.equal(metadata.seed, seed);
    assert.equal(metadata.eventCount, scenario.events.length);
    assert.ok(scenario.events.length <= 64, "generated input must remain small and bounded");
    assert.equal(metadata.bounds.events, scenario.events.length);
    assert.equal(metadata.bounds.maximumChildren, 6);
    assert.deepEqual(metadata.coverage, expectedCoverage);
    assert.ok(scenario.events.every((event) => ["click", "go-message", "effect-reply", "renderer-swap"].includes(event.kind)));
    assert.ok(scenario.events.every((event) => event.kind !== "go-message"
      || (typeof event.message?.name === "string" && typeof event.message?.arg === "string")));

    const events = scenario.events;
    const physicalStartIndex = metadata.physicalStartKey === "oak" ? 0 : 1;
    assert.deepEqual(events[0], {
      kind: "click",
      path: `1/${physicalStartIndex}/1`,
      event: "click",
      message: { name: "counter.add", arg: metadata.physicalStartKey },
    });
    assert.ok(["oak", "elm"].includes(metadata.physicalStartKey));
    assert.deepEqual(events.slice(1, 8).map((event) => event.message), [
      { name: "children.clear", arg: "" },
      { name: "child.add", arg: "BadKey" },
      { name: "child.remove", arg: "missing" },
      { name: "child.request", arg: "missing" },
      { name: "counter.add", arg: "missing" },
      { name: "children.swap", arg: `${metadata.keyOrder[0]}:${metadata.keyOrder[0]}` },
      { name: "children.swap", arg: "malformed" },
    ]);

    const keySet = new Set(metadata.keyOrder);
    assert.equal(metadata.keyOrder.length, 6);
    assert.equal(keySet.size, metadata.keyOrder.length);
    assert.deepEqual([...keySet].sort(), ["k0", "k1", "k2", "k3", "k4", "k5"]);
    assert.deepEqual(events.slice(8, 14).map((event) => event.message.arg), metadata.keyOrder);
    assert.deepEqual(events.slice(15, 21).map((event) => event.message.arg), metadata.counterOrder);
    assert.deepEqual(events.slice(21, 27).map((event) => event.message.arg), metadata.keyOrder);
    assert.deepEqual(events.slice(14, 15).map((event) => event.message.arg), [metadata.keyOrder[0]]);
    assert.ok(message(events[27], "child.request", metadata.keyOrder[0]), "duplicate request should be present");

    const reorderIndex = events.findIndex((event) => message(event, "children.swap", metadata.pendingSwapPair.join(":")));
    assert.ok(reorderIndex > 26, "reorder should happen after each child has a pending request");
    assert.deepEqual(events[reorderIndex + 1], { kind: "renderer-swap", from: "dom", to: "react", target: "root", expect: "accepted" });

    const reusedKey = metadata.reusedKey;
    const oldToken = metadata.oldToken;
    const newToken = metadata.newToken;
    const removeIndex = events.findIndex((event) => message(event, "child.remove", reusedKey));
    const readdIndex = events.findIndex((event, index) => index > removeIndex && message(event, "child.add", reusedKey));
    const staleIndex = events.findIndex((event) => message(event, "complete", oldToken));
    const newReplyIndex = events.findIndex((event) => event.kind === "effect-reply" && event.token === newToken);
    assert.ok(removeIndex < readdIndex && readdIndex < staleIndex && staleIndex < newReplyIndex);
    assert.notEqual(oldToken, newToken, "reusing a key must schedule a distinct generation token");

    const clearIndex = events.findIndex((event, index) => index > newReplyIndex && message(event, "children.clear"));
    assert.ok(clearIndex > newReplyIndex);
    assert.ok(events.slice(newReplyIndex + 1, clearIndex).some((event) => event.kind === "effect-reply"),
      "clear should follow both a current reply and still-pending work");

    const parentRemoveIndex = events.findIndex((event) => message(event, "parent.remove"));
    const parentRemountIndex = events.findIndex((event) => message(event, "parent.remount"));
    assert.ok(parentRemoveIndex > clearIndex && parentRemountIndex > parentRemoveIndex);
    assert.ok(events.slice(parentRemoveIndex + 1, parentRemountIndex).some((event) => message(event, "complete")),
      "removed parent and child tokens should receive stale completion probes before remount");
    return first;
  });

  const keyOrders = new Set(runs.map(({ metadata }) => metadata.keyOrder.join(",")));
  assert.equal(keyOrders.size, DEFAULT_SEEDS.length, "default seeds should exercise distinct key orders");
});

test("seed generator accepts uint32 boundary values", () => {
  for (const seed of [0, 0xffff_ffff]) {
    const { scenario, metadata } = generateSeededChildrenScenario(seed);
    assert.equal(metadata.seed, seed);
    assert.equal(scenario.name, `seeded-keyed-children-${seed}`);
    assert.ok(scenario.events.length <= 64);
  }
});

test("seed generator rejects values outside the uint32 safe-integer domain", () => {
  for (const seed of [-1, 0x1_0000_0000, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "20261031", null, 1n, Symbol("seed")]) {
    assert.throws(() => generateSeededChildrenScenario(seed), TypeError, `seed ${String(seed)} should be rejected`);
  }
});
