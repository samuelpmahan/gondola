# E-COUNTER-REGRESSION (N4): original counter pipeline

**Outcome:** `confirmed_reuse`  
**Date:** 2026-10-31

## Result

Reran the original `run-interaction.sh` pipeline with its browser-install and npm-install steps skipped as requested, using the supplied Go 1.24, Node 22, and Chromium executable. The build, Node tests, mounted Chromium parity run, and native comparator all exited successfully.

The actual generated trace reports seed `20261030`, 100 generated cases with maximum 80 actions each, plus 7 fixed scenarios: 107 total browser scenarios. Counting the stored trace gives 4,366 actions and 4,473 initial/action ticks. It contains zero browser mismatches, and the native comparator matched all 107 scenarios with zero mismatches. The two Node test files passed 8/8 tests.

The full trace is `interaction/build/interaction-traces-seed-20261030.json`, 49,493,116 bytes, SHA-256 `4e22212a1c8b66c1cc768cf2f01b5ea0d45c994221f8b634a183fecab7194fb5`. A compact independently derived summary is pinned in `rawlogs/E-COUNTER-REGRESSION/counter-metrics.json`.

## Reproduction and toolchain

Exact command:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 CHROMIUM_EXECUTABLE_PATH=/tmp/chromium bash run-interaction.sh
```

Versions recorded before the run: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, npm `11.9.0`, React `19.3.1`, and Chromium `153.0.8010.0`. `interaction/node_modules` was an existing symlink into the children archive worktree, so the requested skip flags avoided package installation and browser download. Stderr contains only the Node experimental proxy-agent warning and npm's unknown `http-proxy` configuration warning; the run exit code is 0.

The run rebuilt the WebAssembly counter, `compare-interaction`, Go's `wasm_exec.js`, and the browser reference bundle. Their sizes and SHA-256 hashes are recorded in `counter-metrics.json`. Full stdout and stderr, command, exit code, environment versions, source manifests, and the trace are retained under `interaction/coordination/rawlogs/E-COUNTER-REGRESSION/` and `interaction/build/`.

## Source and scope boundary

Before and after manifests each pin 23 Go counter/comparator dependency files, interaction source/test files, the build script, and `go.mod`. Both manifests have SHA-256 `4962a8da806ad2e74a5dd4d186d88860084d36735b97361d4769fdf896eaf420`; their diff is empty. This verifies those pipeline inputs were unchanged during the run. The root-supplied application-source baseline reference is `5662efcd7feb7920e4690d38cc76a297fed69d5a`; this report does not inspect Git or claim a current HEAD attestation.

This is the original Go WebAssembly counter versus React browser parity pipeline. It is distinct from the newer no-WASM backend-qualification work and does not certify that lane, run `go test ./...`, or claim final candidate/CI acceptance. Only generated outputs under `interaction/build/` and this run's coordination evidence were added; no application source or Git state was changed.
