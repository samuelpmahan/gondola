# E-COHERENCY — capture metadata and typed-state closure

## Result

Repaired the two concrete false-acceptance families from XR-CAPTURES in the Go capture verifier. Browser profiles now bind `profile`, `initialBackend`, trace `backend`, seed metadata, every renderer swap result, callback renderer after swaps, and final snapshot backend to the expected React/DOM/swap sequence. Native capture JSON is checked for required fields and rejects `null` for scalar or non-pointer struct fields before Go typed decoding can silently supply zero values. The validation applies recursively to the initial native checkpoint, every update frame, every view, and every bridge input/publication. Nullable pointers and nil slices remain allowed only where their Go capture types permit them; replay comparison then checks their expected values.

Nineteen added mutation cases exercise the reviewed metadata/state witnesses plus missing/null false booleans, whole counter state objects, zero-count update frames, and zero-valued bridge fields. The unmodified capture, including valid `Count: 0` and `Locked: false`, remains accepted. The original N4 mutation test source was unchanged; the full package run includes its healthy positive and all ten independent controls.

## Verification

Go 1.24.0 full package suite passed against `/tmp/gobi-published-restore-check`:

```text
/tmp/gondola-go/go/bin/go test ./modulequalification -count=1
exit 0; 78.209s
```

The directory CLI also passed without browser or Node subprocesses:

```text
/tmp/gondola-go/go/bin/go run ./cmd/module-qualify --directory /tmp/gobi-published-restore-check
exit 0; stdout JSON reports sourceCommit 7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0 and capture 12 profiles / 144 events / 99 updates / seeds 20261031–20261033
```

Exact commands, environment, versions, stdout/stderr, exit codes, and hashes are under `rawlogs/E-COHERENCY/final-package-tests/` and `rawlogs/E-COHERENCY/final-directory-cli/`. The earlier false-acceptance witnesses remain unchanged under `rawlogs/XR-CAPTURES/`; their index SHA-256 is recorded in the receipt. E-CAPTURES’ original report, receipt, and source snapshot are preserved under `seals/E-CAPTURES/` and were not edited.

## Scope

This checker independently replays one fixed Go parent/child fixture and three deterministic seeds, then compares captured native, direct, and browser records. The browser observations are input evidence; this Go checker does not launch a browser or execute JavaScript. It does not qualify arbitrary modules or event streams. `CaptureReport.MutationControls` remains zero because CheckCaptures does not execute the separate adversarial tests.
