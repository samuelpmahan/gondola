# XR-ORACLELINK — independent follow-up review

**Worker:** N4  
**Job:** XR-ORACLELINK  
**Decision:** `accepted`  
**Finding status:** The two fail-closed validation gaps from the original XR-ORACLE AMEND are resolved in the sealed E-ORACLELINK source.

## Sealed packet and source scope

The E-ORACLELINK report and receipt match its seal. Its two owned files match the sealed inventory and the current worktree byte-for-byte: `oracle.mjs` is 93,905 bytes (SHA-256 `c24b3a7828eb22df65b39bd8090bfc5d96a79dd8cd55fd9db5471d1b74bf0d64`), and `oracle.test.mjs` is 7,704 bytes (SHA-256 `962798dfc1c40e85e24e8b3f44ebe8688004b5df29dda860cdb3d29ba1cac745`). The pinned `scenarios.mjs` dependency also matches. All 24 files in the E-ORACLELINK raw-log index match their bytes and SHA-256 pins; the index itself matches the sealed report’s hash.

The original XR-ORACLE AMEND report, receipt, and E-ORACLE source copy remain intact. E-ORACLE build dependency pins and build-admission scope were not rerun for this follow-up; this review is limited to the oracle repair, saved capture arrays, and Node checks. The old oracle and test sources remain available at their pinned hashes for comparison.

The production-source diff from sealed E-ORACLE adds the reply-link validation helper and calls it from host-ledger validation. It uses each scenario’s expected effects and events to locate request, cancel, and reply rows; it does not branch on `a:g1:r3` or another fixture token. Fixed tokens appear in the focused synthetic unit fixture and in the existing saved-capture mutation controls, where they select known test rows.

## Independent checks

First, I reran the original two red witnesses against the preserved old E-ORACLE source. Both malformed captures were still accepted by that old source, reproducing the original finding. I then reran the same two changes against the sealed E-ORACLELINK source; missing the accepted reply correlation and changing its existing `stateEventIndex` to `999` were both rejected.

The healthy check ran before mutation controls using Node `v22.23.4` and the saved, pinned E-HARNESS attempt-03 captures. All four scenarios matched across five profiles (20 profile checks): 178 native events, 182 states, 58 Go effects, 116 transport rows, 20 lifecycle rows, 890 profile event rows, and 910 snapshots. The original report’s healthy context therefore remains valid with the repair loaded.

I verified the reply contexts directly in the literal `browser.swap` capture:

- The accepted reply carries exactly the request’s `{dispatchId, effectIndex}` correlation and maps `stateEventIndex` to the source event’s `hostEventIndex` and `result.eventIndex`.
- The rejected duplicate carries its original request correlation and points to that request’s state event.
- The rejected canceled reply carries its original request correlation and points to the corresponding Go cancellation state event.

Eleven additional targeted changes were rejected: the two original red witnesses; broken duplicate and canceled state links; wrong correlation types; empty dispatch ID; negative or unsafe effect index; extra correlation field; and reply values that differ from their request. For request-type probes, I changed the request and its paired transport start together so the check exercised the request-field type/range validation rather than failing first on a request/start mismatch.

The full 16 distinct saved-capture mutations were then run across all four scenarios: 64/64 applications rejected, 0 accepted. This is evidence-checker mutation coverage, not mounted-host fault injection. Node unit tests passed 4/4, including the new focused reply-link test, and the syntax check passed. Node emitted the known experimental `EnvHttpProxyAgent` warning; it did not affect results.

## Review boundary and preserved attempts

This review uses the recorded attempt-03 captures; it does not make a new browser capture, rerun build admission, rerun compiler replay, or claim mounted fault injection. The current oracle and test sources match the sealed copies, while the modified N2 build sources are outside the checked execution path.

Initial reviewer-only scripts had setup/selection mistakes (a receipt-field lookup, a duplicate-token selector, and a request-only mutation that was caught earlier by the paired start check). Those failed outputs remain indexed. The corrected scripts reran successfully; the final Node 22 acceptance order was healthy matrix, focused link checks, four unit tests, 16 capture controls per scenario, and syntax check.

The original XR-ORACLE AMEND remains unchanged as the historical review. This follow-up accepts the E-ORACLELINK correction for that finding. It does not revise the scope or results of the earlier build-admission review. No production source, Git state, or scheduler state was changed by N4.

Exact commands, sources, captures, and outputs are listed in `rawlogs/XR-ORACLELINK/index.json`.
