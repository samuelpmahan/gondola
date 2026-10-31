# XR-FIX-SEEDED-ASSERTIONS (N4): review of the seeded checker repair

**Decision: `accepted`.** N3's change addresses the XR-CHECKER-TESTS amendment: the relevant generated batches are checked as complete operation tuples, and the maximum live-key bound is derived from valid input operations and parent lifetime. The checker remains input-only. The exact amended source hash is `404a94cb93f4c0f1646062b1ddcb283084b7f6e00a776f687ec513659542ec83` before and after fresh Node 22 tests.

## Finding closed

The original XR-CHECKER-TESTS finding identified two gaps in `seeded.test.mjs`: batch assertions compared arguments without requiring the intended message names, and `maximumChildren` was trusted as declared metadata instead of derived from the emitted schedule. The repair closes both gaps.

- It deep-compares each `child.add`, duplicate add, `counter.add`, `child.request`, and duplicate request row, including `kind`, `message.name`, and `message.arg`. Replacing the first expected add with `child.remove` is rejected.
- Its input-only occupancy pass starts from contract keys `oak` and `elm`, adds only valid keys while the parent is alive, and uses a set so duplicate additions do not increase occupancy. Invalid `BadKey` and the unknown removal do not increase occupancy; valid removal deletes a key; `children.clear` empties the set; `parent.remove` empties it and marks the parent dead; child additions while dead are ignored; and `parent.remount` reopens an empty parent. A repeated remount of a live parent leaves its current set intact.
- The generated schedule clears the initial pair, adds six distinct keys, and reaches exactly six live keys. The test requires the derived maximum to be six and requires `metadata.bounds.maximumChildren` to equal that derived value. Changing the metadata to derived-plus-one is rejected.
- The helper does not compute counters, child generations, effects, replies, or Go transitions. The test imports only Node's assertion/test modules and the schedule generator; it neither imports a browser runner nor creates browser capture data.

These checks answer the previous coverage finding. They remain regression checks for this bounded deterministic input generator, not a general verifier for arbitrary scenario files.

## Fresh verification

The fixed source hash was verified before and after the targeted run. Node `v22.23.4` ran exactly this command:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/conformance/seeded.test.mjs
```

Result: **4 passed, 0 failed**. This includes deterministic/default seed schedules and varied key order, wrong-operation rejection, lied-bound rejection, accepted uint32 boundary seeds, and invalid-seed rejection. Node emitted the environment's `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning; the test process exited 0. Captured stdout, stderr, exit status, version, and source-before/after hashes are in [`XR-FIX-SEEDED-ASSERTIONS-20261031-01`](../rawlogs/XR-FIX-SEEDED-ASSERTIONS-20261031-01/).

The pre-repair source/report/receipt mapping in `E-FIX-SEEDED-ASSERTIONS/originals/manifest.json` was recalculated. The original 6,679-byte seeded test copy matches SHA-256 `0432bd947e3c3bcf7363e334bf6e267a32b4d57f68b012467626150de6997559`. The original E-CHECKER-TESTS report and receipt still match both their preserved copies and manifest hashes. The repaired source remains distinct and matches the E-FIX source pin. See [`custody-map-check.log`](../rawlogs/XR-FIX-SEEDED-ASSERTIONS-20261031-01/custody-map-check.log).

## Boundary

This review ran only the targeted seeded test file. It did not rerun native Go, direct compiled modules, browser captures, or the full delivery pipeline. The amended source was not edited. No Go application model, fake browser result, Git state, or native coordination state was written by this review.
