# E-LIVE-REPLY supplementary falsification

**Outcome: confirmed reuse.** The stronger post-remount stale-reply sequence succeeds with both native Go and the actual compiled GoScript module behind the existing lifecycle host. After generation-2 requests are live, direct generation-1 completion messages leave the full application state, compiled Go view, and current pending correlations unchanged. Force-delivering the retired generation-1 callbacks is rejected by the host correlation fence without adding ticks. The generation-2 requests and independent sibling request then all complete successfully.

## Executed sequence and findings

The exact sequence was:

1. Request Parent, Child, Grandchild, and Sibling in generation 1 (`parent:g1:r1`, `child:g1:r2`, `grandchild:g1:r3`, `sibling:g1:r4`).
2. Remove Parent. Go emits cancellation intents for Grandchild, Child, Parent in that order; the sibling request remains pending.
3. Remount Parent, then request Parent, Child, Grandchild in generation 2 (`parent:g2:r5`, `child:g2:r6`, `grandchild:g2:r7`).
4. Before delivering any reply, verify all four current nodes are Pending and the host has the sibling plus all three new effect correlations.
5. Send the old Parent, Child, and Grandchild completion messages directly through Go `Update` and, separately, through the compiled host's ordinary `runtime.dispatch` path. Each direct message is admitted as a no-op Go tick. After each one, exact encoded state and compiled view are unchanged, Go emits no effects, and both driver and core pending correlations are unchanged.
6. Force-deliver the three canceled generation-1 callbacks. Each is rejected as `unknown or extra effect completion`. None adds a Go tick or changes state, view, or current pending correlations.
7. Deliver generation-2 Grandchild, Child, Parent, followed by the still-pending Sibling reply. All four are accepted; each stores its exact reply token and clears its own Pending flag.

The native probe calls the real `fixtures/compiled/lifecycle.Update` and `View`; it does not contain an application reducer. The compiled probe imports the fresh generated `gobi-compiled.mjs` and `encoder.mjs` from E-BUILD attempt `attempt-20261031T065111036Z`, mounts them through the existing `mountLifecycleApp`/`mountCompiledApp` host, and uses the lifecycle manual effect driver. Its headless renderer serializes the actual compiled Go View record. The DOM field is a required host placeholder only; this report makes no DOM or browser claim.

An independent cross-audit compares every state field (including generations, request IDs, ownership flags, tokens, replies, counters, and next request ID) and normalized Go View at the fresh-pending and final checkpoints. Both match between native Go and compiled GoScript. Captured results also show the old cancellation order, exact dispatch/effect correlations, three rejected forced callbacks, four accepted fresh replies, and empty pending queues at the end.

## Commands and toolchains

Repository root: `/workspace/scratch/39a56936f173/gondola`.

| Probe | Command | Result |
| --- | --- | --- |
| Native Go | `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/live-reply/capture-command.mjs native /tmp/gondola-go/bin/go run /tmp/compiled_lifecycle_live_reply_probe.go` | Child exited 0; native `lifecycle.Update`/`View` assertions passed. Go `1.24.0 linux/amd64`; stdout/stderr and child command are retained under `coordination/live-reply/captures/native/`. |
| Compiled GoScript host | `GOBI_LIFECYCLE_APP_DIR=/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/apps/lifecycle-7e6575d90707 /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/live-reply/capture-command.mjs compiled /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/live-reply/compiled-live-reply-probe.mjs` | Child exited 0; all direct stale-message, force-retired callback, pending-correlation, and fresh-reply assertions passed. Node `v22.23.4`; child command, stdout/stderr, and exit code are retained under `captures/compiled/`. |
| Native/compiled result comparison | `/tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/live-reply/audit-live-reply-results.mjs` | Exit 0; cross-audit result is `confirmed`. Output and stderr are retained as `cross-audit.stdout.log` and `cross-audit.stderr.log`. |

The Go helper is preserved as `coordination/live-reply/native-live-reply-probe.go.txt` and copied byte-for-byte to `/tmp/compiled_lifecycle_live_reply_probe.go` for execution. No loose `.go` helper was added under the repository. The compiled probe and cross-audit scripts are preserved beside it.

## Frozen input and artifact pins

The probe uses the source-stable E-BUILD React output directory above. Its `execution.json` records `status: passed` and `sourcePinsMatch: true`; this supplementary probe does not replace or extend that fixed matrix.

| Input/evidence | SHA-256 |
| --- | --- |
| Fixture `app.go` | `6b61e55c3046f58873d2774e38a7bca44769f18f6870c39e1885b78be340fe41` |
| Fixture `view.go` | `afc4b1611c5dbd8e5264d3c124b808770bdd8579fdc1426c350f4df6689bb948` |
| Fixture scenario | `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650` |
| Lifecycle host `runtime.mjs` | `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed` |
| Shared frontend runtime | `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0` |
| E-BUILD execution record | `b0b181c5044b829e4e6d305f8507c447a5e6d2addb29d05c6a1b528ed496976b` |
| React build record | `36c962c08bece3b14d0d4ed2742bda23f6b758675254f90b7ef2041f3ddbbbb7` |
| React build manifest | `bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603` |
| Generated AppIR | `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` |
| Generated encoder | `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` |
| Generated compiled module | `dabbfaea0c8a27ec389008f0820f0b14578337acca6cb60bd491ed2394dc5c6c` |
| Native probe source (`.go.txt`) | `0bb17bc85655ab904fba3f0fba0676e927fd3157a92a7bf9a2b86ceb14c51aa7` |
| Compiled host probe source | `8924ca8a36c7d525e4571a93cb0a8774595a8bd217a7a9bdc360b425ed35b42e` |
| Result cross-auditor source | `1c733ee555dd94a7cab7eeffc9fd18889ede8da1fa6e626fd12313e1b3bcafbd` |
| Native raw output | `c5a8e19d7cf88517d416c7b0f01771585d4260393e5aed8979c764a7489f83ff` |
| Compiled raw output | `544e8e4067ab1f7115a8dac7d970a586a3572a4cc3dc0cd231b4a5a57a7af483` |
| Cross-audit JSON | `4941a6596a737dffe5bcd39aad9a7b142b491f0a03b7f3fdccf4aa42d9c6a101` |

No product or build source was changed for this probe. It is limited to the fixed finite lifecycle fixture and the captured compiled GoScript module; it establishes no browser DOM behavior, generic lifecycle manager support, or broader CI guarantee. No merge, deployment, or publication was performed.
