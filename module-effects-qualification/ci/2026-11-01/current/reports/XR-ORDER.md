# XR-ORDER — independent review of N4 E-ORDER

**Reviewer:** N1  
**Decision:** `amend`

## Review summary

The sealed ordering implementation and test files match the live files byte-for-byte. The source inventory's byte counts and SHA-256 values also match the sealed files and live code. The seal hashes the E-ORDER report, receipt JSON, and rawlogs index. The seal does not include `source-inventory.json` or the source files themselves; I independently recalculated the inventory-listed hashes against both source copies.

An explicit positive run used `GOBI_EFFECTS_QUALIFICATION_INPUT` pointing to the real PR23 attempt directory. It passed all five literal profile tests, one seeded browser.swap test, and the author's three negative controls without skips. An independent Go harness then passed all **20** actual profile captures: four scenarios (`literal`, seeds 20261104, 20261105, 20261106) × five profiles (`direct.dom`, `direct.react`, `browser.dom`, `browser.react`, `browser.swap`).

## Finding requiring amendment

`CheckOrdering` never reads `pendingCount` in `orderedLedger`. Starting from the real `effects.literal.browser.swap.json` capture, I changed the ordered start record for token `a:g1:r1` from `pendingCount: 1` to `pendingCount: 99`, while leaving its correlated lifecycle state and `pendingGo` set unchanged. `CheckOrdering` accepted the mutated capture. This permits contradictory lifecycle evidence to pass. The implementation should validate each recorded pending count against the independently derived pending set/count for that ordered event; retain a regression test for this exact mutation.

## Other adversarial probes

The same isolated harness rejected the following mutations:

- Cancellation correlation retargeted from `a:g1:r1` to the start for `b:g1:r1`.
- Retained stale callback generation changed from retired generation 1 to remounted generation 2.
- Two accepted reply rows swapped in `orderedLedger`, with sequence numbers adjusted to keep them contiguous.
- First renderer swap's `rendererEpochAfter` changed from 2 to 9.
- The request's renderer commit records moved after its `transport-start`, with lifecycle sequence numbers renumbered monotonically.

The raw output has the exact rejection messages. The harness exit status is 1 by design because the accepted `pendingCount` mutation is reported as a finding; it is not an execution error.

## Evidence and commands

- `rawlogs/XR-ORDER/seal-integrity.txt` records report, receipt, rawlog-index, source code hash, and source equality checks.
- `rawlogs/XR-ORDER/positive-control.*` records the explicit, verbose focused package run.
- `rawlogs/XR-ORDER/review-harness.go` and `adversarial-control.*` are the independent Go mutation control and its exact output. Positives ran first; mutants were separate decoded copies.
- `rawlogs/XR-ORDER/capture-inputs.sha256` pins the four native expected captures and all 20 actual profile captures.
- `rawlogs/XR-ORDER/inspect-browser-swap.go` and `fixture-shape.txt` preserve the inspected record shapes.
- `rawlogs/XR-ORDER/commands.txt` gives the exact commands and paths.

No production source was edited by this review. The result is limited to the sealed finite profile protocol and the captured attempt; it makes no general browser equivalence claim.
