# E-FIX-ORACLE-CUSTODY (N3): preserve source mismatch and re-audit

**Outcome: `mixed_change`.** The original E-ORACLE audit-source hash mismatch is preserved as an explicit custody fact. The current reconstruction was copied byte-for-byte and independently re-hashed; its unavailable original is not recreated or represented as recovered. A new read-only audit covers the native allocation history recorded at the snapshot and a fresh Node 22 / Go 1.24 replay validates the oracle evidence.

## Custody finding

| Item | SHA-256 / status |
|---|---|
| E-ORACLE closed expected hash for `compiled-children/oracle/audit-native-protocol.mjs` | `7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e` |
| Current reconstruction at the original path | `f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853` |
| Preserved byte-for-byte copy | `compiled-children/oracle/custody/audit-native-protocol.f814c0ae.mjs`, same `f814c0ae…` hash |
| Original pinned bytes | Unavailable; no recovery or reconstruction claim is made |

`XR-ORACLE` is closed with decision `amend`. Its finding identifies this audit script as the sole E-ORACLE source-pin mismatch; its reviewed source and evidence hashes otherwise match. The original E-ORACLE and XR-ORACLE reports and receipts remain untouched. [`mismatch-facts.json`](../../oracle/custody/mismatch-facts.json) records the expected hash, current hash, preservation path, and missing-original status.

## Fresh audit and replay

The new [`audit-native-protocol-current.mjs`](../../oracle/custody/audit-native-protocol-current.mjs) is a read-only audit. It invokes no solver and writes no scheduler state. At the captured coordination snapshot it reconciled seven native epochs, their persisted event records, native constraints and scores, exact weighted assignment scores, capacity and eligibility, pinned workers, accepted spawn records, later dispatches, solver-log objectives, and current job/worker state. The preserved output is [`E-FIX-ORACLE-CUSTODY-audit.json`](../rawlogs/E-FIX-ORACLE-CUSTODY-audit.json); its state snapshot hash is `b24a3c6d27ff01f34527cad2888185da12f771985faa032961e1e5ef4ca8610a`, preserved as [`E-FIX-ORACLE-CUSTODY-native-state-snapshot.json`](../rawlogs/E-FIX-ORACLE-CUSTODY-native-state-snapshot.json).

At that snapshot, E-ORACLE and XR-ORACLE were closed (`XR-ORACLE: amend`); this repair packet, E-HARNESS, XR-DELIVERY, and XR-CHECKER-TESTS were in flight, while XR-FIX-ORACLE-CUSTODY and XR-HARNESS were pending. The audit reports captured status only and does not assert whole-protocol closure.

The audit also reports three XR-ORACLE receipt byte-count metadata differences for reviewer rawlogs. Their SHA-256 values match their receipt pins; the receipt records 1,497 / 224 / 20 bytes while the files contain 1,958 / 238 / 21 bytes. Those original review artifacts were left untouched and the metadata differences are preserved as warnings.

A fresh Go 1.24 CLI run emitted 42 events and 38 Go steps. [`verify-native-current.mjs`](../../oracle/custody/verify-native-current.mjs) accepted it against the independent literal oracle and confirmed byte identity with both N2's fresh trace and the saved E-ORACLE native trace (653,879 bytes; SHA-256 `8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb`). A fresh Node 22 run of the nine oracle tests passed.

## Commands and results

| Command | Result | Evidence |
|---|---|---|
| `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-children/oracle/custody/audit-native-protocol-current.mjs` | Exit 0 | `rawlogs/E-FIX-ORACLE-CUSTODY-audit-check.*.log` |
| `/tmp/gondola-node22/node_modules/node/bin/node compiled-children/oracle/custody/audit-native-protocol-current.mjs` | Exit 0; seven epochs reconciled; three receipt byte-count warnings; no audit errors | `rawlogs/E-FIX-ORACLE-CUSTODY-audit.json`, `.stderr.log`, `-exit.log` |
| `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-children/oracle/custody/verify-native-current.mjs` | Exit 0 | `rawlogs/E-FIX-ORACLE-CUSTODY-verify-native-check.*.log` |
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/oracle/oracle.test.mjs` | Exit 0; 9 passed, 0 failed | `rawlogs/E-FIX-ORACLE-CUSTODY-node-tests.log` |
| `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json` | Exit 0; fresh trace | `rawlogs/E-FIX-ORACLE-CUSTODY-native-fresh.json`, `.stderr.log`, `-exit.log` |
| `/tmp/gondola-node22/node_modules/node/bin/node compiled-children/oracle/custody/verify-native-current.mjs` | Exit 0; 42 events, 38 steps, literal state/view assertions and byte comparison passed | `rawlogs/E-FIX-ORACLE-CUSTODY-native-verify.json`, `.stderr.log`, `-exit.log` |
| `/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/E-FIX-ORACLE-CUSTODY-receipt-validation.py` | Exit 0; native receipt identity validation plus all source, report, and referenced rawlog pins matched | `rawlogs/E-FIX-ORACLE-CUSTODY-receipt-validation.log` |

Toolchains reported Node `v22.23.4` and Go `go1.24.0 linux/amd64`. Node printed the environment's `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning; the checked commands still exited 0. The closed E-ORACLE report retains its earlier expected test-first `ERR_MODULE_NOT_FOUND` red run and corrected Go executable path probe (exit 127); these are historical author logs, not failures from this fresh replay.

## Boundary

This packet updates only custody evidence, a new read-only audit, and its verification logs. It does not edit the original E-ORACLE/XR-ORACLE packet, scenario, expectations, or oracle implementation; it does not call the native scheduler solver or write native state. It is ready for independent review. Whole-protocol closure and mounted browser parity remain outside this packet.
