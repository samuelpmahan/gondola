# XR-R-T4B — independent review of input sanitation and witness metadata

## Decision

**Accepted.** The correction keeps browser-only single-line input normalization in generated dispatch steps, records the requested/effective value mapping outside the closed native action schema, and preserves deterministic bounded trace generation.

## Reviewed

Read coordination/reports/R-T4B.md, the current scripts.mjs and scripts.test.mjs, and compared both script files with their versions in evidence/source-before-review.tar.xz. I did not rerun the author's focused tests.

## Findings

- browserTextInputValue() accepts a primitive string and removes only CR and LF characters. The edit() script builder applies it to the generated input dispatch step. No create, save, policy, lifecycle, or other action is normalized.
- Native action records remain closed as {method, args}. Each script carries a separate frozen inputWitnesses array; each witness retains actionIndex, requested, effective, and the dispatch key.
- The fixed publication script retains its action ordering and indexes. Witnesses at indexes 12 and 17 point to the intended row-1-input dispatches; the first carries a CRLF request and the second an LF request. Their dispatch values are the corresponding effective strings with line breaks removed.
- Seeded generation records a witness only when the requested draft differs from the effective value, uses the effective value both in the generated dispatch and in the independent model's draft state, and leaves the PRNG and action-count logic unchanged. Repeated generation for the same seed remains deterministic; the added CRLF draft candidate supplies another normalization case without changing call structure.
- The separate direct-manager path in the test still sends a raw multiline value directly to the independent reference and verifies that it remains unchanged. Thus the normalization is scoped to the browser-input trace profile rather than the manager API model.

The archived-source comparison shows the intended changes: the normalizer and edit-step mapping, witness metadata and assertions, and one additional seeded CRLF draft value. No unrelated production script changes were found in these files.

## Verification boundary

This is a source-and-test review. The report's 19 focused test passes remain author-reported; I did not repeat them. No browser/native replay or full inherited runner result is claimed.
