# XR-FIX-ATTEMPT-FRESHNESS (N5): review the invocation-time repair

**Decision: `accepted`.** The N1 repair closes the one-millisecond gap identified by XR-FIX-INHERITED-GATE while preserving the receipt-time, source, artifact, snapshot and schema guards. The focused Node 22 suite passed all 13 tests.

## Review result

The amended validator now checks the attempt-directory timestamp against both the producer `startedAt` and the inherited invocation start. `parseTime(invocationStartedAt)` provides the numeric invocation boundary; the existing checks still require `startedAt >= invocationStartedAt`, `attempt <= startedAt`, and no more than 60 seconds between attempt time and `startedAt`. The added lower bound rejects `attempt < invocationStartedAt`.

The N2 witness used attempt `12:00:01.000`, invocation start `12:00:01.001`, and producer start `12:00:01.002`. That pre-invocation attempt is now rejected. The tests also accept an attempt equal to invocation start and one millisecond after it. The code diff is limited to passing the invocation boundary into `parseAttemptTime` and adding the lower-bound rejection; the test diff adds the two boundary cases. Existing byte/hash, source stability, immutable snapshot, artifact inventory and schema adversarial checks remain in the 13-test suite.

## Independent verification

- Node `v22.23.4`: `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/inherited-acceptance.test.mjs` — **13 passed, 0 failed**.
- The one-millisecond-before test passed by observing the required rejection; the equal and one-millisecond-after test passed by accepting those inputs.
- Current validator and test SHA-256 values match the N1 repair receipt: `bb78a18b…68ffc` and `a6fc52c6…8c3a7`.
- The original manifest (1,322 bytes; SHA-256 `a2e567cc…c7685e`) matches its repair receipt. All four preserved source/receipt/report copies match their manifest sizes and hashes.
- Of the 11 source artifacts pinned by the original XR-FIX-INHERITED-GATE receipt, nine still match. The only expected pre-repair differences are the validator and its test file; their pre-repair bytes are preserved. The XR-FIX-INHERITED-GATE receipt and report themselves still match their original pins.

The source and manifest checks are captured in [`N5-XR-FIX-ATTEMPT-FRESHNESS-source-audit-final.log`](../rawlogs/N5-XR-FIX-ATTEMPT-FRESHNESS-source-audit-final.log). The targeted test output, stderr, exit code and Node version are in adjacent `N5-XR-FIX-ATTEMPT-FRESHNESS-*` rawlogs. Node emitted its experimental `EnvHttpProxyAgent` warning; the test command exited 0.

An earlier preliminary audit log is retained unchanged. Its per-file hash lines were correct, but its final summary overstated the expected historical pin differences. The final audit log above corrects that summary: the old XR-FIX receipt and report pins match; only the two repaired code/test pins differ.

## Scope

This review checked the bounded validator repair against the XR-FIX amend, the N1 repair receipt/report, and all four preserved originals. No production, runner, Go module, original receipt/report, Git or native scheduler state was edited. The full inherited delivery pipeline was not run; this review accepts the freshness repair based on the targeted tests and source/preservation checks only.
