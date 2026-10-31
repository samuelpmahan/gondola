import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_SEEDS, generateSeededPublicationsScenario } from "./seeded.mjs";

function messages(scenario) {
  return scenario.events.flatMap((event) => {
    if (event.kind === "click" || event.kind === "go-message") return [event.message];
    if (event.kind === "effect-reply") return [{ name: "complete", arg: event.token }];
    return [];
  });
}

test("publication seed transcripts are deterministic and bounded", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261031, 20261032, 20261033]);
  const eventCounts = [];
  for (const seed of DEFAULT_SEEDS) {
    const first = generateSeededPublicationsScenario(seed);
    const second = generateSeededPublicationsScenario(seed);
    assert.deepEqual(first, second);
    assert.equal(first.scenario.schema, "gobi.compiled-publications-scenario/v1");
    assert.equal(first.scenario.events.length, first.metadata.eventCount);
    assert.ok(first.scenario.events.length <= 100);
    assert.equal(first.metadata.mountedBrowser, seed === DEFAULT_SEEDS[0]);
    assert.equal(first.metadata.liveKeyBound, 8);
    assert.equal(first.metadata.addOrder.length, 6);
    assert.equal(new Set(first.metadata.addOrder).size, 6);
    eventCounts.push(first.scenario.events.length);
  }
  assert.equal(new Set(eventCounts).size, 1, "each seed must exercise the same bounded operation count");
});

test("seed transcripts include bounded input, queue, lifecycle, and swap cases", () => {
  for (const seed of DEFAULT_SEEDS) {
    const { scenario, metadata } = generateSeededPublicationsScenario(seed);
    const ops = messages(scenario);
    const has = (name, arg) => ops.some((item) => item.name === name && (arg === undefined || item.arg === arg));
    assert.ok(scenario.events.some((event) => event.kind === "click"));
    assert.ok(scenario.events.some((event) => event.kind === "renderer-swap"));
    assert.ok(has("input.step"));
    assert.ok(has("input.toggleLock"));
    assert.ok(has("child.capture"));
    assert.ok(has("publication.deliver", "01"));
    assert.ok(has("children.swap", "oak:elm"));
    assert.ok(has("child.remove", "k0"));
    assert.ok(has("child.add", "k0"));
    assert.ok(has("parent.remove"));
    assert.ok(has("parent.remount"));
    assert.ok(has("complete", metadata.oldGenerationToken));
    assert.ok(metadata.coverage.includes("parent-removal-remount-with-retained-publication-queue"));
  }
});

test("seed generator rejects non-uint32 seeds", () => {
  for (const seed of [-1, 0x1_0000_0000, 1.5, Number.NaN]) {
    assert.throws(() => generateSeededPublicationsScenario(seed), /uint32/);
  }
});
