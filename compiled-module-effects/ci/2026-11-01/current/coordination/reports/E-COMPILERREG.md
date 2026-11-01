# E-COMPILERREG — Full nested compiler Go suite

**Outcome:** mixed_change  
**Status:** full_compiler_go_suite_passed  
**Phase:** clean-source nested compiler verification completed; independent review pending.

## Source and command

The test ran at clean commit `e0933465725e470dc610e3f81b4bbee95538c1d0` (tree `0a52ae23ab32e0ca35f6b1385ea851e3edeede3a`). Before and after the command, 203 selected tracked source/lock/fixture paths matched their physical SHA-256 and Git blob pins; 73 tracked Go test files were included in the pin map. No selected source inputs were missing. HEAD/tree stayed fixed and the worktree stayed clean.

From `compiled-frontend/`, the suite command was:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:/tmp/gondola-go/go/bin:$PATH \
GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false \
/tmp/gondola-go/go/bin/go test -json ./...
```

The effective toolchain reported `go version go1.27.3 linux/amd64`; `go env` reported GOVERSION and GOTOOLCHAIN `go1.27.3` and the nested module path. Bootstrap Go was `go version go1.24.0 linux/amd64`. Node vv22.23.4 was on PATH; npm install/CI was not run. Test stdout JSON and stderr are preserved byte-for-byte in rawlogs.

## Results

The command exited 0; stdout contained 355 JSON events (90455 bytes), stderr was empty. All 8 packages completed: 3 passed, 5 had no test files, zero failed, and zero cached. The three test packages reported 82 passing terminal test events including subtests: analyze 45, build 28, emit 9. There were zero failed or skipped test events.

Packages with tests: analyze, build, emit. Packages with no test files: gobi-build, probe_counter, adapter, native, semantics. Per-package results, exact test/subtest names, durations, and package actions are in the indexed JSON summary.

## Input pins and limits

The pin set covers all tracked compiled-frontend Go source and fixture/testdata files, root tracked Go source, and root/compiler Go/npm manifests and lockfiles. It excludes sparse-checkout coordination/rawlogs/evidence and generated output directories. The before/after pin maps include per-path byte/SHA-256 and Git blob IDs. The first overly broad pin-selection attempt encountered a skip-worktree historical coordination file and stopped before tests; its ENOENT record is preserved.

This closes the full nested compiler Go test gap only. The root-wide Go suite, M0/counter regressions, and prior PR22 keyed regression were not rerun in this packet. No source, Git, branch, ref, or scheduler changes were made.

Evidence index: `/workspace/scratch/39a56936f173/module-effects-coordination/rawlogs/E-COMPILERREG/index.json` (SHA-256 `837ec6035133830ceaf15b411e293c606e6232d315e6a583e9d8c6d23e890781`). It contains the exact JSON test stream, empty stderr, command/env record, toolchain version, before/after source and Git blob maps, and verification status.
