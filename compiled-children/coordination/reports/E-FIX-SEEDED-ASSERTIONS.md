# E-FIX-SEEDED-ASSERTIONS (N3): tighten schedule input checks

**Outcome: `mixed_change`.** Addressed the closed XR-CHECKER-TESTS amendment in the sole authorized source file, `compiled-children/conformance/seeded.test.mjs`. The batch assertions now check complete Go-message events, and the declared child bound must match the maximum valid-key occupancy derived from the seeded input schedule and parent lifetime.

## Repair

The seeded checker now compares exact `{ kind, message: { name, arg } }` events for the six-key `child.add` batch, the duplicate add, the permuted `counter.add` batch, the six-key `child.request` batch, and the duplicate request. A wrong operation with the expected argument now fails the coverage assertion.

The input-only bound starts with the contract's live `oak` and `elm`, recognizes the contract key grammar `[a-z][a-z0-9_-]{0,15}`, and tracks only valid `child.add`, `child.remove`, `children.clear`, `parent.remove`, and `parent.remount` schedule inputs. The generated schedule clears the initial pair, adds six unique keys, and never exceeds six live valid keys. Removal/clear reduce the bound; the `dead` add while the parent is removed is ignored, and remount reopens an empty parent. The test requires the derived maximum to be 6 and requires `metadata.bounds.maximumChildren` to equal that derived value.

This helper does not compute counters, effects, replies, Go state, or browser results. The existing physical first-click path checks, deterministic seeds `20261031`–`20261033`, distinct key orders, and accepted uint32 boundary seeds `0` and `4294967295` remain covered.

A new negative-control test mutates the first add event into a remove event and confirms the full-tuple assertion rejects it. It then changes the declared child bound to 7 and confirms the input-derived bound check rejects the lie. These expected assertion failures are caught within the test; the test suite itself passes.

## Verification

Node `v22.23.4` was used for the targeted file only:

| Command | Result | Evidence |
|---|---|---|
| `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-children/conformance/seeded.test.mjs` | Exit 0 | [`E-FIX-SEEDED-ASSERTIONS-node-check.stdout.log`](../rawlogs/E-FIX-SEEDED-ASSERTIONS-node-check.stdout.log), [`E-FIX-SEEDED-ASSERTIONS-node-check.stderr.log`](../rawlogs/E-FIX-SEEDED-ASSERTIONS-node-check.stderr.log) |
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/conformance/seeded.test.mjs` | Exit 0; 4 passed, 0 failed, including both negative controls and uint32 boundary checks | [`E-FIX-SEEDED-ASSERTIONS-seeded-test.log`](../rawlogs/E-FIX-SEEDED-ASSERTIONS-seeded-test.log), [`E-FIX-SEEDED-ASSERTIONS-command-exits.log`](../rawlogs/E-FIX-SEEDED-ASSERTIONS-command-exits.log) |
| `/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/E-FIX-SEEDED-ASSERTIONS-preservation-check.py` | Exit 0; the pre-repair seeded test backup matches its recorded SHA; the prior E-CHECKER-TESTS report and receipt remain byte-identical to their preserved copies | [`E-FIX-SEEDED-ASSERTIONS-preservation-check.py`](../rawlogs/E-FIX-SEEDED-ASSERTIONS-preservation-check.py), [`E-FIX-SEEDED-ASSERTIONS-preservation-check.log`](../rawlogs/E-FIX-SEEDED-ASSERTIONS-preservation-check.log) |
| `/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/E-FIX-SEEDED-ASSERTIONS-receipt-validation.py` | Exit 0; native receipt identity and all pinned source, report, and rawlog hashes/byte counts match | [`E-FIX-SEEDED-ASSERTIONS-receipt-validation.log`](../rawlogs/E-FIX-SEEDED-ASSERTIONS-receipt-validation.log) |

Node emitted the environment's `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning; the syntax and test commands exited 0. No full pipeline or browser capture was run. `XR-CHECKER-TESTS`'s earlier nine-test run and native mutation evidence remain independent review evidence and were not regenerated here.

## Custody and boundary

The pre-repair `seeded.test.mjs`, E-CHECKER-TESTS report, and E-CHECKER-TESTS receipt preserved under `coordination/repairs/E-FIX-SEEDED-ASSERTIONS/originals/` were not edited. The old author report/receipt and all other production code remain unchanged. Only `compiled-children/conformance/seeded.test.mjs` changed; this packet adds its own report, receipt, and rawlogs. No Git or native scheduler state was written. The repaired source is now frozen for N6's fresh harness/source pin and independent XR-FIX-SEEDED-ASSERTIONS review.
