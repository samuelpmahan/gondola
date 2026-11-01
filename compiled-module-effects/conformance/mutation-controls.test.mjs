import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_BUILD_MUTATION_IDS,
  REQUIRED_CAPTURE_MUTATION_IDS,
  validateBuildMutationReport,
  validateCaptureMutationReport,
} from "./mutation-controls.mjs";

function report(ids = REQUIRED_CAPTURE_MUTATION_IDS) {
  const rejected = ids.map((name, index) => ({ name, rejected: true, path: `profile-${index}.orderedLedger` }));
  return { status: "detected", total: rejected.length, rejected };
}

test("validates the required capture controls and derives IDs and total from the array", () => {
  const result = validateCaptureMutationReport(report(), { allowAdditionalControls: true });
  assert.equal(result.total, result.rejected.length);
  assert.deepEqual(result.requiredControlIds, REQUIRED_CAPTURE_MUTATION_IDS);
  assert.equal(result.allowAdditionalControls, true);
  assert.deepEqual(result.rejected.map((item) => item.id), REQUIRED_CAPTURE_MUTATION_IDS);
});

test("rejects an empty control array", () => {
  assert.throws(() => validateCaptureMutationReport({ status: "detected", total: 0, rejected: [] }), /nonempty array/);
});

test("rejects a report missing any required control ID", () => {
  const controls = REQUIRED_CAPTURE_MUTATION_IDS.slice(1);
  assert.throws(() => validateCaptureMutationReport(report(controls), { allowAdditionalControls: true }), /missing required controls/);
});

test("rejects duplicate control IDs", () => {
  const controls = [...REQUIRED_CAPTURE_MUTATION_IDS];
  controls[1] = controls[0];
  assert.throws(() => validateCaptureMutationReport(report(controls), { allowAdditionalControls: true }), /duplicate control id/);
});

test("rejects a control that was not detected", () => {
  const value = report();
  value.rejected[3].rejected = false;
  assert.throws(() => validateCaptureMutationReport(value, { allowAdditionalControls: true }), /was not rejected/);
});

test("rejects a declared total that differs from the array length", () => {
  const value = report();
  value.total += 1;
  assert.throws(() => validateCaptureMutationReport(value, { allowAdditionalControls: true }), /total must equal rejected.length/);
});

test("accepts a well-formed extra control only when the policy explicitly permits it", () => {
  const value = report([...REQUIRED_CAPTURE_MUTATION_IDS, "future-reviewed-control"]);
  assert.throws(() => validateCaptureMutationReport(value), /without explicit policy/);
  const accepted = validateCaptureMutationReport(value, { allowAdditionalControls: true });
  assert.equal(accepted.total, REQUIRED_CAPTURE_MUTATION_IDS.length + 1);
  assert.equal(accepted.rejected.at(-1).id, "future-reviewed-control");
});

test("requires an explicit boolean additional-control policy", () => {
  assert.throws(() => validateCaptureMutationReport(report(), { allowAdditionalControls: "yes" }), /allowAdditionalControls must be boolean/);
});

test("rejects a report with an unsuccessful status", () => {
  const value = report();
  value.status = "incomplete";
  assert.throws(() => validateCaptureMutationReport(value, { allowAdditionalControls: true }), /status must be detected/);
});

test("normalizes the build-admission controls against their required IDs", () => {
  const value = report(REQUIRED_BUILD_MUTATION_IDS);
  const result = validateBuildMutationReport(value);
  assert.equal(result.total, result.rejected.length);
  assert.equal(result.allowAdditionalControls, false);
  assert.deepEqual(result.requiredControlIds, REQUIRED_BUILD_MUTATION_IDS);
});

test("rejects unapproved build-admission extras", () => {
  const value = report([...REQUIRED_BUILD_MUTATION_IDS, "unapproved-build-control"]);
  assert.throws(() => validateBuildMutationReport(value), /without explicit policy/);
});
