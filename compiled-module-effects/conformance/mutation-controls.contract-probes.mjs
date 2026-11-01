import { REQUIRED_CAPTURE_MUTATION_IDS, validateCaptureMutationReport } from "./mutation-controls.mjs";

function makeReport(ids = REQUIRED_CAPTURE_MUTATION_IDS) {
  const rejected = ids.map((name, index) => ({ name, rejected: true, path: `profile-${index}.orderedLedger` }));
  return { status: "detected", total: rejected.length, rejected };
}

const cases = [];
function expectReject(name, mutate, match, { allowAdditionalControls = true } = {}) {
  const candidate = mutate(makeReport());
  try {
    validateCaptureMutationReport(candidate, { allowAdditionalControls });
    cases.push({ name, expected: "reject", passed: false, outcome: "accepted" });
  } catch (error) {
    cases.push({ name, expected: "reject", passed: match.test(error.message), outcome: "rejected", error: error.message });
  }
}

expectReject("zero-controls", (value) => ({ ...value, total: 0, rejected: [] }), /nonempty array/);
expectReject("missing-required-id", (value) => {
  value.rejected.pop();
  value.total = value.rejected.length;
  return value;
}, /missing required controls/);
expectReject("duplicate-id", (value) => {
  value.rejected[1].name = value.rejected[0].name;
  return value;
}, /duplicate control id/);
expectReject("undetected-control", (value) => {
  value.rejected[0].rejected = false;
  return value;
}, /was not rejected/);
expectReject("count-mismatch", (value) => {
  value.total += 1;
  return value;
}, /total must equal rejected.length/);
expectReject("extra-without-explicit-policy", (value) => {
  value.rejected.push({ name: "extra-reviewed-control", rejected: true, path: "profile.extra" });
  value.total = value.rejected.length;
  return value;
}, /without explicit policy/, { allowAdditionalControls: false });
expectReject("id-name-disagreement", (value) => {
  value.rejected[0].id = "different-control-id";
  return value;
}, /id must match name/);
expectReject("non-boolean-extra-policy", (value) => value, /allowAdditionalControls must be boolean/,
  { allowAdditionalControls: "enabled" });

const extra = makeReport([...REQUIRED_CAPTURE_MUTATION_IDS, "extra-reviewed-control"]);
try {
  const normalized = validateCaptureMutationReport(extra, { allowAdditionalControls: true });
  cases.push({ name: "extra-with-explicit-policy", expected: "accept", passed: true, outcome: "accepted",
    total: normalized.total, arrayLength: normalized.rejected.length,
    requiredIdsPresent: REQUIRED_CAPTURE_MUTATION_IDS.every((id) => normalized.rejected.some((row) => row.id === id)) });
} catch (error) {
  cases.push({ name: "extra-with-explicit-policy", expected: "accept", passed: false, outcome: "rejected", error: error.message });
}

const output = { schema: "gobi.module-effects-mutation-contract-probes/v1", status: cases.every((item) => item.passed) ? "passed" : "failed",
  cases, passed: cases.filter((item) => item.passed).length, total: cases.length };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (output.status !== "passed") process.exitCode = 1;
