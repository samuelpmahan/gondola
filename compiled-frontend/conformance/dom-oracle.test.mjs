import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expectedDOMForState, expectedDOMSnapshots } from "./dom-oracle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "../fixtures");

async function fixture(name) {
  return JSON.parse(await readFile(join(fixturesDir, `${name}.json`), "utf8"));
}

test("hand-authored DOM oracle covers initialization and every app trace expectation", async () => {
  for (const name of ["counter", "form", "list", "effect"]) {
    const script = await fixture(name);
    const snapshots = expectedDOMSnapshots(script);
    assert.equal(snapshots.length, script.expectations.length + 1, `${name} tick snapshots`);
    assert.ok(snapshots.every((snapshot) => snapshot.normalization === "outerHTML-v1"));
    assert.ok(snapshots.every((snapshot) => Array.isArray(snapshot.controls)));
  }
});

test("literal form action affects independent state text while controls expose live input state", async () => {
  const script = await fixture("form");
  const literal = expectedDOMForState(script, script.expectations[2].state);
  assert.match(literal.html, /Literal: target\.value/);
  assert.match(literal.html, /value="typed draft"/);
  assert.equal(literal.controls.find((entry) => entry.path === "0").value, "typed draft");
  assert.equal(literal.controls.find((entry) => entry.path === "1").checked, true);
});

test("list DOM oracle tracks keyed row order, disabled move, and empty-reset state", async () => {
  const script = await fixture("list");
  const moved = expectedDOMForState(script, script.expectations[5].state);
  assert.ok(moved.html.indexOf('aria-label="Row 2"') < moved.html.indexOf('aria-label="Row 1"'));
  assert.equal(moved.controls.find((entry) => entry.path === "2/0/2").disabled, true);
  const empty = expectedDOMForState(script, script.expectations[9].state);
  assert.equal(empty.controls.find((entry) => entry.path === "1").disabled, true);
  assert.deepEqual(empty.controls.map((entry) => entry.path), ["0", "1"]);
});

test("effect DOM oracle exposes pending state and disables Request before completion", async () => {
  const script = await fixture("effect");
  const pending = expectedDOMForState(script, script.expectations[2].state);
  assert.match(pending.html, /Status: pending/);
  assert.equal(pending.controls.find((entry) => entry.path === "1").disabled, true);
  const completed = expectedDOMForState(script, script.expectations.at(-1).state);
  assert.match(completed.html, /Value: reply value/);
  assert.equal(completed.controls.find((entry) => entry.path === "1").disabled, false);
});
