# E-ADMISSION — native directory admission

## Result

Implemented `effectqualification.VerifyDirectory(root string) (Report, error)` and the supporting source, build, artifact, ABI, and input-inventory checks. The report records the independently hashed input files, verified source identity consistency, capture counts, four build records, two ABI pairs, and explicit limits on provenance claims.

Source admission accepts a clean, internally consistent lowercase 40-character commit identifier rather than requiring the PR23 fixture's original head. It recomputes every source pin against actual `source/` bytes, requires the source tree inventory to match the pin map, preserves pins for `EXPECTED.json` and `SHA256SUMS`, and requires the key module/effect Go fixtures, compiler contract, native runner, and compiler source closure. It does not infer Git authentication from producer booleans.

Build admission verifies exactly the React and DOM parent/child records, independently hashes each listed output and the complete output tree, checks the build source-pin import closure against archived source bytes, derives each module ABI from AppIR and exact generated artifacts, checks exact capabilities, and validates both backend pairs. Producer success booleans are not used as proof.

The public directory check passed on the real PR23 bundle. The complete `effectqualification` suite, including N5 positive and adversarial controls, passed.

## Verification

All command output is in `rawlogs/E-ADMISSION/`.

- Admission unit checks: `go-test-admission-unit-final.log` — passed.
- PR23 public API positive control: `go-test-pr23-positive-final.log` — passed.
- Full package suite: `go-test-package-final.log` — passed.

## Limits

The verifier hashes and checks producer manifests, but does not execute or authenticate the compiler toolchain. The source commit is a canonical, internally consistent identifier; Git history and verifier-build provenance are not authenticated. The verifier does not launch a browser. Producer mutation-control booleans are not represented as Go-executed negative-control proof. Effects archive validation is being implemented by N6 because the existing `modulequalification.VerifyArchive` expects the older compiled-modules snapshot schema.
