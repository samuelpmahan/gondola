# E-FIX-ATTEMPT-FRESHNESS (N1)

**Outcome: `mixed_change`.** Fixed the inherited-run validator witness by requiring the timestamp encoded in the attempt directory to be at or after `inheritedInvocationStartedAt`, while retaining the existing checks that it is no later than `startedAt` and is at most 60 seconds older than `startedAt`.

## Change

`parseAttemptTime` now receives the already-parsed invocation start time and rejects an attempt path whose timestamp precedes that boundary. This closes the reported one-millisecond gap while keeping the receipt-start and attempt-freshness rules intact.

The validator tests now include the precise witness: attempt `12:00:01.000`, invocation start `12:00:01.001`, and receipt `startedAt` `12:00:01.002`. It failed before the fix because the validator returned success, then passed after the new rejection guard. A positive boundary test confirms equal attempt/invocation timestamps and an attempt one millisecond after invocation remain accepted. Existing validator adversarial cases are retained.

## Verification

- Focused Node 22 validator suite: **13/13 passed**.
- `node --check compiled-children/inherited-acceptance.mjs`: exit 0.
- The pre-fix witness is preserved as an expected red: it exited 1 with `Missing expected exception`.
- All four pre-repair originals in the repair packet match their preservation manifest byte counts and SHA-256 hashes.
- No full runner or combined delivery gate was launched.

Raw outputs and exit codes are under [`../rawlogs`](../rawlogs/). The original E-FIX-INHERITED-GATE packet remains preserved and unchanged. This repair changed only `inherited-acceptance.mjs` and `inherited-acceptance.test.mjs`, plus this report, receipt, and its rawlogs.
