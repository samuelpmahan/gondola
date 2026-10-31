# E-ORACLE (N5): independent keyed child collection oracle

**Outcome: `mixed_change`.** Added an independently authored 42-event scenario, manual expected Go snapshots, Gobi tree and normalized DOM projections, and negative capture controls. The expected states do not run or copy the Go `Update` transition. The native Go trace matches all 38 Go steps.

## Scenario and invariants

The schedule begins with a live parent at generation 1 and children `oak:g2` and `elm:g3`. It counts both children, appends `ash:g4`, confirms duplicate `oak` add is a no-op, requests all three, and moves pending children twice. The final order is `ash, oak, elm`; counts, tokens, and request sequences stay attached to their keys.

At that checkpoint the request button for pending oak is disabled. A compatible DOM → React replacement preserves the three pending requests. The captured DOM callback is suppressed after replacement. An incompatible React candidate is rejected; the retained React callback still increments ash through a real scripted click.

Removing oak cancels only `child:oak:g2:r1`. Re-adding oak assigns generation 5 and a new request token `child:oak:g5:r1`; the old completion is a no-op, while the current oak, elm, and ash replies complete their matching values.

`children.clear` cancels pending children in reverse current order (`child:oak:g5:r2`, then `child:elm:g3:r2`) and leaves `parent:g1:r1` pending. A later `parent.remove` cancels the reverse-order children (`child:oak:g7:r1`, `child:pine:g6:r1`) before `parent:g1:r2`, empties the collection, and rejects old completions. Remount allocates parent generation 8; a new ash receives generation 9 and completes normally.

## Oracle artifacts

- [`scenario.json`](../../oracle/scenario.json) is the independent script, including click paths, direct messages, effect replies, tick-free disabled/stale-callback probes, and compatible/rejected swaps. It structurally matches the N1 native driver's event source.
- [`expectations.json`](../../oracle/expectations.json) contains the 39 Go state checkpoints and each corresponding raw Gobi tree, Go view record, DOM snapshot, event/state/tick mapping, literal effects, and host probes.
- [`oracle.mjs`](../../oracle/oracle.mjs) contains hand-enumerated Go values and pure state-to-view/DOM projections. It has no Go transition reducer. `assertNativeCapture` compares the native output against these independent values.
- [`oracle.test.mjs`](../../oracle/oracle.test.mjs) checks the scenario, snapshots, cancellation order, and captures. Mutation cases alter Go slice order, Gobi keys, DOM text, and child-first effect order; each is rejected by the checker.
- [`audit-native-protocol.mjs`](../../oracle/audit-native-protocol.mjs) is a read-only consistency check for the currently available native allocation records.
- [`evidence/native.json`](../../oracle/evidence/native.json), [`oracle-green.log`](../../oracle/evidence/oracle-green.log), and [`native-protocol-audit.json`](../../oracle/evidence/native-protocol-audit.json) preserve the actual native trace and verification output.

## Verification

Toolchains: Go `go1.24.0 linux/amd64`; Node `v22.23.4`. The fixed scenario has no random seed.

| Command | Result |
|---|---|
| `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json > compiled-children/oracle/evidence/native.json` | Exit 0; 42 source events, 38 Go steps; all 39 independent state/tree projections matched. |
| `/tmp/gondola-node22/node_modules/node/bin/node compiled-children/oracle/oracle.mjs` | Exit 0; generated the static expectation JSON from the manual snapshot/projection source. |
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/oracle/oracle.test.mjs` | Exit 0; 9 passed, 0 failed, including four deliberate capture mutations. |
| `/tmp/gondola-node22/node_modules/node/bin/node compiled-children/oracle/audit-native-protocol.mjs` | Exit 0; epochs 0–1, native assignments, six accepted spawns, pinning, reviewer separation, scores, constraints, and bundle hashes checked read-only. |
| Node `--check` on `oracle.mjs`, `oracle.test.mjs`, and `audit-native-protocol.mjs` | Exit 0 for all three. |

The first TDD test run was the expected red: the test import failed with `ERR_MODULE_NOT_FOUND` for `oracle.mjs` before implementation. A toolchain-path probe for `/tmp/gondola-go/bin/go1.24` also returned exit 127 because that file is absent; the installed binary is `/tmp/gondola-go/bin/go`, which reports Go 1.24.0. Node commands emit the environment's `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning; test and syntax-check exits are 0.

The read-only allocation audit found epoch 0 assigned all six extraction jobs with score 600 and zero constraint violations. Epoch 1 preserved four in-flight workers and independently assigned `XR-GO` and `XR-HOST` to different workers from their authors, with score 400 and zero constraint violations. `XR-GO` and `XR-HOST` were still running when this report was written; `XR-ORACLE` review and root closeout remain pending. The audit reports no seed in allocation artifacts; the oracle event sequence itself is fixed and deterministic.

## Boundary

N5 verified the actual native Go trace against its independent expected state and Gobi tree values. Browser DOM snapshots, mounted callback behavior, and cross-renderer parity still require N4's direct/React/DOM run. Full inherited capability regressions and final native protocol closure remain root/N6 integration gates. This lane did not change the Go fixture, compiler, host, browser harness, scheduler state, branch, or publication status.
