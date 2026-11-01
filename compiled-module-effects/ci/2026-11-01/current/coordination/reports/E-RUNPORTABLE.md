# E-RUNPORTABLE — Clean portable-source aggregate

**Outcome:** mixed_change  
**Status:** clean_portable_producer_run_passed  
**Phase:** clean source-bound build and archive passed; independent external consumption and publication readback pending.

## Source and invocation

This run used reviewed commit `e0933465725e470dc610e3f81b4bbee95538c1d0` (tree `0a52ae23ab32e0ca35f6b1385ea851e3edeede3a`), parent `f6c9da1b9299a983f8a55c86ddbb0ab7543a1204`. The runner verified HEAD equals the source commit, a clean worktree, 202 matching source pins with zero mismatches, and 58 pinned test-source files.

```sh
GOBI_GO_BIN=/tmp/gondola-go/go/bin/go \
GOBI_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node \
GOBI_PYTHON_BIN=/tmp/rebalancer-env/bin/python \
CHROMIUM_PATH=/tmp/chromium-portable \
bash run-module-effects.sh --source-commit e0933465725e470dc610e3f81b4bbee95538c1d0
```

Tool versions: go version go1.24.0 linux/amd64; compiler Go go1.27.3 linux/amd64; Node v22.23.4; Python 3.12.14; Chromium 153.0.8010.0; Playwright 1.64.1; GNU tar (GNU tar) 1.35. Per-command argv, cwd, environment, exit status, and stdout/stderr byte/hash records are preserved in the runner evidence.

## Results

Four builds passed. Native Go tests passed 13 tests across 2 packages; module ABI passed 1; compiler analyzer passed 4 tests (8 cases); compiler Build-stage passed 1; and 36 Node tests passed across 7 files, including the loader relocation regression.

Native/direct/browser conformance matched for four scenarios (literal: 31, seed-20261104: 49, seed-20261105: 50, seed-20261106: 48 source events). Captures include 182 native states, 58 native effects, 20 profile captures, 890 profile events, and 910 snapshots. The producer rejected 16 capture mutation controls and 7 build-admission controls. The independent oracle rejected 64 applications over 4 scenarios and 16 distinct IDs; receipt rows preserve the per-scenario arrays and their flattened total.

The real Chromium timer demo passed all 6 actual-DOM-click steps. Before each timer started, observations recorded committed Go pending state and the rendered “Saving”, disabled Save, enabled Cancel UI. The smoke also exercised immediate child Add/idle Save after a renderer swap, a pending timer across swap, and swap→remove/remount→child actions. Page errors and failed requests were both zero. Timer completion echoes the opaque Go token; no persistence or HTTP request is claimed.

## Archive and relocation evidence

The canonical archive has 639 members, 8667568 bytes, SHA-256 `7eb9f28fc6504bf43207436dfc916549bb28e34059cee69bc138376be7940087`. The manifest is 160965 bytes, SHA-256 `457073a81f1c93ba0edfe51b06667bb39f9baed95fd32ad3a9c630f9f476b1b9`. Archive creation, extraction, and listing round-trip passed; the built-in independent Python consumer verified all member pins. Four regenerable browser bundles are pinned as archive exclusions. The archive remains at `/workspace/scratch/39a56936f173/gondola/compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a.tar.gz` and is not duplicated in rawlogs.

The independent XR-RELOCATE review accepted the loader repair and separately replayed eight direct profiles (356 events) with original-checkout reads blocked. This clean run rebuilds from the reviewed relocation source and exercises all 20 direct/browser profiles in the fresh archive.

## Scope and acceptance boundary

The new source-bound producer run and its built-in Python archive check passed. N5 external archive/browser consumption and published readback remain pending, so this receipt does not claim overall acceptance. E-REG M0/counter and E-KEYEDREG prior keyed evidence are separate and were not duplicated here.

Exact runner receipt, per-command logs, native/profile captures, browser smoke, source/build pins, and checksums are indexed at `/workspace/scratch/39a56936f173/module-effects-coordination/rawlogs/E-RUNPORTABLE/index.json` (SHA-256 `8f414f4e37300b15cea6a8db13d334b5fd7d65eacac5f04f18016bb1e55a54f9`). The runner receipt is `/workspace/scratch/39a56936f173/gondola/compiled-module-effects/evidence/attempts/attempt-20261101T042914069Z-2-7d158b7a/receipt.json` (SHA-256 `31e60be9b368330a4d98040c0bd1f80a84b02d6eeb5cdea84ef12906db82e3bc`). The earlier E-RUNFINAL packet and its f6 source binding remain unchanged.
