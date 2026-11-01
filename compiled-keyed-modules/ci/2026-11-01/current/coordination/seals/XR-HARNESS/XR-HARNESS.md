# XR-HARNESS independent review — N3

**Decision:** `accepted`  
**Reviewer:** N3  
**Reviewed job:** E-HARNESS (author N4)

## Sealed inputs and source pins

The sealed E-HARNESS report and receipt hashes match `seals/E-HARNESS/seal.json`: report `489c75d4f51fa792162cd47b88424062f8fcd82e89ca6c7a43d95a3c2019b6f7`, receipt `4e2f91aa2ffed38b8188d3d36df425117fbefefda39a723e3b7d224b2de85940`. All eight owned conformance sources match the sealed path, byte-count, and SHA-256 inventory. The offline reviewer also verified the E-BUILD-final build index and the keyed parent, native CLI, host, and oracle source dependencies. Its source verification record is `rawlogs/XR-HARNESS/offline-review.stdout.json`.

The final E-HARNESS summary is 71,328 bytes, SHA-256 `b8fa47c2f57c4b011312607cdf3cc029c3c583c9af4bdd99ff68eddc1a48dde1`; the check file reports `matched` and pins that summary with SHA-256 `78f374a187e2b2003b76c66d5a8e89576fa7e4c390ba5d2dd051c972b96850b2`. The actual build index remains 84,891 bytes, SHA-256 `75df29c02218fab47294454bb0338a720d806901d64377b4cae024fd4f6a2e66`.

E-HARNESS records the oracle dependency at its earlier source hash `0a10bac1…`. The later sealed E-ORACLE source is `0c5264035ff00099b0da57209fb38b773a7dce7f0a88e84f3fa36b3724912be8`; I verified its seal, all three source pins, and its successful actual-capture replay (`9121c9428e50c8facc6db222a3cfbafd48bfac10346574437c89d65db22a6c10`). That replay used the same E-HARNESS summary hash above. I then independently reran the current sealed oracle checks over the actual saved files.

## Offline replay of actual saved captures

I loaded each capture from the paths and hashes in `run-final.summary.json`; verified the per-backend files against their combined capture and each saved browser profile against its aggregate; then called the native semantic oracle and parity checker for every scenario. The independent check also rendered each native `NodeRecord` tree to normalized HTML and matched it byte-for-byte against every browser `outerHTML` capture. It compared actual browser control paths, keys, tags, and disabled values against the native Go tree.

| Scenario | Seed | Events | Native checkpoints | Direct profiles | Mounted profiles | Exact browser DOM snapshots |
|---|---:|---:|---:|---:|---:|---:|
| `keyed-modules-literal` | — | 18 | 19 | React, DOM | React, DOM, swap | 162 |
| `keyed-modules-seed-20261101` | 20261101 | 36 | 37 | React, DOM | React, DOM, swap | 324 |
| `keyed-modules-seed-20261102` | 20261102 | 36 | 37 | React, DOM | React, DOM, swap | 324 |
| `keyed-modules-seed-20261103` | 20261103 | 36 | 37 | React, DOM | React, DOM, swap | 324 |
| **Total** |  | **126** | **130** | **8** | **12** | **1,134** |

All native parent state, controller slots/order/generations/publications, per-key child state/input, and Go view trees matched. Both direct backends matched the native state and tree. All three mounted profiles per scenario matched those snapshots, and all actual browser DOM trees matched the rendered Go `NodeRecord` serialization. Scenario names, full scenario payloads/hashes, backend/profile identities, and seed identities matched.

Across the 12 saved mounted profiles, 330 `HTMLElement.click()` actions were captured: 273 enabled clicks invoked one callback and observed the current Go View handler message; 57 disabled clicks invoked zero callbacks. Each disabled click left the host event count and Go call counts unchanged until the harness recorded suppression. The profiles contain 24 retained generation-1 stale callback probes and 24 retained stale publications. Each was fenced with no bridge calls, no module call-order entries, and unchanged call counts.

The browser identity checkpoints show that key `a` and `b` retain logical instance, root element, and Add-control element identities after reorder. Removing `a` leaves `b` intact; remount creates `a:g2` with new logical, root, and control identities. DOM→React and React→DOM swaps keep logical key/generation and child init counts while replacing renderer-owned DOM nodes. The swap profile records eight identity checkpoints.

Healthy replay ran before fault controls. Current oracle independently detected all **11/11 semantic capture controls** and **17/17 build/helper identity controls**.

## Fresh browser and distinct stale fences

I reran a focused literal profile in Chromium `153.0.8010.0` using the actual E-BUILD-final artifacts. The fresh browser result matched all 19 native snapshots across React, DOM, and DOM→React→DOM profiles. Each profile dispatched 14 physical DOM clicks (12 accepted, 2 disabled) and exercised two stale generation callbacks and two stale generation publications. The saved fresh browser capture is 10,578,716 bytes, SHA-256 `db1d7529b1e01268d16cc2e18ddaa3f1cb596168b1911fab65db96018fa43d98`.

The scenario's retained generation probes exercise Go key/generation fencing. To separately exercise the renderer epoch while the Go generation stays current, I ran an additional focused browser probe: mount `a:g1` with the actual compiled DOM pair, swap DOM→React, call the retained DOM dispatch and publication closures, click the current React Add control, swap React→DOM, call the retained React closures, and click the current DOM Add control. In both cases the retained callbacks report `a:g1` but their callback epochs are older than the current renderer epochs (`1→2` and `2→3`); callback and publication are stale with no Go call-count change. Current physical controls still work and advance the same child to count 1, then 2; `childInit` remains 2. This confirms the renderer epoch fence is distinct from the key/generation fence. Chromium and all test output are recorded in `rawlogs/XR-HARNESS/renderer-epoch-probe.*`.

The actual-build host runtime suite also passed 2/2 tests. Its retained callbacks from the current `a:g2` renderer are invoked after a backend replacement while key/generation remains current, independently confirming the host’s epoch test path.

## Commands and versions

The exact review commands, environment, stdout/stderr paths, and versions are in `rawlogs/XR-HARNESS/commands.json`. The principal checks were:

```sh
/tmp/gondola-node22/node_modules/node/bin/node ../keyed-module-coordination/rawlogs/XR-HARNESS/offline-review.mjs
/tmp/gondola-node22/node_modules/node/bin/node ../keyed-module-coordination/rawlogs/XR-HARNESS/fresh-literal.mjs
/tmp/gondola-node22/node_modules/node/bin/node ../keyed-module-coordination/rawlogs/XR-HARNESS/renderer-epoch-probe.mjs
GOBI_KEYED_BUILD_INDEX=/workspace/scratch/39a56936f173/gondola/compiled-keyed-modules/build/output/E-BUILD-final/build-index.json /tmp/gondola-node22/node_modules/node/bin/node --test compiled-keyed-modules/runtime/runtime.test.mjs
```

Versions: Node `v22.23.4`, Go `go1.24.0 linux/amd64`, compiler Go `go1.27.3`, GoScript `v0.6.2`, esbuild `0.28.2`, Chromium `153.0.8010.0`. No full module rebuild was run; the review reused the hash-pinned E-BUILD-final outputs.

The reviewer rawlog inventory is `rawlogs/XR-HARNESS/SHA256SUMS`, SHA-256 `af148459e2c92c0dac50c6544ae5ff8a3f7036e669488ce2e42ef80abb426be8`; all listed entries verified.

## Review notes and limits

The browser evidence is programmatic `HTMLElement.click()` DOM dispatch, not trusted pointer or OS input. The fixture is a finite synchronous two-key (`a`, `b`) profile; asynchronous effects and broader key counts are not tested. The supplemental `ReceiveKeyed` and `IsCurrent` helpers remain source/artifact pinned but outside the unchanged shared AppIR reachability analyzer.

The E-HARNESS captures themselves probe old-generation callbacks/publications; E-HARNESS does not invoke an old renderer callback after a renderer swap. The separate same-generation browser epoch probe above covers that distinct path. Temporary reviewer-script mistakes and their diagnostics are recorded in `rawlogs/XR-HARNESS/reviewer-attempts.log`; none were product or capture mismatches. No E-HARNESS source changes were made.
