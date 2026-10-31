# XR-R-CONTRACT

**Decision: accepted.** N3’s final contract wording is pinned and accurately separates source-level Go value-receiver semantics from the external JavaScript role ABI’s opaque-state identity. The fixture evidence is presented as finite scalar/nested-struct evidence, with no general clone or deep-copy guarantee. The trusted Gobi boundary is normative and the original XR--COMPILER finding is referenced as history without claiming a current implementation pass.

## Verified document and evidence pins

- `compiled-methods/CONTRACT.md` matches final SHA-256 `987a1cea04c76ac8fb09b6112d485802ab3994b8da77b9f69309f97c3f77d31b`; `compiled-frontend/CONTRACT.md` matches `97246c9051d57341b6c92c0516e15e4282f9c709fab4189af7279a32169e3038`. Both values match the author’s final `doc-pins.json` and R-CONTRACT receipt.
- The R-CONTRACT report, its pin file, and all three preserved draft artifacts match their receipt hashes. The author’s captured hashes for `pipeline.go` and `pipeline_test.go` also match the current files.
- The method contract says the Gobi exception covers only direct, non-promoted `MethodVal` calls to the listed value methods on `gobi.Node`. It explicitly excludes method expressions and promoted selections. It describes the original XR--COMPILER finding as history and says that the contract note makes no claim about implementation status.

## Identity and value-semantics boundary

The source-method paragraph describes Go’s ordinary receiver-copy semantics, including that reference-bearing contents follow normal Go copy behavior. A separate paragraph says the external JavaScript role ABI does not generally promise that a retained opaque state object remains unchanged, and it does not promise universal deep copy or immutability. It limits its positive isolation statement to this fixture’s scalar fields and nested `counter.State` values containing `float64` fields.

That boundary matches the inspected facade. `compiled-frontend/build/pipeline.go` generates `GobiCompiledUpdate` as a direct `return gobiApp.Update(state, message)` call. The corresponding pipeline test checks that forwarding source. Neither claims that arbitrary callers or arbitrary reference-bearing state receive a clone at the ABI boundary.

The cited fixture evidence supports only the stated finite case. The native test `TestMethodValueReceiversDoNotMutateOriginalNestedState` retains and checks original nested Go state across receiver calls and Update, including both saved-publication examples, and directly checks the locked child guards. The emitted-module value-semantics artifact reports 14 enabled Update calls with the retained input unchanged in all 14, and two `PublishSaved` witnesses with the original Parent count preserved. The separate direct-role read-only probe passes. This is evidence for the frozen fixture, not a general JavaScript object-identity or deep-clone guarantee.

## Chronology and limits

The original XR--COMPILER report records an `amend` finding for the trusted Gobi selection fast path. N3’s contract now states the normative direct-selection rule and points implementation status to R-COMPILER/XR-R-COMPILER and `RESULTS.md`, while explicitly making no current status claim.

At the time of this review, the current `project.go` hash had changed from the original XR--COMPILER source snapshot, but R-COMPILER and XR-R-COMPILER reports/receipts were not yet present in the reviewed tree. `RESULTS.md` still contains the earlier general in-progress status and does not yet list those follow-up packet names. I therefore do not infer that the implementation finding is fixed or accepted from this documentation update. The cross-reference is safe as a routing/history note; the repair lane and independent acceptance record still need to supply the implementation verdict and update milestone status.

This was a read-only documentation and evidence review. I ran no tests or builds and made no production or contract edits. The current compiler source change was not reviewed as a repair; that is the separate R-COMPILER/XR-R-COMPILER scope.
