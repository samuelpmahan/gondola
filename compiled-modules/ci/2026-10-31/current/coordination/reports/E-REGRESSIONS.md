# E-REGRESSIONS — existing counter and M0 regression runs

**Worker:** N1  
**Outcome:** `confirmed_reuse`  
**Scope:** execution and evidence only; no source, Git, scheduler, or historical receipt edits.

## Existing mounted counter

Command, with the environment values recorded in `module-coordination/rawlogs/E-REGRESSIONS/counter/command.txt`:

```sh
PATH=/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false CHROMIUM_EXECUTABLE_PATH=/tmp/chromium-portable GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-interaction.sh
```

Exit 0. The run matched **107 scripts over 4,473 initial/action ticks** at seed `20261030`; the native comparator matched. All eight interaction Node tests passed. Chromium reported `153.0.8010.0`. Exact pinned versions were Go `1.24.0` and Node `v22.23.4`.

The complete JSON trace was copied immediately to `module-coordination/rawlogs/E-REGRESSIONS/counter/interaction-traces-seed-20261030.json`: **49,491,627 bytes**, SHA-256 `bc647b4a36311d2d19e32afa9686df74bfed46bc408a4d17c108c7c74a0bd934`. The source hash manifest for the runner, check script, seeded scripts, and `go.mod` is identical before and after the run. `environment-note.txt` explains that the separately captured ambient shell did not have Go on PATH and reported Node 24; the actual inline command PATH and the trace's browser metadata identify the runtimes used by the passing run.

## M0 static regression

After root authorized the run and N5 reported its ABI Go tests stable, executed:

```sh
PATH=/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false bash run.sh
```

Exit 0 under Go `1.24.0` and Node `v22.23.4`. The script completed `go vet ./...`, `go test ./...`, and the 5,000 seeded HTML cases with seed `20261030`; output ended with `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`. Full output is preserved in `module-coordination/rawlogs/E-REGRESSIONS/M0/run.log`.

All **309** discovered Go source file hash entries are byte-identical before and after (`go-source-before.sha256` and `go-source-after.sha256`, each SHA-256 `5241013f75ca23f65505e91864f2cb30ff1c451d0ef3d7cf47008fa08c972376`). The saved pre-run hash list for all existing coordination receipts, reports, and seals validated afterward with exit 0; no prior M0 receipt was edited.

## Evidence and limits

`module-coordination/rawlogs/E-REGRESSIONS/index.json` pins the raw logs, exact command/version records, trace, source manifests, and prior-coordination-file preservation check. Its SHA-256 is `ff344d86f87236899f0b205cea26de50e43270c6fa2c8da4c496e5779234e9a8`.

This packet confirms the existing counter browser regression and M0 static 5,000-case regression at base commit `a275d646b0d8ceed956b27b6b8f3099e17106857`. It does not claim acceptance of the new composed-module browser profiles or certify behavior outside those commands.
