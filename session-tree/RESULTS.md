# Nested-session execution and scope

Go owns the immutable parent tree, scoped collection state/effects, and atomic child-first subtree disposal. DOM, pinned React 19.3.1, and direct Go/WASM DOM render each collection independently. Child shells live outside the parent renderer's view, so parent replacement preserves mounted descendants.

## Final repaired local checkpoint

The final frozen checker and schedules passed the complete default seeded replay on 2026-10-30. The exact [execution receipt](evidence/final-execution.json), [log](evidence/final-replay.log), and `evidence/final-traces.tar.xz` retain all scenario shards and native envelopes.

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  GO_COMPARE_BIN=$PWD/session-tree/build/compare-interaction \
  node session-tree/check.mjs --output session-tree/build/replay-accepted.json
```

Result: **63 scripts, 1,591 actions, 1,654 global ticks, 5,176 observations per side (10,352 total), 546/546 native comparisons, zero mismatches**. Seeds are `20261030,20261031`, 30 generated cases per seed, maximum 40 generated actions; the three fixed schedules have 29/21/18 actions. All 63 positive and one negative scenario hashes were independently checked, and all 547 native envelopes are nonempty. Summary SHA-256: `b01f01ccb5ede1a98e20fe5f74fa617cd191ca0a2851931a3744e1b6d59497d7`.

The separate real-browser blur control is detected and its one native segment matches. A cancellation-order mutation preserves local transport logs, Go bundles and native frames while reordering actual-call observations; the checker rejects it. Three bilateral mutations of Add-at-cap, Reset-empty and Up-first-row disabled state are rejected through independent state-derived expectations. The fixed stale callback now runs after recreating the same parent/child/grandchild names and leaves the whole fresh tree, snapshots and audits unchanged. Context activation is recorded separately from immediate post-action physical focus; the observer does not restore focus before sampling.

Final Node tests passed **34/34**, and the unchanged external blur probe injected one blur and produced three focus findings. Independent XR-R-T5 accepts the correction, resolving the original amendment; R-T4B/XR-R-T4B bind the stronger schedules. The earlier A-MODEL audit correctly withheld acceptance while this new replay was unavailable. Subsequent trace-closure receipts distinguish that historical limitation from the new evidence. A review-time process visibility observation was unreliable: the execution service still reported running, then confirmed exit zero after shard writing. It was not a failed or restarted replay.

Only the oracle and schedules changed after the complete entrypoint below. Its Go/runtime, inherited regressions, bridge smokes and HTTP demo remain applicable; final affected Node/browser/native gates were rerun. [Final source and asset hashes](evidence/source-assets.json) supersede the separately retained pre-repair pins. This committed evidence predates publication and clean CI; the PR's dated metadata records subsequent remote verification without rewriting the tested tree.

## Complete entrypoint before final oracle review

The complete default runner exited zero on 2026-10-30:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GOTOOLCHAIN=local \
  GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
  bash run-session-tree.sh
```

The flags skip provisioning only; every test gate ran. Toolchain: Go1.24.0 linux/amd64, Node22.23.4, React/ReactDOM19.3.1, Playwright1.64.1, actual Chromium153.0.8010.0. [Environment receipt](evidence/environment.json) records verified Go provenance, failed standard browser downloads, and the temporary Chromium workaround.

| Gate | Executed result |
| --- | --- |
| Milestone 0 | 5,000 static cases, seed20261030; expected receipt and all24 original SHA entries pass |
| Counter | 107 scripts /4,473 ticks |
| Replacement | 103 scripts /5,249 ticks |
| Input | 216 scripts /10,149 observations; native matched |
| Async effects | 76 scripts /1,552 observations; native matched |
| HTTP effects | 82 scripts /1,572 observations; native matched |
| Keyed editor | 70 scripts /1,113 observations; native matched |
| Renderer contract | 71 scripts /1,184 observations;21 positive renders /78 negative atomicity checks; native matched |
| Multi-root | 63 scripts /1,896 actions /1,959 ticks /11,754 actor observations;193 native segments matched |
| New tree gates | Go/race/vet, both actual WASM smokes,28 Node tests, real HTTP demo pass |
| Initial nested replay | 63 scripts /1,587 actions /1,650 global ticks /5,150 observations per side;544/544 native segments; zero mismatches |

Seeds `20261030,20261031`,30 generated cases per seed,max40 generated actions plus three fixed scripts. A separate five-action blur control was detected; its one native segment matched. Expected control findings are separate from parity mismatches. [Full log](evidence/full-run-before-cancel-review.log), `evidence/replay-before-cancel-review.tar.xz`, and `evidence/checker-before-cancel-order-review.tar.xz` preserve the actual run and loaded checker.

This passing run covers its implemented assertions. XR-T5 then required actual cross-session cancellation call order, explicit Add/Reset/Up disabled expectations, and a stale callback after same-name descendant recreation. Its original amendment is retained; the final checkpoint above supplies the stronger checks and execution.

## Reproduction, evidence, and limits

Run `bash run-session-tree.sh`, then `./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .` and open `/session-tree/demo.html`. [Actual demo screenshot](evidence/demo-nested-sessions.png) shows four Go sessions after ordinary row entry. Manual deterministic replay and real loopback HTTP demo are distinct experiments; cancellation invocation order does not imply network/server arrival order.

The earliest failed report declared451 findings but retained250 summaries; full observations and later preflights remain in `evidence/preflight-traces.tar.xz`. A default run failed with `RangeError: Invalid string length` after emitting544 native inputs, without an acceptance summary. The inputs are preserved in `evidence/integration-failure-native.tar.xz`; exact historical pre-sharding source/terminal log were not retained. Current output writes complete hashed scenario shards and an untruncated mismatch artifact; a300-mismatch unit test checks preservation.

Sampling originally hid post-swap focus loss. The unchanged [external blur probe](coordination/probes/focus-loss.mjs) failed before correction and detects it afterward, including collapsed caret0. The fixture now logs activation before an action and captures physical focus immediately afterward, before context switching. Both actors' immediate observations are compared; shared missing channels fail closed. Host reentry during raw disposal and weak fixed focus scheduling were also repaired and independently reviewed; original amendments remain in coordination records.

Go tests establish live-parent admission, immutable metadata, depth limit32, safe monotonic IDs, defensive sorted records, atomic non-leaf rejection, deterministic subtree bundles, stale-ID fences and race-detector coverage. Browser evidence is finite, serialized, and specific to the supported collection profile. Arbitrary component compilation, generic `gobi.Backend.Emit`, typed parent/child application messages, reparenting, shared transactions, hydration, IME, pixels, other engines, production services, committed-transition rollback and GC timing remain untested.

Another renderer must implement the versioned Go renderer manifest and independent-handle lifecycle; admit the supported snapshots/bindings; dispatch declared messages; preserve keyed controlled values and selection; and clean up event routes. It must pass conformance fixtures, independent DOM/property checks and nested browser/native replay. Supporting another application also needs its Go session factory and independent oracle; a general compiler is not supplied. Next: Go-defined parent/child inputs and typed messages across these lifecycle boundaries.

Six Luna 6 XHigh workers filled all six child slots, with the lead in the seventh. Native Rebalancer 1.0.4 allocation, actual dispatch and independent acceptance are separate inspectable [coordination records](coordination/PROTOCOL.md). 646 of 650 older pins remain exact; all four exceptions already existed in PR8. Historic manifests and M0 receipts are preserved. Feature branch `codex/gobi-session-tree-20261030` stacks on PR8 head `6f3bc3057bc67f99580b086e00e34a2dfe7dda22`. Remote publication and fresh CI are recorded in dated PR metadata after this snapshot. No main merge or deployment.

## Historical T6 author checkpoint

The following focused lane report predates the complete run above; its pending statements apply to that earlier checkpoint only.

## Focused evidence

Executed locally with Go `go1.24.0 linux/amd64`, Node `v22.23.4`, and Chromium `153.0.8010.0`:

```sh
node --check session-tree/demo.mjs
node --check session-tree/browser-smoke.mjs
bash -n run-session-tree.sh
node --test session-tree/*.test.mjs
node session-tree/browser-smoke.mjs
```

The JavaScript syntax and shell checks passed. The current session-tree unit suite passed **18/18**. The real Chromium smoke passed against the loopback HTTP lab and current multi-root and GoDOM WebAssembly assets. It mounted DOM parent → React child → GoDOM grandchild plus an independent GoDOM sibling; swapping the parent restored focus and backward selection while preserving the child shell/input, and swapping the child preserved the grandchild shell/input. Disposing the child subtree returned grandchild-first cancellation bundles `[3, 2]`; the HTTP lab observed both cancellations, and both deliberate late releases returned 409. The sibling request completed after family disposal. Recreating the family root allocated ID 5, and replaying the retired callback made zero Go `Complete` calls.

The browser smoke writes the machine-readable witness to `session-tree/build/browser-smoke.json`.

An initial browser run exposed that a queued focus refresh reset a renderer choice before its Apply button ran. The demo now retains the staged renderer selection through refreshes. The smoke also filters the browser's expected console message for deliberate HTTP 409 late releases; the HTTP statuses themselves remain asserted. The final browser run passed after both corrections.

## Runner and remaining gates

`run-session-tree.sh` defaults to `run-multi-root.sh` first, then builds the tree and GoDOM WASM bridges, matching `wasm_exec.js`, React/reference bundles, HTTP lab, and native comparator. It runs relevant Go tests/race/vet, both bridge smokes, all session-tree Node tests, the HTTP browser smoke, and the T5 deterministic replay. The GitHub Actions workflow installs Go 1.24, Node 22, the pinned interaction packages, and Playwright Chromium before invoking that runner.

The default runner was **not run** in this focused lane. At report time, T5 had not yet supplied `session-tree/check.mjs` and `check.test.mjs`, so the final deterministic replay command was not available. The inherited full multi-root and earlier suite, integrated T5/native comparisons, fresh feature-branch CI, and independent T6 review remain unverified here. Run `bash run-session-tree.sh` after the T5 files and cross-review are complete; this report does not claim those gates passed.
