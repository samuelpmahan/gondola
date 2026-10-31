# Compiled Go lifecycle — October 31, 2026

Current source: [`00da54ad0f5a4006b13a5cded18ce291845978bc`](https://github.com/samuelpmahan/gondola/commit/00da54ad0f5a4006b13a5cded18ce291845978bc), tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`, parent `49cc2b96c8817a47319d5b7bd484184a22fa984b`. The parent is the initial milestone checkpoint (tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`). The follow-up changes only the native executable resolver and its four subprocess regressions. [PR #14](https://github.com/samuelpmahan/gondola/pull/14) is stacked on the unmerged compiled-methods PR #13. Main has not been merged or deployed.

**Acceptance checkpoint: hosted CI and independent artifact audits are still pending. This file is being assembled before publication.**

## First hosted checkpoint: failed, retained

Push run [41178420647](https://github.com/samuelpmahan/gondola/actions/runs/41178420647) on `49cc2b96` failed its full lifecycle runner. Its native conformance subprocess tried to execute `/home/runner/work/gondola/gondola/go`: the command-line parser resolved the bare command `go` as if it were a file argument. The local environment supplied an absolute Go path and did not expose this difference. Source pins remained stable.

The fresh inherited chain passed. Both actual GoScript builds, 67 pre-build Node checks, 10 compiled lifecycle runtime checks, direct replay, the three browser profiles, and the 12-check HTTP demo completed. The final conformance comparison was correctly withheld because the native replay did not execute. None of these partial successes make this run green.

The exact failed provider ZIP is retained in `provider/failed-41178420647/`: artifact ID `13034915662`, 47,035,803 bytes, SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`, 1,272 members, 412,381,547 uncompressed bytes. Every CRC and extracted member hash was checked; `members.json` and `retention.json` bind the chunks. The original payload contains complete inherited build outputs even though the runner's inner convenience archive does not. The later command-path repair, its independent review, and fresh CI must remain separate from this failed checkpoint.

The initial source's final status was 28/28 terminal: 26 successful workflows and two lifecycle failures. The PR run failed at the same command-path boundary as the push run. Its separate exact ZIP is retained in `provider/failed-pr-41178477290/` (artifact `13034662119`, 47,017,957 bytes, SHA-256 `294ab76c6e0555e4b42f31b747673070ff4982739735eb7f4ad85fbc6a728128`). Concatenate those chunks to restore `lanes/old-final/artifact-13034662119.zip`; its loose duplicate is excluded from Git. The original 07:26 pending snapshot remains immutable beside the later terminal supplement.

The resolver fix was reproduced RED, corrected, tested and independently accepted before publication. Fresh current-source CI is [push 41181505234](https://github.com/samuelpmahan/gondola/actions/runs/41181505234) and [PR 41181508994](https://github.com/samuelpmahan/gondola/actions/runs/41181508994), with the full 28-workflow set recorded under `fixed/`. Current-source hosted acceptance remains pending.

## What changed

The existing Go counter now participates in a finite, value-owned Parent → Child → Grandchild subtree beside an independent Sibling. The actual Go package supplies Init, Update, and View to both GoScript builds. There is no JavaScript application reducer. A typed Go effect slice passes through the generated type encoder; the host manages request correlations and renderer replacement.

Removing Parent emits cancellation in Grandchild → Child → Parent order and leaves Sibling pending. Remount creates a fresh generation. Go rejects stale, unknown, and duplicate completion messages; retired host callbacks are rejected before another Go tick. Request tokens derive from actual generation/request IDs, with safe-integer exhaustion guards. The optional closed lifecycle effect policy leaves the ordinary compiled host's strict default policy intact.

## Reproduce and inspect the demonstration

Use the published source above, Go 1.24, Node 22, the locked dependencies, and Playwright Chromium. The compiler selects Go 1.27.3 through GOTOOLCHAIN. Full reproduction:

```sh
git clone https://github.com/samuelpmahan/gondola.git
cd gondola
git checkout 00da54ad0f5a4006b13a5cded18ce291845978bc
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
bash run-compiled-lifecycle.sh
```

The runner prints its unique attempt path under `compiled-lifecycle/builds/attempts/`. Serve that successful attempt's `demo/site` directory with `python3 -m http.server 8000 --directory <attempt>/demo/site`, then open `http://localhost:8000/`. The demo exposes Go state/view, pending replies, lifecycle effects, swaps, and the trace. Add counts in any scope, request replies, swap React/DOM while pending, remove/remount Parent, and try retired replies. The smoke test executes this sequence over HTTP. No production site was deployed.

The retained final repair-local build can also run without recompiling. From this evidence directory:

```sh
cat local/accepted-repair/artifacts.tar.gz.part-* > /tmp/lifecycle-repair.tar.gz
printf '%s  %s\n' f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf /tmp/lifecycle-repair.tar.gz | sha256sum -c -
mkdir -p /tmp/gobi-lifecycle-demo
tar -xzf /tmp/lifecycle-repair.tar.gz -C /tmp/gobi-lifecycle-demo
python3 -m http.server 8000 --directory /tmp/gobi-lifecycle-demo/demo/site
```

`bash run-compiled-lifecycle.sh --lifecycle-only` is explicitly partial: it skips the inherited compiled-methods chain. The full entrypoint includes the inherited static, counter, input, asynchronous/HTTP effect, keyed collection, renderer, multi-root, nested session, typed composition, compiler, backend, and value-method checks.

## Local execution custody

| Run | Result and scope | Retained evidence |
| --- | --- | --- |
| Full parent `20261031T063606056Z` | Failed/invalidated. Its source changed during the long inherited child; it later ran a changed env-required test before building. It is never counted as a full lifecycle pass. | `local/source-coordination/before/full-invalidated/` |
| Its inherited methods child `20261031T063606561Z` | Full inherited runner passed, 17 commands, all 137 recorded source pins match the published files. Independent of the failed parent. | `local/inherited-execution.json`, `local/inherited-logs/`, `local/inherited-latest/` |
| Fresh lifecycle-only `20261031T065111036Z` | Passed, 18 commands, 13 stages, 122 stable source pins. Both actual backend builds, matrix and HTTP demo. | `local/partial-execution.json`, `local/partial-report.md`, `local/partial-manifest.json`, `local/accepted-partial/` |
| Repaired forced-PATH lifecycle-only `20261031T073203120Z` | Passed, 18 commands, 13 stages, 123 stable source pins. Bare `go` executes through PATH; 71 pre-build checks, 10 compiled runtime checks, full matrix and HTTP demo. This remains explicitly partial pending fresh hosted full CI. | `lanes/repair-native-path/green/final-run-receipt.json`, `local/accepted-repair/`, `local/repair-manifest.json` |
| Earlier failed captures, review probes, fixes and reruns | Preserved rather than rewritten into a successful history. | `local/history/`, `local/history-inventory.json`, `local/source-coordination/` |

The accepted partial replay matched 26 states/ticks across native Go, direct compiled execution, React, DOM, and the swap profile: 16 physical clicks, 17 swaps, seven requests, three cancellations, 18 detached-button probes, and eight detected mutation controls. There are 32 retired-renderer callback probes across 16 eligible swaps. The remaining swap had no prior callback to retire and only establishes its other state/root/pending-preservation checks. The HTTP demo passed 12 checks with 24 Go ticks and four swaps, with no browser/console/network/runtime errors or WASM requests.

The stronger separate live-reply supplement injects three old Go messages while generation-2 requests are already pending, and calls three retired callbacks. Complete state, view, and correlations remain unchanged; fresh replies still complete. It was rerun independently against native and actual compiled modules. This is headless host evidence, not an additional browser replay. See `local/source-coordination/live-reply/` and `reviews/xr-live-reply/` within that same directory.

Local versions: Go 1.24.0; compiler Go 1.27.3; Node 22.23.4; npm 11.9.0; React/React DOM 19.3.1; Playwright 1.64.1; esbuild 0.28.2; Chromium 153.0.8010.0. The new lifecycle scenario is a fixed literal script, not a random seeded experiment. Hosted versions and inherited seeds must be read from the hosted evidence below.

## Retained archives

Each archive directory contains `retention.json` with exact total and per-chunk bytes and SHA-256. Concatenate chunks in lexical order before checking and extracting:

```sh
cat local/history/artifacts.tar.gz.part-* > /tmp/lifecycle-history.tar.gz
printf '%s  %s\n' 09d8f49c7d039a44ad0ba1e10973aaa1d2a7c561c6972f05d1ceb24dba47f4a6 /tmp/lifecycle-history.tar.gz | sha256sum -c -
cat local/accepted-partial/artifacts.tar.gz.part-* > /tmp/lifecycle-partial.tar.gz
printf '%s  %s\n' 2e674d3d7f43576a0f9052f6164e83f3312933112eaf72fa3348a29d3db22f47 /tmp/lifecycle-partial.tar.gz | sha256sum -c -
```

History is 20,398,966 bytes, 353 members (261 files, 92 directories). The partial archive is 14,757,397 bytes, 719 members. Full member inventories and hashes are retained. The partial archive does not claim to contain all inherited nested builds; the failed parent's convenience copy omitted 138 nested build files. The hosted workflow's complete raw upload is the final custody gate. The historical inventory reports equal before/after scans, but the separate original scan snapshots were not retained; archive bytes and current member hashes were independently checked.

The final repair-local archive is 14,757,771 bytes, 719 members. The separate 5,132,490-byte RED archive in `local/repair-red/` retains the 16 original command-path reproduction files, including the large browser captures excluded from Git's expanded tree. Its SHA-256 is `509092e6c725535b9ff27f24eafc0f5724558133be65186c0f3b4349eed111e6`; `local/repair-red-inventory.json` records every member. Extract it relative to this evidence directory to restore the original `lanes/repair-native-path/red/` paths. The npm-missing intermediate attempt is recorded as failed, with its exact command logs and receipt retained; its duplicate generated build trees are not separately copied.

The independent repair review's fresh matrix is separately retained in `local/review-native-path-matrix/`: 5,141,857 bytes, SHA-256 `447d1a3450d7a46986e7d984f7eb966c4bdcc31c51aaf2c4f69fa98d4fd12449`, 12 files inventoried in `local/review-native-path-matrix-inventory.json`. Extract relative to this evidence directory to restore the large `lanes/review-native-path/matrix/` captures excluded from the expanded Git tree.

E-RESTORE reassembled the final repair archive, verified all 719 members (168,200,217 uncompressed bytes), restored into a fresh directory, and passed the existing 12-check HTTP smoke. It observed 24 ticks, four swaps, three HTTP 200 assets, complete final state/view/effects, stable site pins, and no browser/network/WASM errors on local Chromium 153. Its author packet in `lanes/restore/` remains intact.

The first independent XR-RESTORE reviewer ran an extra check after the output freeze and overwrote its own script/JSON records. Its frozen report and receipt remain preserved, but the previous raw script/JSON bytes were not separately backed up and cannot be hash-revalidated. That review is excluded from final acceptance. The newer actual capture is quarantined at `lanes/restore-custody/before-repair/`; the custody catalog records exactly which references match or were lost. A separate independent replacement acceptance is required. No application source or Milestone 0 receipt changed. This gap is not presented as recovered historical evidence.

Copied `.go` and `.test.mjs` review snapshots under `local/source-coordination/` have a `.txt` suffix to avoid default test discovery. `custody.json` maps original to retained paths and hashes. Historical archive paths remain exact.

## Coordination and review

The platform advertised seven concurrent slots including the lead. Six actual Luna 6 workers at XHigh were spawned and ran concurrently on disjoint fixture, runtime, harness, oracle, demo, and build lanes. Native Rebalancer 1.0.4 allocated packets; actual platform delivery is recorded separately. No additional capacity or automatic solver-to-agent dispatch is claimed.

All 26 source packets closed, including independent review and explicit repairs. Original `amend` reviews remain visible and are closed by subsequent repair/acceptance packets. One live-reply review's native start event was missing from the mutable projection despite actual delivery and accepted review. The exact prior projection is preserved; root reconciled that single completed job manually without inventing a native finish or replaying work. See `local/source-coordination/projection-recovery/`. Do not count its duplicate recommendation as another execution.

CI extraction and reciprocal review use six more lanes under `lanes/`, with dependency gates and native assignments in `coordination/`. Five reviewers yielded after preflight while the provider artifact was absent; those provisional notes do not constitute CI acceptance.

## Demonstrated boundary and next milestone

The finite synchronous fixture, declared request/cancel descriptors, deterministic host, and tested Chromium profile bound the claims. The AppIR request/reply marker is coarse; it does not negotiate generic cancellation. Another frontend must implement the shared typed module encoder/renderer interfaces plus this closed lifecycle policy, correlation retirement and teardown, then pass the same native/direct/browser matrix, literal oracle, negative controls, and HTTP smoke.

General pointer-based session managers, dynamically sized child ownership, arbitrary Go compilation, real network transport, other browser engines, hydration, IME, concurrent React scheduling, and pixel equivalence remain untested. A coherent next milestone is compiled typed child collections with explicit cancellation capability negotiation, carrying the same subtree lifecycle contract through insertion, reordering, removal, remount and renderer replacement.

The compared Go projection contains tick index, message, dispatch ID, complete typed state, effects, and view. Browser DOM and physical click actions have separate literal checks. Raw `tick.action` metadata on injected Go messages is not compared: direct execution records null while browser host dispatch currently records an empty click descriptor. This experiment does not claim byte-identical complete traces.
