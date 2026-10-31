# XR-REGRESSIONS — independent review of the sealed regression checkpoint

**Reviewer:** N2  
**Decision:** `accepted`  
**Author packet:** N1 `E-REGRESSIONS`  
**Scope:** historical M0 and existing counter regression results, their exact source/runtime records, sealed packet hashes, and saved raw traces. No large regression suite was rerun and no production or historical packet file was changed.

## Independent evidence checks

The live author report and receipt are byte-identical to the sealed report and receipt. The seal JSON matches both sealed hashes. The packet raw evidence index hash matches the report (`ff344d86f87236899f0b205cea26de50e43270c6fa2c8da4c496e5779234e9a8`). The counter trace file itself is present, 49,491,627 bytes, and hashes to `bc647b4a36311d2d19e32afa9686df74bfed46bc408a4d17c108c7c74a0bd934`, matching the report, receipt, declared byte count, trace SHA file, and raw index.

I parsed the saved trace rather than relying on its prose summary. It has seed `20261030`, 107 scenario records (including 100 generated cases), and the sum of the per-scenario tick arrays is 4,473. There are zero mismatches. Its native-comparison section has 107 scenarios, all `matched` with exit code 0. The trace records React `19.3.1` and Chromium `153.0.8010.0` at `/tmp/chromium-portable`. The saved Node test run reports 8 tests passed, 0 failed.

The counter command record uses an inline PATH containing `/tmp/gondola-go/go/bin` and `/tmp/gondola-node22/node_modules/node/bin`, with `GOTOOLCHAIN=local`, `GOFLAGS=-buildvcs=false`, and the portable Chromium path. Its pinned versions file states Go `1.24.0`, Node `v22.23.4`, Chromium `153.0.8010.0`, consistent with the trace. The ambient environment file separately says that ambient shell inspection saw no Go executable and Node 24; the adjacent environment note explicitly distinguishes that shell from the inline command environment. That is a documented capture distinction, not a failed run.

The saved M0 command is `PATH=... GOTOOLCHAIN=local GOFLAGS=-buildvcs=false bash run.sh`, and the exit file is `0`. The raw `run.sh` at the reviewed checkpoint performs `go vet ./...`, `go test ./...`, then `go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json`, followed by `sha256sum -c SHA256SUMS`. Its saved output includes successful package tests and ends with `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`. The M0 Go source before/after manifests are each 42,878 bytes, have the same SHA-256 `5241013f75ca23f65505e91864f2cb30ff1c451d0ef3d7cf47008fa08c972376`, and contain 309 entries. The equality record says they are identical. Both historical M0 and counter exit files are zero; the packet contains no failed test or comparator result.

The M0 prior-coordination preservation check is also pinned in the author packet. I reran only its 68-entry `sha256sum -c` preservation manifest against current historical files; all 68 still match. No counter sweep or M0 suite was rerun.

## Historical boundary

This is a valid regression checkpoint at base commit `a275d646b0d8ceed956b27b6b8f3099e17106857`; it is not evidence that every current source file still matches that snapshot or that later code passed the same full suites. Comparing the 309 historical Go-source entries with the current worktree finds 298 still byte-identical, 8 subsequently changed, and 3 temporary analyzer probe files no longer present. The eight later changes are:

- `cmd/compiled-modules-native/main.go` and `main_test.go` (E-NATIVECLICK).
- `fixtures/compiled/modulechild/app.go` and `app_test.go` (E-NUMERIC).
- `compilercontract/js_encoder.go`, `js_encoder_test.go`, `compiled-frontend/build/pipeline.go`, and `pipeline_test.go` (later encoder/compiler work, including E-UTF8).

The three absent entries are generated `analyze-method-probe-*` temporary fixtures. These are later source changes/removals, not discrepancies between E-REGRESSIONS' own before/after manifests. Root's final M0 run and post-encoder qualification remain separate acceptance gates.

## Limits

The evidence verifies only the saved M0 5,000-case run and the existing counter browser/native comparison run described above. It does not establish new compiled-module browser behavior, post-E-UTF8 source coverage, or any later full-chain result. The original E-REGRESSIONS report, receipt, raw logs, trace, and seal remain unchanged.

Hashes, raw paths, independent parsed counts, and the current historical-source comparison are recorded in `module-coordination/rawlogs/XR-REGRESSIONS/`.
