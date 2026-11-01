# E-DELIVERYCONTRACT — N6 runner/consumer repair

**Outcome:** mixed_change  
**Status:** author-only full pipeline passed  
**Qualification phase:** clean Git-bound E-RUN and independent external archive acceptance pending.

## Repair

The runner now validates the frozen E-HARNESS public summary against its actual scenario, native, and profile JSON pins. It checks command and version fields, the build-index and Go mount-boundary pins, all scenario/profile array counts, producer parity/native check totals, all 16 capture-control IDs and all 7 build-control IDs. It no longer expects unpublished native stdout/stderr paths or guesses bundle pins from profile refs. Native stdout logs are archived as ordinary members; the four regenerable browser bundles are individually pinned in the manifest exclusions.

The independent mounted oracle now applies its 16 capture mutations separately to all four scenarios and reports array-derived applications (64 in this run), with 16 distinct control IDs. The mounted-demo removal-order check scopes rows to key b, generation 1, and the exact unmount state-event index; it also requires Go unmount state, cancel declaration, transport cancel call/result, and renderer teardown in strict order. Focused negative tests reject missing or reversed events despite an earlier unrelated state commit.

## Author diagnostic

Command: `/tmp/gondola-node22/node_modules/node/bin/node compiled-module-effects/run.mjs --source-commit 88e7937e66fd1c8f36e5b5dd3224209b07c6eb33 --chromium /tmp/chromium-portable --allow-dirty`  
Working directory: `/workspace/scratch/39a56936f173/gondola`  
Environment overrides: Go `/tmp/gondola-go/go/bin/go`, Node `/tmp/gondola-node22/node_modules/node/bin/node`, Python `/tmp/rebalancer-env/bin/python`; Chromium `/tmp/chromium-portable`.  
Versions: go version go1.24.0 linux/amd64; compiler Go go1.27.3 linux/amd64; Node v22.23.4; Python 3.12.14; Chromium 153.0.8010.0; Playwright 1.64.1; GoScript v0.6.2; esbuild 0.28.2; tar (GNU tar) 1.35.

- Four independent builds passed. Native/fixture Go tests: 13 tests across 2 packages; module ABI: 1; compiler analyzer: 4 tests/8 cases; build-stage regression: 1.
- Node tests: 35 passed across 6 files, including the new delivery-contract tests. No skips or failures.
- Scenario event arrays: literal 31; seeds 20261104=49, 20261105=50, 20261106=48. The four native traces contain 178 events, 182 states, 58 effects, and 116 transport rows. All five direct/browser profiles were captured for each scenario: 890 profile events and 910 snapshots. Producer controls rejected 16 capture mutations and 7 build mutations; the independent oracle rejected 64 applications across 16 distinct IDs.
- Chromium demo smoke returned HTTP 200 and passed 6 real-HTMLElement-click steps: initial-two-key-mount, request-pending-and-disabled-controls, go-declared-cancel, react-swap-immediate-real-add-and-idle-save-clicks, renderer-swap-preserves-pending-timer, swap-remove-remount-real-child-actions. Before each of 4 transport starts, the observed Go state was pending, status was “Saving”, Save was disabled, and Cancel was enabled. The remove/remount trace proves generation 1 unmount update/commit/cancel/transport cancel/renderer teardown at sequences 33, 35, 36, 38, and 40; generation 2 then completed its own token. Page errors and failed requests: 0 and 0.
- Archive: 8666075 bytes, SHA-256 `eaedcc97d2bef10b16755400c9088a5cea7dd4f320d48b19356c3252b2bbce0d`, 638 members. Source snapshot round-trip and independent Python archive verification passed. The primary archive remains at `/workspace/scratch/39a56936f173/gondola/compiled-module-effects/output/attempts/attempt-20261101T035413961Z-2-55fe7cd9.tar.gz`; its manifest is `/workspace/scratch/39a56936f173/gondola/compiled-module-effects/output/attempts/attempt-20261101T035413961Z-2-55fe7cd9.manifest.json`. The archive includes no duplicate-log exclusions and records four excluded regenerable bundle pins. The rawlogs packet pins the manifest but does not duplicate the archive.

## Failed attempts and scope

Two earlier unique author attempts are preserved with their full local file inventories and selected command/trace/pin copies. Attempt `attempt-20261101T035129308Z-2-78bd7201` failed in the unmount-order assertion because an earlier unrelated child commit was selected; its failure and source pin map remain preserved, but that pre-archive run did not snapshot the exact runner body. Attempt `attempt-20261101T035317671Z-2-6e206183` passed the browser timer smoke, then failed on a missing scenario-constant import during archive inventory; its exact three N6 source files were snapshotted. Attempt `attempt-20261101T035413961Z-2-55fe7cd9` passed the complete pipeline. The local inventory indexes hash every file in all three attempt/evidence roots.

This is an author-only run on base commit `88e7937e66fd1c8f36e5b5dd3224209b07c6eb33` with a dirty tree. Git-bound source pins did not match because the three intended N6 files were uncommitted; the other source pins matched the base. The archived source closure contains 201 files, including 57 test sources. No clean-source qualification is claimed. The E-REG M0/counter and E-KEYEDREG regressions are separate evidence and were not duplicated in this author run; binding them to the next source commit remains pending. External archive consumer, serving the archived site in Chromium, clean E-RUN, and published readback are pending.

Reports/receipt and indexed raw evidence: `/workspace/scratch/39a56936f173/module-effects-coordination/reports/E-DELIVERYCONTRACT.md`, `/workspace/scratch/39a56936f173/module-effects-coordination/receipts/E-DELIVERYCONTRACT.json`, and `/workspace/scratch/39a56936f173/module-effects-coordination/rawlogs/E-DELIVERYCONTRACT/index.json`.
