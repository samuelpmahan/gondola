# E-CHECKER-TESTS (N5): independent checker and seeded-input tests

**Outcome: `mixed_change`.** Added nine Node tests for the native trace checker and seeded schedule generator. The native positive control uses N1's pinned Go trace and the existing literal oracle projections; five mutations are rejected. Seeded tests validate deterministic bounded input schedules and uint32 boundaries without implementing a child-state reducer or claiming browser evidence.

## Checker controls

`conformance/check.test.mjs` calls N4's exported `assertNative` against the actual pinned trace at `fixtures/compiled/children/evidence/rawlogs/native-trace.json` and the independent literal expectations in `oracle/expectations.json`. It first verifies the trace's pinned SHA-256 (`8ad3a28b…baefbb`). The negative cases independently alter:

- a child's counter value;
- a reused key's generation;
- a child's request sequence;
- the order of effects emitted by `children.clear`;
- the full Gobi child node key after the pending reorder.

The checker rejects each corrupted capture. The tests do not construct a browser capture or call browser conformance assertions.

## Seeded input checks

`conformance/seeded.test.mjs` validates that the three default seeds (`20261031`, `20261032`, `20261033`) regenerate byte-equivalent schedules, use distinct key orders, stay within their event/child bounds, and retain the declared edge-case coverage. It checks the physical keyed-child click added by N4 before the tick-free renderer swap, plus duplicate/unknown operations, pending reorder, key reuse with a changed token, child clear, parent removal, stale completions, and remount event ordering. These are schedule-shape checks only; they do not compute expected Go state.

Seed values `0` and `4294967295` are accepted. Negative, out-of-range, fractional, non-finite, string, null, BigInt, and Symbol inputs are rejected. No seeded browser or Go parity is asserted by these two unit files.

## Verification

Toolchains: Node `v22.23.4`; Go `go1.24.0 linux/amd64` (`GOTOOLCHAIN=local`). The pinned native trace SHA-256 is `8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb`; the literal expectation SHA-256 is `d7aa53d48e9cc0e7a462b8fb324e0b52cd9ab4f4038febb12d3c5255878f6774`.

- Both test files passed `node --check`.
- The test suite passed 9 tests with no failures:

  ```sh
  set -o pipefail
  /tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/conformance/check.test.mjs compiled-children/conformance/seeded.test.mjs 2>&1 | tee compiled-children/coordination/rawlogs/E-CHECKER-TESTS-node-test.log
  ```

The first attempt after N4 inserted the physical click failed one seeded schedule assertion because the allowed event-kind list still excluded `click`. The failure is preserved in `rawlogs/E-CHECKER-TESTS-initial-seeded-assertion-failure.log`; the test was updated to cover the new real click and the final run passed. Node emits an `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning; it did not affect command exits.

## Custody annotation

During the preceding E-ORACLE closure, `oracle/audit-native-protocol.mjs` no longer matched the hash pinned in the closed receipt. E-CHECKER-TESTS copied the currently observed 7470-byte file to `rawlogs/E-CHECKER-TESTS-audit-current-custody-copy.mjs` and recorded the expected (`7b124f1f…a2466e`), known transient modified (`28ab2daa…2740c`), and current observed/restored (`f814c0ae…d8853`) hashes in `rawlogs/E-CHECKER-TESTS-oracle-audit-custody.txt`. The original receipt-pinned bytes were unavailable, and the current candidate is explicitly not claimed as an exact restoration. The closed E-ORACLE report and receipt were not changed in this lane.

## Boundary

This lane owns only the two conformance test files, its report, receipt, and rawlogs. N4 retains checker implementation and full direct/React/DOM/browser replay. Root owns native protocol repair, Git, scheduling, and publication.
