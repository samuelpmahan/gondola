# XR-LIVE-REPLY independent review

**Decision: accepted.** The E-LIVE-REPLY claim is supported for the fixed finite lifecycle fixture and the pinned compiled GoScript host. After generation-2 Parent, Child, and Grandchild requests are live, all three old generation-1 completion messages preserve the full state and View and leave the four current correlations intact. Force-delivered retired generation-1 callbacks are rejected by their retired host correlations, add no Go ticks, and leave state, View, and current correlations unchanged. Fresh generation-2 replies and the still-pending generation-1 Sibling reply complete successfully.

## Independent checks

- Re-ran the original native Go probe and compiled GoScript host probe. Both raw JSON outputs are byte-for-byte identical to the pinned E-LIVE-REPLY captures. The native helper copy in `/tmp` is byte-identical to the retained `.go.txt` source.
- Checked the complete encoded compiled `State` and `View` records in trace ticks 9–12. Tick 9 is the state after the last generation-2 request. Each of the following three direct old `complete` messages has exactly equal full state and view records and empty requested/completed effects.
- Ran a reviewer-only copy of the compiled probe that adds serialization of each before/after snapshot. For each direct stale message and force-delivered retired callback, the typed state, compiled View, effect-driver correlations, and core correlations compare exactly equal.
- Checked the native raw Go output's full typed state after each direct stale completion against the fresh-pending state. It is equal for all fields; its assertions also compare native `View` before/after and require zero effects. The current tokens remain Parent `parent:g2:r5`, Child `child:g2:r6`, Grandchild `grandchild:g2:r7`, and Sibling `sibling:g1:r4`.
- Verified the retired callback correlations point to the original request dispatches `dispatch-0001` through `dispatch-0003`; all active correlations remain Sibling `dispatch-0004`, Parent `dispatch-0007`, Child `dispatch-0008`, and Grandchild `dispatch-0009`. Each forced callback returns `unknown or extra effect completion` without a tick.
- Confirmed exact cancellation order Grandchild, Child, Parent; then fresh replies are accepted in order Grandchild generation 2, Child generation 2, Parent generation 2, Sibling generation 1. Pending queues are empty at the final checkpoint.
- Verified the fixture, host runtime, shared runtime, E-BUILD execution, React build record, build manifest, generated AppIR, encoder, compiled module, and original probe source hashes against E-LIVE-REPLY pins. The generated module and encoder came from the stated E-BUILD attempt, whose execution record says `passed` and `sourcePinsMatch: true`.

## Commands and raw evidence

Working directory: `/workspace/scratch/39a56936f173/gondola`.

| Check | Command | Result |
| --- | --- | --- |
| Native rerun | `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run /tmp/compiled_lifecycle_live_reply_probe.go > compiled-lifecycle/coordination/reviews/xr-live-reply/native-rerun.stdout.json 2> compiled-lifecycle/coordination/reviews/xr-live-reply/native-rerun.stderr.log` | Exit 0; SHA-256 exactly matches E-LIVE raw output `c5a8e19d…`. Go `1.24.0 linux/amd64`. |
| Compiled host rerun | `GOBI_LIFECYCLE_APP_DIR=/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/apps/lifecycle-7e6575d90707 /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/live-reply/compiled-live-reply-probe.mjs > compiled-lifecycle/coordination/reviews/xr-live-reply/compiled-rerun.stdout.json 2> compiled-lifecycle/coordination/reviews/xr-live-reply/compiled-rerun.stderr.log` | Exit 0; SHA-256 exactly matches E-LIVE raw output `544e8e40…`. Node `v22.23.4`. |
| Full before/after compiled snapshots | `GOBI_LIFECYCLE_APP_DIR=/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/apps/lifecycle-7e6575d90707 /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/reviews/xr-live-reply/compiled-probe-instrumented.mjs > compiled-lifecycle/coordination/reviews/xr-live-reply/compiled-instrumented.stdout.json 2> compiled-lifecycle/coordination/reviews/xr-live-reply/compiled-instrumented.stderr.log` | Exit 0; reviewer-only instrumentation adds serialized snapshots and leaves the original trace and effect records equal. |
| Independent raw audit | `/tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/reviews/xr-live-reply/audit-xr-live-reply.mjs > compiled-lifecycle/coordination/reviews/xr-live-reply/audit-result.json` | Exit 0; exact rerun matches, hashes, typed state/View, and correlation assertions pass. |

The main runtime artifacts and original evidence remain unchanged. The compiled probe calls the actual generated `gobi-compiled.mjs` and `encoder.mjs` through `mountLifecycleApp`, which uses the existing compiled host and lifecycle effect driver. Its renderer is headless and the probe's DOM value is only a placeholder. This review makes no DOM or browser claim and does not replace the separate fixed browser matrix.

## Pins

| Artifact | SHA-256 |
| --- | --- |
| E-LIVE native helper source | `0bb17bc85655ab904fba3f0fba0676e927fd3157a92a7bf9a2b86ceb14c51aa7` |
| E-LIVE compiled probe source | `8924ca8a36c7d525e4571a93cb0a8774595a8bd217a7a9bdc360b425ed35b42e` |
| E-LIVE wrapper source | `c5a652081ebd1cc16a1ce50e91aa4defe7dbc8b395586f92334b1f5de476a5e3` |
| Fixture `app.go` / `view.go` / scenario | `6b61e55c3046f58873d2774e38a7bca44769f18f6870c39e1885b78be340fe41` / `afc4b1611c5dbd8e5264d3c124b808770bdd8579fdc1426c350f4df6689bb948` / `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650` |
| Host runtime / shared runtime | `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed` / `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0` |
| E-BUILD execution / React build record | `b0b181c5044b829e4e6d305f8507c447a5e6d2addb29d05c6a1b528ed496976b` / `36c962c08bece3b14d0d4ed2742bda23f6b758675254f90b7ef2041f3ddbbbb7` |
| Build manifest / AppIR / encoder / compiled module | `bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603` / `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` / `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` / `dabbfaea0c8a27ec389008f0820f0b14578337acca6cb60bd491ed2394dc5c6c` |
| E-LIVE native / compiled raw stdout | `c5a8e19d7cf88517d416c7b0f01771585d4260393e5aed8979c764a7489f83ff` / `544e8e4067ab1f7115a8dac7d970a586a3572a4cc3dc0cd231b4a5a57a7af483` |
| Reviewer probe variant / raw output | `88ef0a9948e7edad125637449393dd7ed6ac5f2ace58eb72e6e2c0c853da0078` / `18f4179e929289b13c04820e729090a57264ca7fc007d622cd87ef8126a93bfb` |
| Reviewer audit source / result | `f976c72e9d5dc9cdc5ea8829cbf1b8f2e36c309ab5b37fa40ffcd9ee9717fecd` / `5fb206d8a639bd838b3d2b9fcb3977f664c19c6428b9e53b9c3a232bb3bfef34` |

The scope is the fixed finite lifecycle fixture and one pinned generated module. No generic manager guarantee, browser behavior, CI expansion, merge, or deployment is established by this supplemental review.
