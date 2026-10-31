# R-CONTRACT

**Outcome: documentation amended.** The prospective contract now states the source-level Go value-receiver rule separately from external JavaScript caller identity for the opaque state object. It also states the trusted Gobi selection boundary normatively and points to the repair/review history without asserting either a current failure or a completed fix.

## Changes

- `compiled-methods/CONTRACT.md` limits the trusted Gobi exception to direct, non-promoted `MethodVal` calls on value `gobi.Node` for `Set`, `Flag`, `Css`, `Keyed`, and `Handle`. Method expressions and promoted selections remain outside the supported profile. The contract records: “The original XR--COMPILER review found a trusted-path selection gap; repair and independent acceptance are tracked in R-COMPILER/XR-R-COMPILER and `RESULTS.md`.” This is a chronology note, not a claim about current compiler status.
- The same contract describes Go receiver-copy behavior as a source-language rule, while making no general guarantee that an external JavaScript caller's retained opaque state object is unchanged by an exported role call. Retained-input isolation stays bounded to the tested scalar/nested-struct fixture.
- `compiled-frontend/CONTRACT.md` now matches the generated wrapper path. The Go facade forwards `Update` to `gobiApp.Update(state, message)`; there is no unconditional clone of the opaque state object at the ABI boundary. This separates source-level value receiver semantics from external ABI input identity.

## Historical evidence and limits

The original XR--COMPILER report and audit record the source-derived trusted-path gap for their reviewed source snapshot. The repair and independent review status belong to R-COMPILER, XR-R-COMPILER, and the milestone `RESULTS.md`; this documentation change does not repeat or update their implementation verdict. The earlier R-CONTRACT draft and its pins are preserved under `evidence/repairs/r-contract/`.

The older XR--CONTRACT, E-CONTRACT, and XR--COMPILER records remain unchanged. The current documentation update changed no analyzer, compiler, runtime, fixture, or test source. No tests or builds were run, and this packet makes no full-chain CI claim.

## Verification

- SHA-256 before/after values for both edited documents and the inspected source snapshot are recorded in `evidence/repairs/r-contract/doc-pins.json`.
- All author E-CONTRACT source-pin entries matched when checked with `sha256sum -c` before this final wording pass.
- Prior draft report, receipt, and pin bytes are preserved as `report-draft-01.md`, `receipt-draft-01.json`, and `doc-pins-draft-01.json`.
