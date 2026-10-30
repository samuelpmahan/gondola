import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { assertStableProvenance, captureConformanceProvenance } from "./provenance.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("provenance binds source, fixture, compiled input and encoder input hashes", async () => {
  const input = {
    compiledPath: resolve(repository, "compiled-frontend/conformance/compare.mjs"),
    helpersPath: resolve(repository, "compiled-frontend/conformance/trace.mjs"),
    fixturePath: resolve(repository, "compiled-frontend/fixtures/counter.json"),
    command: ["node", "direct-js.mjs", "--fixture", "counter.json"],
  };
  const first = await captureConformanceProvenance(input);
  const second = await captureConformanceProvenance(input);
  assert.equal(assertStableProvenance(first, second), true);
  assert.ok(first.inputs.some((entry) => entry.path === "compiled-frontend/CONTRACT.md"));
  assert.ok(first.inputs.some((entry) => entry.path === "compiled-frontend/conformance/compare.mjs"));
  assert.ok(first.inputs.some((entry) => entry.path === "compiled-frontend/fixtures/counter.json"));
  assert.ok(first.inputs.some((entry) => entry.path === "counter/counter.go"));
  assert.ok(first.inputs.some((entry) => entry.path === "reactmap/reactmap.go"));
  assert.ok(first.inputs.some((entry) => entry.path === "go.mod"));
  assert.ok(first.inputs.some((entry) => entry.path === "package-lock.json"));
  assert.ok(first.inputs.some((entry) => entry.path === "interaction/package-lock.json"));
  assert.ok(first.inputs.some((entry) => entry.path === "compiled-frontend/frontend/react/react-map.gen.mjs"));
  assert.ok(!first.inputs.some((entry) => entry.path.startsWith("compiled-frontend/conformance/raw/")));

  const growth = await captureConformanceProvenance({
    ...input,
    fixturePath: resolve(repository, "compiled-frontend/conformance/fixtures/list-growth.json"),
  });
  assert.ok(growth.inputs.some((entry) => entry.path === "compiled-frontend/conformance/fixtures/list-growth.json"));
});

test("provenance stability rejects changed pins", async () => {
  const first = { inputs: [{ path: "input.mjs", sha256: "a" }] };
  const second = { inputs: [{ path: "input.mjs", sha256: "b" }] };
  assert.throws(() => assertStableProvenance(first, second), /changed during execution/);
});
