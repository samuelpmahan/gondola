import test from "node:test";
import assert from "node:assert/strict";
import { expectedProbeNames, runAdversarial, validateProbeSet } from "./adversarial.mjs";

const expectedNames = [
  "cancelled-reply-go-id-guard",
  "out-of-order-replies-go-id-guard",
  "duplicate-reply-go-id-guard",
  "error-preserves-saved-then-retry",
  "reset-does-not-reuse-go-id",
  "backend-swap-preserves-pending-request",
  "unmount-late-callback-makes-zero-go-calls",
  "cross-session-id-collision-is-fenced",
  "synthetic-start-transport-error-is-reported",
  "synthetic-cancel-transport-error-is-reported",
  "synthetic-stale-facade-dispatch-is-fenced",
];

function passingProbes(names = expectedProbeNames) {
  return names.map((name) => ({
    name,
    pass: true,
    kind: name.startsWith("synthetic-") ? "synthetic" : "real-go",
    observations: {},
  }));
}

test("the browser adversarial probe contract is a frozen, exact inventory", () => {
  assert.ok(Object.isFrozen(expectedProbeNames), "expectedProbeNames must be frozen");
  assert.deepEqual(expectedProbeNames, expectedNames);
  assert.equal(new Set(expectedProbeNames).size, expectedProbeNames.length);
});

test("probe validation accepts every required case exactly once", () => {
  assert.deepEqual(validateProbeSet(passingProbes()), {
    ok: true,
    expected: expectedNames,
    failures: [],
  });
});

test("probe validation rejects a missing required case", () => {
  const probes = passingProbes().filter(({ name }) => name !== "duplicate-reply-go-id-guard");
  assert.throws(() => validateProbeSet(probes), /missing required adversarial probes: duplicate-reply-go-id-guard/);
});

test("probe validation rejects duplicate and unknown case names", () => {
  const probes = passingProbes();
  probes.push({ ...probes[0] });
  probes.push({ name: "unregistered-probe", pass: true, kind: "synthetic", observations: {} });
  assert.throws(() => validateProbeSet(probes), /duplicate.*cancelled-reply-go-id-guard.*unregistered.*unregistered-probe/i);
});

test("synthetic transport and facade probes must be labeled synthetic", () => {
  const probes = passingProbes();
  const index = probes.findIndex(({ name }) => name === "synthetic-cancel-transport-error-is-reported");
  probes[index] = { ...probes[index], kind: "real-go" };
  assert.throws(() => validateProbeSet(probes), /mislabelled.*synthetic-cancel-transport-error-is-reported/i);
});

test("probe validation preserves case-specific failures in its result", () => {
  const probes = passingProbes();
  probes[1] = { ...probes[1], pass: false, observations: { error: "late reply was accepted" } };
  const result = validateProbeSet(probes);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{
    name: "out-of-order-replies-go-id-guard",
    kind: "real-go",
    observations: { error: "late reply was accepted" },
  }]);
});

test("runAdversarial requires a Playwright-compatible page", async () => {
  await assert.rejects(
    runAdversarial({ evaluate() {}, locator() {}, keyboard: {} }),
    /Playwright-compatible page/,
  );
});
