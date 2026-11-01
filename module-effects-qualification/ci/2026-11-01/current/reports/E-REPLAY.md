# E-REPLAY — native replay API extraction

**Worker:** N1 (`/root/qual_replay`)  
**Outcome:** `mixed_change`  
**Baseline:** `e0933465725e470dc610e3f81b4bbee95538c1d0`

## Change

Extracted the existing deterministic keyed module effects replay into the importable root package `effectsreplay`. Its public API is:

```go
func ReplayJSON(input []byte) ([]byte, error)
```

The API decodes one strict `gobi.module-effects-scenario/v1` JSON value, rejects unknown fields and trailing JSON, runs the same Go module updates and effect/transport/lifecycle logic, and returns the same two-space-indented JSON bytes with HTML escaping disabled and a final newline. `cmd/module-effects-native -script` still reads the same path and delegates to this API. The default scenario path and `-mount-boundaries` mode remain available.

All five original tests were retained: four replay/state tests moved with the implementation so they continue to inspect internal state and ledgers, and the mount-boundary CLI test remains in the command package. Added one direct API formatting and strict-input test, for six tests total.

## Verification

`/tmp/gondola-go/go/bin/go test ./effectsreplay ./cmd/module-effects-native` passed all six tests. The output is captured in `rawlogs/N1-E-REPLAY/go-test.stdout` and `.stderr`; the test names are listed in `rawlogs/N1-E-REPLAY/test-list.stdout`.

Built the baseline CLI before source edits and the extracted CLI after source edits. For the real attempt scenarios `effects.literal.scenario.json`, `effects.seed-20261104.scenario.json`, `effects.seed-20261105.scenario.json`, and `effects.seed-20261106.scenario.json`, `cmp` confirmed byte equality across the baseline CLI, extracted CLI, and direct `effectsreplay.ReplayJSON` API output. The exact comparisons are listed in `rawlogs/N1-E-REPLAY/comparisons.txt`; all outputs and their SHA-256 values are retained under `rawlogs/N1-E-REPLAY/`.

Also compared baseline versus extracted CLI bytes for the default invocation and `-mount-boundaries`. For unknown-field, trailing-JSON, and missing-file inputs, stdout, stderr, and exit status were identical.

The first focused test invocation caught a stale `bytes` import after moving the command-only test. I removed the unused import and reran the focused suite successfully.

## Scope and limitations

Only the focused replay and CLI package tests were run here; the root integration worker owns fresh integrated regression. This lane does not claim broader browser or network equivalence. No Git operations or dependency changes were made. Independent review remains pending.

## Owned source files

- `gondola/effectsreplay/replay.go`
- `gondola/effectsreplay/replay_test.go`
- `gondola/cmd/module-effects-native/main.go`
- `gondola/cmd/module-effects-native/main_test.go`
