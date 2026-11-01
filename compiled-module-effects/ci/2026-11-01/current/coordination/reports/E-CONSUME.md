# E-CONSUME — Independent archive consumer acceptance

**Outcome:** `mixed_change`  
**Qualification:** `clean_archive_acceptance / passed`  
**Status:** passed; published-Git readback is a separate Stage 2 gate.

## Frozen consumer and execution identity

The executed Python consumer was v5, SHA-256 `8885db084bb46f420bd600c4346a87f196fa44d57ce9241393aa567708546e01` (121027 bytes). The executed browser consumer is the audited v4 runner, SHA-256 `947e92caa4a7856e8f0cf434d9401bb8218296859481ae7eebddcfd515e48d1c` (28493 bytes). Both are now at the canonical external paths `/tmp/module-effects-publish/consume.py` and `/tmp/module-effects-publish/consume-browser.mjs`; their hashes match the executed versioned candidates. The previously canonical consumer files were preserved as `/tmp/module-effects-publish/consume-before-E-CONSUME-v5.py` (SHA-256 `c1d7fed5afb75ca2cecbed4df8ddca50890d3cafd60dd5b0bfbc032e2a1e8a82`) and `/tmp/module-effects-publish/consume-browser-before-E-CONSUME-v5.mjs` (SHA-256 `426174dfe05fb2eb91666a713f7bafee06844c002612e59b086ff5e39577129e`). The N1 restore adapter used from the strict package is SHA-256 `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98` and matches `/tmp/module-effects-publish/restore.py`.

The exact argv and environment are in [the prelaunch snapshot](../rawlogs/E-CONSUME/portable-e093-v5-attempt02-prelaunch.json), SHA-256 `aaf3c9986dddd816502a6871000779413a550e230db6e30b9df9030563154968`. Execution used Python `Python 3.12.14`, Go `go version go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `Chromium 153.0.8010.0`, and Playwright `1.64.1`. Native replays ran with `GOPROXY=off`, `GOSUMDB=off`, `GOTOOLCHAIN=local`, and `GOWORK=off`. The native build cache was explicitly set to the named, excluded `go-cache/` evidence directory.

## Clean source-bound archive

The archive was produced from source commit `e0933465725e470dc610e3f81b4bbee95538c1d0`. The clean producer receipt confirms HEAD at that commit, a clean worktree, `202` matching Git source pins, and `58` pinned test-source files with no mismatches. The archive has `639` regular-file members and `99726798` expanded bytes. The frozen N1 restore tool read the strict nine-part package, verified its manifest and source pins, and extracted into a fresh destination without remote downloads. The relocated module loader was imported from the extracted source tree; no original-checkout loader fallback was used.

| Input | Bytes | SHA-256 |
|---|---:|---|
| Archive | 8667568 | `7eb9f28fc6504bf43207436dfc916549bb28e34059cee69bc138376be7940087` |
| Manifest | 160965 | `457073a81f1c93ba0edfe51b06667bb39f9baed95fd32ad3a9c630f9f476b1b9` |
| Clean producer receipt | 716076 | `31e60be9b368330a4d98040c0bd1f80a84b02d6eeb5cdea84ef12906db82e3bc` |
| Strict package index | 1798 | `81c4be5c700f77a39146bf6bebf5f7105cff0606f98a25472944553f1f4ef34d` |

The archive and producer evidence are referenced by path and hash, not duplicated in raw logs. Extraction verified all `639` members and `202` source pins. The restore result’s integrity scope is SHA-256 consistency; it does not establish publisher authenticity.

## Offline native replays

The Go 1.24 native implementation was built from extracted source with network lookups disabled. For each archived scenario, the new output matched the archived native JSON both byte-for-byte and after canonical JSON normalization.

| Scenario | Events | States | Effects | Transport rows | Output bytes | Byte + canonical equality |
|---|---:|---:|---:|---:|---:|---|
| literal | 31 | 32 | 10 | 20 | 1103548 | yes (`dffa1412facedeb3d5047f0def6f297dfe296c8ca070a3519a606e50a668ebc8`) |
| seed-20261104 | 49 | 50 | 16 | 32 | 1725597 | yes (`ed159ea4632a5b97a73dfda9fedacba4bd9f99d24c243c8c73f2a4c5a6eee088`) |
| seed-20261105 | 50 | 51 | 17 | 34 | 1759808 | yes (`433fa0a95bb698e1a3f1454b9ba77465a6b7b7b4b6c3514da1d92587c8d4fe63`) |
| seed-20261106 | 48 | 49 | 15 | 30 | 1690047 | yes (`7cba08cfef429a07ab50f1b850c9aa55205f1042df5c08b7f621e702471aa33a`) |

## Relocated compiled-module checks

All eight direct profiles ran using the loader and compiled artifacts from the extracted archive. Each output matched its pinned archived capture byte-for-byte and canonically. Rows and hashes come from the actual Node output; the complete summary is preserved under `rawlogs/E-CONSUME/accept-portable-e093-v5-attempt02/`.

| Scenario | Profile | Events | Snapshots | Output SHA-256 | Byte + canonical equality |
|---|---|---:|---:|---|---|
| literal | direct.react | 31 | 32 | `b8a9496ba720f171827ce62952de9315abe0702ae3f0843c3989de9c229fabef` | yes |
| literal | direct.dom | 31 | 32 | `d8bc8feed3520d7fd731b16fdd5e6762eed64cc62878852c09809d0e8dafb84d` | yes |
| seed-20261104 | direct.react | 49 | 50 | `8f183254ccb46b4ffc492de8649561431d090cda51092302028a53ee7034e65b` | yes |
| seed-20261104 | direct.dom | 49 | 50 | `a90da1ac03740b65eb9aa12765ff6f6d8d87a4c5f80608af4f2fdc1ea743794c` | yes |
| seed-20261105 | direct.react | 50 | 51 | `0841086004b621671946e0bcda0564212b4043ec4ef7c687d4c70f468d010ce7` | yes |
| seed-20261105 | direct.dom | 50 | 51 | `199df9db30d5a572ed42eebddcc3f0ae7691e86d14e295f7a2038d7393106459` | yes |
| seed-20261106 | direct.react | 48 | 49 | `d5c446616a382aa90156b3fedb233b250742d5178d52790a2cb8d718d5f333c8` | yes |
| seed-20261106 | direct.dom | 48 | 49 | `3df950b592884d87b5e8b902c1dd821ceefc931251e4da13300550f579f2555c` | yes |

## Archived browser demo

The self-contained archived demo loaded with HTTP 200 in Chromium 153.0.8010.0 / Playwright 1.64.1. It completed 6 steps using 12 `HTMLElement.click()` activations, exercised 3 renderer swaps and 2 timer replies, and removed `b:g1` before remounting `b:g2`. Four request observations were local (two browser URL observations and the corresponding two local server responses); external attempts were blocked and zero were observed. Page errors, console errors, failed requests, and HTTP errors were all zero. Request-start observations confirmed the Go pending token and the rendered Saving/disabled Save/enabled Cancel state.

The post-timer/swap/remount screenshot is [illustrative-demo.png](../rawlogs/E-CONSUME/accept-portable-e093-v5-attempt02/node-results/illustrative-demo.png), 128427 bytes, SHA-256 `536b9c0beafc2d467af29fa1fa0e1c776218f4b47ad6f59ac2ae8c3ce6554510`. It is illustrative; pixel equivalence was not asserted. Browser activation was programmatic `HTMLElement.click()`, not trusted pointer or OS input.

## Consumer contract repair evidence

The v5 consumer validates the execution snapshot’s complete counts and command schema, exact counts and command binding to the producer receipt, the 64 capture-mutation applications over 16 IDs, all eight scenario/backend rows, content hashes, canonical-vs-byte equality, browser steps/requests/errors, and screenshot integrity. Preflight probes were:

- 45/45 count, command, receipt binding, and mutation-control schema probes passed. These are schema/author-fixture checks, not a clean-run substitute.
- 9/9 lifecycle-order probes passed; the removal ordering was scoped to the exact `b:g1` unmount event (`stateEventIndex=10`), avoiding the unrelated earlier same-child state commit at index 9.
- 40/40 Node-summary shape probes passed against the actual completed v4 Node output fixture. They cover the nested `direct.profileResults` shape and reject top-level-only misnesting, absent/duplicate rows, count mismatches, bad pins, and malformed browser summary details. This preflight result is not itself acceptance; the final v5 acceptance below replayed the entire clean archive.

The earlier E-ACCEPTAUDIT reproduced that the pre-v3 consumer accepted poisoned execution counts and commands. That original red evidence remains preserved. E-CONSUMEV4AUDIT accepted only the v4 preflight; it did not review the v5 summary-shape repair. Full independent review of this frozen v5 packet remains pending.

## Preserved rejected attempts

These are retained as diagnostic evidence and are not counted as passes:

- F6 v3 attempt 02 stopped at offline Go build because `GOCACHE` was unset in a fully sanitized environment. Later runs used a named local cache with all Go network lookup variables off.
- F6 v3 attempt 03 restored the old 638-member archive and passed four native byte/canonical replays, then failed relocated direct loading because its archived loader required the original build-context path. The subsequently source-bound portable run contains the reviewed relocation repair.
- The recorded-original-checkout fallback attempt 04 is a **not-run disposition**, not an execution; it was explicitly stopped before launch to enforce extracted-source loader use.
- Portable e093 v4 completed the Node direct/browser work but Python rejected the actual nested summary shape (`direct.profileResults` was not at the top level). V5 corrected that schema check.
- Portable e093 v5 attempt 01 stopped before restore because it referenced a restore tool outside `--package-root`. Attempt 02 used the pinned local package adapter and passed end-to-end.

## Result and limits

The v5 consumer accepted the clean E-RUNPORTABLE archive: 639 members, 202 source pins, and 58 test-source pins; all four offline Go replays, all eight extracted-source direct profiles, and the actual archived Chromium demo passed. This acceptance establishes archive/member/source hash consistency and behavioral replay under the recorded environment. It does not establish publisher authenticity, a trusted user-pointer interaction, or screenshot pixel identity. No published-Git readback was performed in this stage; root will run that separate post-packet check.

The exact success JSON is [consume-summary.json](../rawlogs/E-CONSUME/accept-portable-e093-v5-attempt02/consume-summary.json), SHA-256 `24aae206e8f41b41a6fbaf88e6b09dfaa326acc5874dd0a4406ae00881890b84` (293081 bytes). The prelaunch snapshot pins all executed scripts, package metadata/parts, input archive, manifest, producer receipt, environment, and argv. Raw evidence is indexed at [index.json](../rawlogs/E-CONSUME/index.json), SHA-256 `cce644aae575f5a1668941023c26121046e009f3a2bd6aa7ad6f8d99f19c0348` (405329 bytes); the index excludes itself and explicitly identifies the generated Go cache.
