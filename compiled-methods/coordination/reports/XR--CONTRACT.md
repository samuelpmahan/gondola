# XR--CONTRACT

**Decision: amend.** The value-receiver boundary, trusted Gobi builder exception, rejection list, role isolation, schema, method signatures, numeric-validation scope, and author evidence mostly match the inspected source and retained outputs. I found one wording boundary that should be made explicit before accepting the contract: source-level Go value-receiver semantics and external JavaScript caller ownership of the opaque state object are separate claims.

## Review findings

- `project.go` matches the documented method profile. It projects receiver-qualified IDs, prepends the receiver type to method parameters, and lowers direct receiver calls with the receiver expression before explicit arguments. The source rejects pointer receivers and implicit pointer adaptation, interface/dynamic dispatch, promoted selections, generic or non-concrete receivers, method values, and method expressions. The five focused analyzer cases in the author log cover the advertised rejection boundary and numeric checks.
- The Gobi exception is restricted to `github.com/samuelpmahan/gondola/gobi.Node` value methods `Set`, `Flag`, `Css`, `Keyed`, and `Handle`; `gobi/node.go` declares those methods on `Node` values. This does not grant a general exception for application methods.
- The React and DOM compiler results retain one component with the package-level `Init`, `Update`, and `View` role IDs, `gobi.app-ir/v1`, and 15 symbols including internal methods. React and DOM AppIR and encoder bytes match; the raw GoScript modules differ and are separately pinned. The build manifest tags the selected backend. The method result signatures preserve `State` and `[]gobi.Effect`, `Reduce` reaches the seven action methods, and Add/Reset reach `counter.Update`.
- The author packet’s five analyzer tests, native trace counts, report hash, and all entries in `source-pins.sha256` match their retained bytes. The author report correctly says its own lane did not execute the emitted GoScript module.
- The later N3 E-HARNESS record supplies the missing fixture runtime evidence: all 14 enabled emitted-module updates retained their original opaque state input; both `PublishSaved` nested-value witnesses and two direct locked-role probes passed; native, direct, React, DOM, and swap traces matched for the frozen fixture. This evidence is limited to that fixture and does not establish a general external-ABI state-identity policy.

## Required amendment

The sentence in `compiled-methods/CONTRACT.md` saying the profile “promises the Go value-copy semantics for the supported receiver expression and method body” should make clear that this describes source-level Go value-receiver semantics. It should separately state whether the exported JavaScript role ABI promises to preserve an external caller’s retained opaque state object. Current evidence proves that ABI-level isolation only for the frozen scalar/nested-struct fixture, so the general external-state identity policy should remain outside the guarantee unless it is specified and proven for broader cases.

There is an adjacent documentation inconsistency to reconcile: `compiled-frontend/CONTRACT.md` says an Update adapter calls `state.clone()` at the ABI boundary, but `build/pipeline.go` forwards the emitted Update directly and its facade test rejects adding handwritten `state.clone()` there. The retained fixture module preserves its inputs through its particular emitted method-call path. I found no Go-observable counterexample and do not infer a Go semantic failure from direct forwarding alone.

The amendment does not require broadening or weakening AppIR v1, adding pointer/interface/promotion support, changing tuple/effect results, or making Manager/session/cancellation claims.

## Audit method and limits

This review was read-only: I checked the author receipt/source pins, analyzer and build source, AppIR/manifests/modules, and the existing N3 fixture runtime artifacts. I did not run tests, probes, or builds, and did not edit production code. This is not a fresh CI run.
