# Source-derived Gobi whitelist bypass

**Finding `XR-COMPILER-1` (amend).** This is a bounded source analysis against the frozen analyzer snapshot, not an executed analyzer test. No source files were modified or compiled for this probe.

The normative profile in `compiled-methods/CONTRACT.md` requires direct `MethodVal` calls with a direct, unpromoted selection. It also rejects method expressions and promoted methods. The Gobi exception is described as a narrow allowlist for direct `gobi.Node` builder calls.

In `compiled-frontend/analyze/project.go`, `methodCall` obtains the resolved function at lines 404–417, then takes the `isTrustedGobiMethod(function)` branch at lines 418–424. That branch returns before the call to `supportedMethodSelectionReason` at lines 426–433. The latter is where `types.MethodExpr` and `len(selection.Index()) != 1` are rejected (lines 481–490). `isTrustedGobiMethod` checks the function package path, signature receiver named type, and method name (lines 455–479), but it does not inspect the selection kind, selection index, or selected receiver expression.

Two source forms therefore reach the trusted branch even though the profile rejects them:

```go
func build(node gobi.Node) gobi.Node {
    return gobi.Node.Set(node, "role", "x") // MethodExpr on trusted Node.Set
}

type wrapper struct { gobi.Node }
func (w wrapper) build() gobi.Node {
    return w.Set("role", "x") // promoted selection resolving to trusted Node.Set
}
```

For the first form, `go/types` resolves the selected function to `gobi.Node.Set` with a `MethodExpr` selection. The trusted branch accepts based solely on that function object. Its lowering builds the callee selector from `selector.X` (the type expression) and then appends all explicit call arguments, including the receiver argument. This bypasses the profile's method-expression rejection and does not use the normal receiver-first `MethodVal` lowering.

For the second form, the selected function object is again `gobi.Node.Set`, while the selection is promoted through `wrapper.Node`. The trusted branch accepts it before the promotion-depth check. It lowers the wrapper expression as the receiver child rather than selecting the embedded `Node`, so this form is both outside the stated profile and not equivalent to the direct builder call lowering.

`TestUnsupportedMethodDispatchFormsFailClosed` in `compiled-frontend/analyze/methods_test.go` covers method-expression and promoted selections only with a user-defined `Counter.Bump`; it does not cover these forms when the selected function matches the trusted Gobi allowlist. The frozen React/DOM fixture exercises direct builder calls only, so the successful compiler-gate artifacts do not address this counterexample.

**Required repair:** apply the direct-selection constraints before the trusted Gobi exception. Preserve ordinary direct value calls such as `node.Set(...)`, but reject a trusted method unless the selection is `MethodVal`, has a one-element direct index, and its selected receiver is the concrete `gobi.Node` value. Add negative regression tests for the trusted `Node` method expression and an embedded/promoted `Node` method call, alongside a positive direct-call control.

This review did not execute the example through the analyzer. The conclusion follows from the exact branch ordering and predicate inputs above; the root has assigned N4 a separate repair and test packet.
