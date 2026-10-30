# XR-A-PRESERVE

**Decision: accepted as a limited preservation audit.** The stated baseline, pins, root module files, and inherited typed-composition result match the retained artifacts. The run is historical evidence only: N1 did not rerun the full suite, and its report correctly says it predates the `compilercontract` codec repair.

## Verified claims

- `HEAD` is `42df6883337605d901a23e9fed874768c7ce1824`; the baseline contains 1,228 tracked paths. Both `git diff --quiet 42df6883337605d901a23e9fed874768c7ce1824 --` and `git diff --cached --quiet 42df6883337605d901a23e9fed874768c7ce1824 --` exit 0, so the pre-existing tracked worktree and index match that baseline. This does not imply the whole checkout is clean; implementation and evidence additions are untracked.
- The root `SHA256SUMS` has SHA-256 `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`; `sha256sum -c SHA256SUMS` verifies all 24 entries. The saved output hash `e43918e16a1399d0d91ec6b9b428bb8a13679f0f880b97960aab21d419d99e0a` matches N1's recorded verification output.
- Root `go.mod` hashes to `e5dba8ed15a331f2bcdc7a35604cadd927fd486bca2543e83953f6a73716c5fa`, matching the baseline blob. Root `go.sum` is absent from both the worktree and baseline tree; the nested `compiled-frontend/go.sum` is separate.
- N1's inherited execution manifest and full log hashes match their recorded values. The successful final attempt is recorded with exit code 0; the earlier VCS-stamping attempt is separately recorded with exit code 1. The final typed-composition report hash and byte count also match the manifest.
- The typed report says `matched`: 63 scripts, 2,463 actions, 63 native executions, 2,463 native frames, 4,926 actor/native frame comparisons, and zero mismatches. The execution manifest and typed report attribute the run to Go 1.24.0, Node 22.23.4, and Chromium 153.0.8010.0.

## Scope and limits

This audit used only bounded hash, diff, manifest, and report checks. It did not start the full inherited runner. I accept the historical result as preserved evidence, not as a fresh execution or as current evidence for the repaired codec. The inherited run's source-gate limit is explicit: its root Go test phase preceded the codec repair, so it does not establish that the repaired codec or new compiled-frontend packages passed current Go 1.24 test, race, or vet gates.

## Evidence

The independent command outputs are recorded in `coordination/reviews/xr_a_preserve/verification.json`, with the 24-entry checksum output at `coordination/reviews/xr_a_preserve/sha-check.log`.

Reviewed N1 artifacts:

- `coordination/reports/A-PRESERVE.md`: SHA-256 `e4521a57a69c3484504d2578fa80a62cb3c6d22ac93c916a37cb73015b14f1d0`
- `coordination/receipts/A-PRESERVE.json`: SHA-256 `f94baac38574b9d1424c3d9c4fafd65bb224ccf2edd43044b41d1b9afff67850`
- `evidence/inherited/execution.json`: SHA-256 `795b36bfd55cbf3e55ec523676efd99e42fbe38009a6054c51aa47edc549e671`
- `evidence/inherited/full.log`: SHA-256 `8041da184cf0b6255c5dc0fc2801a659f7fd0dbbc99abf6635bbef98e365113f`
- `typed-composition/build/report.json`: SHA-256 `7f3bfc90929aa38d481f791d2dc45e7b8488b4a8d8f32afd5d9c044a02923387`
