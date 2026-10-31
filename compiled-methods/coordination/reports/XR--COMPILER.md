# XR--COMPILER

**Decision: amend.** N4’s source, method-profile boundaries, and frozen React/DOM build artifacts substantiate the bounded value-receiver implementation and unchanged package role ABI. A trusted Gobi builder fast path bypasses the profile’s rejection checks for method expressions and promoted selections. The focused tests and frozen fixture do not cover those trusted-method forms.

## Verified evidence

- The E-COMPILER source hashes match its receipt, and the report hash matches the receipt. The React and DOM inventories each contain 67 files and verify against their retained output trees. Both builds report `ok: true`, one AppIR, and no diagnostics.
- React and DOM AppIR are byte-identical at SHA-256 `07d0d25ede9993e1f58e108f4cc153717ff62061ff519b50619615cd4faccd3b`. Both reference package-level `Init`, `Update`, and `View` roles. Receiver helpers use receiver-qualified symbols and receiver-first signature parameters. The artifact call graph contains the fixture’s expected role, helper, and local `counter` edges. These checks support the unchanged role ABI and the method projection exercised by the fixture.
- N4’s recorded analyzer tests cover receiver ID separation, reachable numeric guards in entry and local dependency methods, local dependency call-graph inclusion, tuple forwarding, and rejection of custom pointer/interface/value/expression/promoted/generic cases. I reviewed those tests and source but did not rerun them while the root run was active.
- The author reported a broad `go test ./...` failure in the unchanged archival `source-snapshots` package and separately recorded passing live analyzer/build/CLI/emitter package checks. This review does not recast the broad check as passing.

## Required amendment: trusted Gobi selection bypass

`operationBuilder.methodCall` calls `isTrustedGobiMethod(function)` and returns from that branch before invoking `supportedMethodSelectionReason(selection, function)`. The latter rejects `types.MethodExpr` and selections with an index length other than one. The trusted predicate checks the resolved function’s package, declared receiver type, and method name, but it does not check the selection kind, promotion depth, or selected receiver expression.

As a result, both `gobi.Node.Set(node, "role", "x")` and a promoted call such as `w.Set("role", "x")` where `w` embeds `gobi.Node` resolve to the trusted `gobi.Node.Set` function and pass through the fast path. For the method expression, the fast path constructs its selector callee from the type expression and appends the explicit arguments, including the receiver. For the promoted call, it supplies the wrapper expression as receiver instead of selecting the embedded `Node`. These are outside the normative direct `MethodVal` profile and bypass its fail-closed checks.

`TestUnsupportedMethodDispatchFormsFailClosed` exercises method-expression and promoted selections for a user-defined `Counter.Bump`, but not for a method whose function object matches the Gobi allowlist. The frozen fixture uses direct Gobi builder calls only, so its passing builds do not resolve this case. The complete source-derived control-flow analysis and proposed fix are in [gobi-whitelist-bypass.md](../../evidence/reviews/xr-compiler/gobi-whitelist-bypass.md).

N4 should constrain the trusted exception to a direct, unpromoted `MethodVal` selection on the concrete `gobi.Node` value before accepting it, while retaining direct calls such as `node.Set(...)`. Add a positive direct-call control and negative tests for the Gobi `Node.Set` method expression and a promoted embedded-Node call. This review’s counterexamples were derived from source and were not executed through the analyzer.

## Limits

No source, compiler artifact, fixture, or Git state was changed. I ran no tests. This review covers the analyzer method-lowering source, its tests, and the frozen compiler-gate artifacts; it does not claim execution of generated GoScript or browser/runtime behavior. The source-derived bypass is the blocking finding; receiver-first operation ordering and an external-package negative method test remain source-only/untested observations recorded in the audit.
