# XR-REPLAY — independent review of sealed E-REPLAY

**Worker:** N3  
**Decision:** `accepted`  
**Reviewed snapshot:** `seals/E-REPLAY/`

## Review result

The sealed source and evidence are internally consistent. `seal.json` hashes match the sealed report, receipt, and rawlogs index. The source inventory and all 41 indexed E-REPLAY raw-log entries match their recorded sizes and SHA-256 values. The current four owned source files match the sealed source snapshot byte-for-byte.

The extraction keeps one replay implementation: the 504-line function block from `func replay(...)` through the final helper is byte-identical to baseline. `cmd/module-effects-native` delegates scenario replay to `effectsreplay.ReplayJSON`; its default path and `-mount-boundaries` mode remain. The five original test bodies are byte-identical to baseline; four moved into `effectsreplay`, and the mount-boundary test remains in the command package. One direct API formatting/input test was added.

Independent checks passed:

- `ReplayJSON` returned bytes identical to the pre-edit archived CLI output for the literal scenario and all three real seeded scenarios.
- The rebuilt CLI's default and mount-boundary output matched the baseline bytes. Unknown-field, trailing-JSON, and missing-file cases matched baseline stdout, stderr, and exit status.
- The focused `effectsreplay` and command package tests passed. The short-write tests returned `io.ErrShortWrite` for a short nil-error writer and preserved a writer-provided error.
- The `effectsreplay` Go import graph contains no process execution or network packages, and the source contains no Node delegation.

## Parser boundary

`ReplayJSON` uses Go's standard `encoding/json` decoder with `DisallowUnknownFields` and an explicit EOF check. It rejects unknown fields and trailing JSON, matching the previous CLI. As a standalone API, it still accepts duplicate JSON member names and invalid UTF-8 because that is standard decoder behavior. The qualification caller applies `decodeMapStrict` before calling `ReplayJSON`; that layer rejects duplicate keys and invalid UTF-8. The raw API should therefore not be described as a complete strict-byte JSON decoder.

## Verification evidence

Commands and raw output are under `rawlogs/XR-REPLAY/`. The direct four-scenario byte comparison is in `api-comparison.log`; CLI compatibility is in `cli-compat-comparison.log`; short-write checks are in `io-shortwrite-test.log`; source/test preservation checks are in `source-snapshot-match.log`, `replay-function-preservation.log`, and `test-preservation-check.log`; seal and raw-log integrity is in `seal-inventory-verification.log`.

Three reviewer harness setup errors were repaired and retained in `*-first-attempt.log`: the CLI comparator initially expected baseline stderr/status files that were not recorded for successful invocations; the first inventory check used the wrong raw-log base path; and the first test-body scanner included helper functions. The corrected checks all pass.

## Scope

This review covers the sealed replay/API/CLI extraction and its focused tests. It does not claim browser or network equivalence, and it did not run the full repository suite. No production files were edited during review.
