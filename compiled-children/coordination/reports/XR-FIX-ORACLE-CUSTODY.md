# XR-FIX-ORACLE-CUSTODY (N4): independent custody review

**Decision: `accepted`.** The E-FIX packet preserves the E-ORACLE audit-source mismatch and its provenance boundary, re-audits the captured native allocation history, and supplies a fresh literal-checked trace. The original pinned `7b124f…` bytes remain unavailable; this review does not accept the reconstruction as those bytes.

## Custody boundary

E-ORACLE closed with `compiled-children/oracle/audit-native-protocol.mjs` pinned to `7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e`. The current reconstruction hashes to `f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853`; the byte-for-byte copy at `compiled-children/oracle/custody/audit-native-protocol.f814c0ae.mjs` has the same hash. The E-FIX receipt and `mismatch-facts.json` state that the original bytes are unavailable and make no recovery claim. I independently verified the current/copy hashes and that the expected and current hashes remain different.

The E-ORACLE and XR-ORACLE reports and receipts retain their pinned bytes. E-FIX’s 71 source pins and 25 rawlog pins all match the files and byte counts on disk. The three stale byte counts in the historical XR-ORACLE receipt are disclosed, not silently reused: that receipt lists 1,497 / 224 / 20 bytes, while the files contain 1,958 / 238 / 21 bytes. The hashes match the historical receipt; E-FIX’s superseding rawlog ledger records the actual byte counts and same hashes. Neither original packet was edited.

## Snapshot boundary and audit

The read-only audit reconciles seven recorded native epochs, 0 through 6, with no audit errors. It reports three XR-ORACLE rawlog byte-count warnings and records that it invoked no solver and wrote no scheduler state.

The audit is tied to the preserved epoch-7 state snapshot, SHA-256 `b24a3c6d27ff01f34527cad2888185da12f771985faa032961e1e5ef4ca8610a`. The snapshot’s status table records E-HARNESS as in flight. At this review, the mutable `coordination/state.json` was at epoch 9, hash `8be7cb7e0c2cffb1ed4eeedf7fa1a2bd5c851be05f2420d000b00b7e8709a3d9`, with E-HARNESS done. E-FIX pins the immutable snapshot and excludes the mutable state file. Its report says “at that snapshot”; the epoch-7 finding is historical and is not represented as the post-closure live state.

## Fresh oracle evidence

I reran the native CLI and the nine oracle tests, then ran `verify-native-current.mjs`. The fresh native trace contains 42 events and 38 Go steps, has SHA-256 `8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb`, and is byte-identical to E-FIX’s trace, XR-ORACLE’s fresh trace, and E-ORACLE’s saved trace. The verifier accepted all literal state and view projections. The Node 22 oracle suite passed 9/9 tests.

## Exact verification commands

- `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json`
- `/tmp/gondola-node22/node_modules/node/bin/node compiled-children/oracle/custody/verify-native-current.mjs`
- `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/oracle/oracle.test.mjs`
- `python3 compiled-children/coordination/rawlogs/XR-FIX-ORACLE-CUSTODY-review.py`

Tool versions were Node `v22.23.4` and Go `go1.24.0 linux/amd64`. The captured command outputs, the complete 71/25 pin recalculation, and hashes are in `compiled-children/coordination/rawlogs/XR-FIX-ORACLE-CUSTODY-review-evidence.json` and the adjacent command logs.

## Review conclusion

Accept the E-FIX custody packet with the historical boundary above. The fresh packet accounts for the mismatch, verifies the available reconstruction without claiming it recovers the missing original, and reports the three historical byte-count discrepancies accurately. The original E-ORACLE source mismatch remains a documented historical fact.
