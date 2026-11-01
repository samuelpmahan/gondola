# E-RUNFINAL — Clean source-bound module-effects run

**Outcome:** mixed_change  
**Status:** clean_producer_run_passed  
**Phase:** clean Git-bound producer run passed; external consumer and publication readback pending.

## Source and invocation

The run used commit `f6c9da1b9299a983f8a55c86ddbb0ab7543a1204` (tree `89a4548e2dcaafb138a5d2b46bbffda082b52d9b`). The runner recorded HEAD equal to the source commit, a clean worktree, 201 source pins matching with zero mismatches, and 57 pinned test-source files.

```sh
GOBI_GO_BIN=/tmp/gondola-go/go/bin/go \
GOBI_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node \
GOBI_PYTHON_BIN=/tmp/rebalancer-env/bin/python \
CHROMIUM_PATH=/tmp/chromium-portable \
bash run-module-effects.sh --source-commit f6c9da1b9299a983f8a55c86ddbb0ab7543a1204
```

Tool versions: go version go1.24.0 linux/amd64; compiler Go go1.27.3 linux/amd64; Node v22.23.4; Python 3.12.14; Chromium 153.0.8010.0; Playwright 1.64.1; tar (GNU tar) 1.35. Per-command argv, cwd, environment, exit status, and stdout/stderr byte/hash records are preserved in the indexed runner evidence.

## Checks

Four builds passed. Native Go tests passed 13 tests across 2 packages; module ABI passed 1; compiler analyzer passed 4 tests (8 cases); compiler Build-stage passed 1; 35 Node tests passed across 6 files.

Native/direct/browser conformance matched for four scenarios (literal: 31, seed-20261104: 49, seed-20261105: 50, seed-20261106: 48 source events). Captures contain 182 native states, 58 native effects, 20 profile captures, 890 profile events, and 910 snapshots. The conformance producer rejected 16 capture mutation controls and 7 build-admission controls. The independent oracle rejected 64 applications across 4 scenarios, covering 16 distinct control IDs. Counts derive from the runner’s capture and control arrays.

The real Chromium timer demo passed all 6 steps using actual DOM clicks. Each timer start observed Go pending state and rendered “Saving”, disabled Save, and enabled Cancel before starting. The smoke covered immediate child Add/idle Save after renderer swap, a pending timer across swap, and swap→remove/remount→child actions. It recorded 0 page errors and 0 failed requests. Timer completion echoes the opaque Go-generated token; no persistence or HTTP request is claimed.

## Archive

The canonical archive has 638 members, 8666186 bytes, SHA-256 `e01b9508747b6e59af97a0cb57ce6c41a44514393cf9b57d6832b9d7bef89f4a`. Its manifest is 160505 bytes, SHA-256 `5c06a221bae5709eca9859d1c273a7b9f4b26463fca086a4a2caa2ecd30fe0fc`. Archive creation/extraction/list checks passed, and the independent Python consumer verified the archive against manifest member pins. Four regenerable conformance bundles are hash-pinned in the manifest and excluded from the archive. The archive remains at `/workspace/scratch/39a56936f173/gondola/compiled-module-effects/output/attempts/attempt-20261101T040910811Z-2-e6460df3.tar.gz`; it is not duplicated in coordination rawlogs.

## Scope and remaining gate

This is the clean aggregate producer run plus its built-in independent Python archive check. N5 external archive/browser consumption and publication readback remain pending, so this receipt does not mark overall acceptance. M0/counter E-REG and inherited PR22 keyed E-KEYEDREG are separate accepted evidence and were not rerun here. The primary archive source closure is the module-effects/compiler/test dependency closure, not a complete M0/counter checkout.

Raw commands, stdout/stderr, conformance captures, browser smoke, pins, and checksums are indexed at `/workspace/scratch/39a56936f173/module-effects-coordination/rawlogs/E-RUNFINAL/index.json` (SHA-256 `fbce8027ddc1d2a7e945f2a266e2733775c34ce29ea909e153f645400270bbdc`). The full runner receipt is `/workspace/scratch/39a56936f173/gondola/compiled-module-effects/evidence/attempts/attempt-20261101T040910811Z-2-e6460df3/receipt.json` (SHA-256 `3aed5f9ab39ebdc44c00a12e49e2f664bc876fd5515a265ae4bc46ffb981ca22`). The earlier failed E-RUN witness remains separate and unchanged.
