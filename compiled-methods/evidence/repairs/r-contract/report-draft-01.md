# R-CONTRACT

**Outcome: documentation repaired; trusted-selection analyzer repair remains pending.** I updated the value-receiver contract to distinguish Go source value semantics from external JavaScript caller identity for the opaque state object. I also corrected the older ABI contract's unsupported claim that an Update adapter clones that object at the ABI boundary.

## Changes

- `compiled-methods/CONTRACT.md` now states that source methods use Go value-receiver semantics while the exported role ABI makes no general promise that an external JavaScript caller's retained state object remains unchanged. It keeps the retained-input proof bounded to the frozen scalar/nested-struct fixture and points to the later E-HARNESS result.
- The same contract now records the known trusted Gobi selection gap: the analyzer recognizes the allowed target before applying ordinary selection checks. Direct `gobi.Node` builder methods remain the intended supported form; promoted selections and method expressions through the exception remain outside the verified profile. The document makes no claim that the pending analyzer repair has landed.
- `compiled-frontend/CONTRACT.md` now reflects the actual generated wrapper path: the Go facade forwards `Update` to `gobiApp.Update(state, message)`, and there is no unconditional external-state clone at the ABI boundary. It distinguishes this from source-level value receiver behavior and from the fixture-specific input-retention evidence.

## Source and artifact review

The inspected analyzer source routes trusted Gobi calls through its special case before `supportedMethodSelectionReason`; that branch returns without checking `MethodVal` kind or promotion depth. `methods_test.go` covers the ordinary user-method rejection forms but does not establish the trusted Gobi exception's promoted/expression behavior. This is why the contract explicitly marks those forms pending rather than claiming fail-closed behavior now.

The existing build source constructs a direct Go forwarder for `GobiCompiledUpdate`, the module entry exports that emitted forwarder, and `pipeline_test.go` rejects a handwritten JavaScript `state.clone()` wrapper. These facts support removing the old ABI-clone assertion; they do not establish a Go-visible value-semantics failure. No such counterexample was found in this documentation repair.

The previously retained E-CONTRACT report/receipt and XR--CONTRACT review/receipt remain byte-identical. Author source pins still match. No analyzer, compiler, runtime, or test files were changed.

## Verification and limits

- Captured SHA-256 pins before and after both edited documents; values are in `evidence/repairs/r-contract/doc-pins.json`.
- Rechecked every path in `compiled-methods/evidence/contract/source-pins.sha256` with `sha256sum -c`; all entries matched.
- No tests or builds were run. N5's full run remains gated on source freeze and independent review.
