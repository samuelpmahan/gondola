# A-DELIVERY — composed delivery evidence

**Outcome: confirmed_reuse, with the final replay and CI boundary retained.** The existing full-entrypoint record is a real zero-exit run for the then-current source snapshot. T6's demo, HTTP browser-smoke, runner, workflow, and usage instructions are bound to that run's source-assets manifest and reproduced by its artifacts. This reuses the historical delivery and unchanged inherited-gate evidence; it does not certify the updated final oracle.

## Full-run record and source boundary

`session-tree/evidence/full-run-before-review.json` records `full_runner_exit: 0`, status `matched`, seeds 20261030/20261031, 30 generated cases per seed, 40-action generated cap, 63 scripts, 1,587 actions, 1,650 global ticks, 5,150 observations on each side, 544/544 native comparisons, zero parity mismatches, and a detected five-action blur negative control. The matching terminal log ends with the same replay totals and a successful HTTP browser-smoke result. The retained log is 120,539 bytes; the native replay archive and loaded-checker archive are also present.

The run is explicitly bound to the earlier schedule and oracle hashes. Its `scripts.mjs` hash is `53b93aebe11ef0a38b41de8b654df2973ba4a82be9a13423c49fb77997f17ac6`; the final R-T4B hash is `17707f0ca1b6147a25cd6a121e444189900f5b06ed512906d43766cda0e01631`. The final fixed scripts contain 68 actions (29/21/18) rather than the old 64 (27/21/16), so the retained 1,587-action replay is historical and cannot stand in for the pending rerun. The initial run's source-assets manifest correctly records the earlier source snapshot. Current `RESULTS.md` labels the run as before final oracle review and says final affected-gate execution is pending; that status is accurate. It should continue to be read as an initial pass, not the final revision.

## T6 demo and reproduction contract

- `session-tree/build/browser-smoke.json` records a real HTTP-lab browser run: Go tree IDs 1–4 form parent→child→grandchild plus a separate sibling; parent replacement restored focus and backward selection `[2,10]` while child shell/input identity stayed fixed; child replacement retained its grandchild; disposal order was `[3,2]`; both descendant cancellations were observed; late release statuses were `[409,409]`; sibling work completed after family disposal; root 1 was recreated as 5; and the retired callback caused zero `Complete` calls.
- The saved screenshot visibly shows four live Go sessions, ordinary row drafts in the nested collections and sibling, per-node renderer/lifecycle controls, the tree/snapshot inspectors, and the HTTP lane panel. The screenshot is tied to the demo code hashes below.
- The manual README command is coherent with the source: run `./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .` from the repository root, then open `/session-tree/demo.html`. `httplab.New` serves static repository files with `http.FileServer(http.Dir(root))` and reserves only `/api/*`; the page loads `wasm_exec.js` and the module, which requests the built tree and GoDOM WASM assets and React bundle. The automated browser-smoke starts the same lab with the repository root and exercised those assets over loopback HTTP.
- The full runner builds the bridges, browser bundles, comparator, and HTTP lab before invoking Go tests/race/vet, both WASM smokes, all session-tree Node tests, the real HTTP browser smoke, and the nested checker. The workflow installs Go `1.24.x`, Node `22`, runs `npm ci` against `interaction/package-lock.json`, installs Playwright Chromium, then invokes `bash run-session-tree.sh`. Its `GONDOLA_SKIP_NPM_CI=1` and `GONDOLA_SKIP_BROWSER_INSTALL=1` only skip provisioning already performed by workflow steps; `run-interaction.sh` contains no test-skip behavior for those flags. React `19.3.1`, ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2` are exact interaction dependency pins. A fresh CI run remains pending.

## Reused evidence and limits

No tests or full runner were rerun for this read-only composition review. The zero-exit full run covers the pre-R-T4B schedule/oracle snapshot above; it remains useful for the unchanged inherited gates and T6 source lane. T5's final oracle amendment, the R-T4B schedule changes, the affected native replay, clean full-chain rerun, and fresh CI have not been established by these historical artifacts. `RESULTS.md` correctly leaves those gates pending. There is no merge or deployment claim.

## Hashes

```text
session-tree/evidence/full-run-before-cancel-review.log  e717d074e472e0679eb2480bbb26dffb00df9058956de15fd7c42f8d57c9baa5
session-tree/evidence/full-run-before-review.json         9726d144187db71e7ee3cbd57485837c9f01cfd9ad74c45638f87b3c7e5fc804
session-tree/evidence/source-assets.json                  3b9f759eff1d0e3c41f10922630d4f422e3607ef8cfa8096e17d89f9a18f3ee0
session-tree/build/browser-smoke.json                     14d353392ad5cd794a4f619f91eb25e3370b053da4f4bc86249f6f7436d79c21
session-tree/build/replay-default.json                    33a7dc92211bfd0fc551bd5f894b1a658d5ee59026a7bb70d7e1f070c404add8
session-tree/evidence/demo-nested-sessions.png            d8720238043cfccda31339428673cb8f1f28d3626fd5c8792d2b6d99baf8f48a
session-tree/evidence/environment.json                    71ded0bf181cd151c7c37416e2b0227cd43ad3c7f5c571aaabeba1cb345ef5be

session-tree/demo.mjs                                     3e3cb3a62c592eb3f96ae193eb84f48abc504adfbce2c38598a59792e493d78d
session-tree/demo.html                                    07cc481ca5142ce4c0106a55ae3bcd556263a463e25f80cb4cb0f0582114fdf1
session-tree/browser-smoke.mjs                            d06f4322c5eed200a50a3aa9e57842874b0b15143e2a9a5ff213556b914f9b5a
run-session-tree.sh                                       9c70f1461cc767c5f22f196b69b5e512496385e530ef96af5c7da82a32b3cf98
.github/workflows/session-tree.yml                        fa650b478d4aba94b714a74bb8e734ccdfe7064b54cd1d2fb07708345236a135
session-tree/README.md                                    ed0d8e9cb9a19e9fe5779b94649dc7916070c06fb334350ee055bc192f0b980c
session-tree/RESULTS.md                                   59165fdf8c1c451d340b69f1d492dde9d9d8649b77f7b7fb5bfa2dbf7baafcdd

current session-tree/scripts.mjs (R-T4B)                 17707f0ca1b6147a25cd6a121e444189900f5b06ed512906d43766cda0e01631
full-run-bound session-tree/scripts.mjs (pre-R-T4B)       53b93aebe11ef0a38b41de8b654df2973ba4a82be9a13423c49fb77997f17ac6
```
