# E-CIFIX — hosted clean-checkout integration test repair

**Worker:** N2  
**Outcome:** `mixed_change`

## Change

The hosted M0 run failed because integration tests treated the ignored PR23 attempt as mandatory when `GOBI_EFFECTS_QUALIFICATION_INPUT` was unset. The integration helper now resolves the pinned default attempt relative to the test source. It skips only when that default fixture is absent. If the environment variable is set, its path must exist and be a directory; a missing path, file, or other filesystem error fails the test.

The helper returns the selected absolute path, availability, and error so selection behavior can be tested independently. Five focused cases cover default-present, default-absent, explicit-valid, explicit-missing, and explicit-nondirectory paths. The existing default expected source commit remains unchanged; callers can still set `GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT`.

Only `gondola/effectqualification/integration_test.go` and the new `gondola/effectqualification/fixture_selection_test.go` were changed. No production package, producer source, archive, or capture was modified.

## Verification

- The five resolver cases passed.
- A full clean checkout was produced from Git archive `4338255bf8800d521b7f932fb530fe2cedebbf72`, with only the two repaired test sources overlaid. Its ignored PR23 attempt was absent. In that checkout, `go test -count=1 ./...` passed.
- The verbose qualification-package log shows fixture-dependent checks skipped because the default attempt is absent. The resolver tests and all fixture-independent checks passed.
- With `GOBI_EFFECTS_QUALIFICATION_INPUT` set to the real PR23 attempt and `GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT=e0933465725e470dc610e3f81b4bbee95538c1d0`, `go test -count=1 ./...` passed.
- With the environment variable unset in the working tree where the default attempt exists, `TestPR23DirectoryIsAccepted` passed.
- With an explicit nonexistent path, `TestPR23DirectoryIsAccepted` failed as required and named `GOBI_EFFECTS_QUALIFICATION_INPUT`; it did not silently skip.
- `gofmt -l` and `git diff --check` passed.
- The retained PR23 archive and manifest hashes remain `7eb9f28fc6504bf43207436dfc916549bb28e34059cee69bc138376be7940087` and `457073a81f1c93ba0edfe51b06667bb39f9baed95fd32ad3a9c630f9f476b1b9`.

The coordinating root supplied hosted references: M0 failure run 41278451076, job 124765296616, and fresh workflow run 41278451068 reported passed. The hosted log is being retained by root; this packet records those identifiers without claiming an independent retrieval.

## Follow-up boundary

The new test file changes the Go test source closure, so the next published source pin/test-closure snapshot must include it. The current producer attempt and archive remain byte-identical. The fresh hosted workflow must be rerun against the published source snapshot; this packet does not claim that rerun.

Raw commands, outputs, source hashes, hosted run references, and archive preservation hashes are indexed in `rawlogs/E-CIFIX/index.json`.
