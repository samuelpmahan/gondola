# XR-ORDERFIX — independent review of N2 E-ORDERFIX

**Reviewer:** N1  
**Decision:** `accepted`

## Review summary

The E-ORDERFIX report, packet JSON, and rawlog index match their sealed copies. The inventory-listed `ordering.go` and `ordering_test.go` match both the sealed source and live files byte-for-byte. The original E-ORDERFIX rawlogs pass their SHA-256 index.

The real PR23 fixture passed `CheckCaptures` with all **4 scenarios, 20 profiles, 178 events, 182 states, 58 effects, and 116 transport records**. The independent harness then called `CheckOrdering` directly for all **20** actual captures and accepted each one.

## Independent adversarial results

Starting with the actual `effects.literal.browser.swap.json` capture, the previously reported five ordering mutations still reject: cancellation target changed to another request, stale callback generation changed to the remounted generation, accepted reply rows swapped while sequence numbers remained contiguous, renderer swap epoch changed to 9, and render commits moved after transport start with lifecycle sequences renumbered.

The original pending-count finding now rejects in both ledgers. Changing the `start` row for `a:g1:r1` from `pendingCount: 1` to `99` produced:

- `orderedLedger[8].pendingCount mismatch: expected 1, got 99`
- `effectLedger[1].pendingCount mismatch: expected 1, got 99`

For both `orderedLedger` and `effectLedger`, I removed `pendingCount` from each `request`, `start`, `cancel`, and `reply` row in turn. Each missing field rejected. Float, exponent-form, and leading-zero count encodings also rejected as noncanonical; the unchanged real capture passed as the canonical positive control. An unexpected `pendingCount` on a `go-state-commit` row rejected.

To test that producer metadata cannot validate itself, I changed the request and start counts to 2 in both ledgers and added a fictitious pending identity to the matching renderer commit's `pendingGo`. The checker rejected this combination against **Go-derived expected count 1**. Forging `pendingGo` alone in both a `renderer-commit` and a `go-commit-render` row also rejected against the replay state.

The sealed implementation derives pending identities from the expected native replay's event-to-state indexes and child `Pending`/`Token`/key/generation values. It derives ledger counts from that Go pending set, checks the ordered/effect ledgers against those counts, then separately compares both lifecycle commit kinds' captured `pendingGo` identities against the Go-derived state mapped to the host event. `CheckCaptures` first checks native output byte-for-byte against `effectsreplay.ReplayJSON`, so the integrated positive establishes that the expected input is Go replay output for these captures.

## Verification and limits

The focused E-ORDERFIX regression tests passed, including real literal profiles, the seeded capture, count mutations in both ledgers and all four async row kinds, coherent pending metadata forgery, and lifecycle pendingGo forgery. The full `effectqualification` package passed with `GOBI_EFFECTS_QUALIFICATION_INPUT` explicitly set. The independent harness's exact results are in `rawlogs/XR-ORDERFIX/review-harness.stdout`.

This review covers the sealed finite capture protocol and PR23 fixture only; it does not establish arbitrary browser equivalence. No production files were edited.

## Evidence

- `rawlogs/XR-ORDERFIX/seal-integrity.stdout`, `seal-hashes.txt`, and `seal-integrity.txt` verify the seal, source inventory, and original rawlogs.
- `rawlogs/XR-ORDERFIX/review-harness.go` and `review-harness.*` contain the independent all-20 positive and 43 rejection controls.
- `rawlogs/XR-ORDERFIX/focused-tests.*` and `package-tests.*` contain the focused and full package test results.
- `rawlogs/XR-ORDERFIX/commands.txt` records exact commands; `rawlogs/XR-ORDERFIX/index.json` hashes every review rawlog.
