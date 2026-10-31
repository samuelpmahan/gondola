# Compiled value-receiver method profile

**Status: proposed normative profile for independent review.** This document specifies the bounded method profile for this milestone. It is not a general Go method, ownership, or component-composition contract. The compiler-contract schemas and package role ABI remain unchanged.

## Package roles and receiver metadata

Applications continue to expose exactly one package-level `Init`, `Update`, and `View` role. Their signatures remain `Init() State`, `Update(State, Message) (State, []Effect)`, and `View(State) ViewValue`, where the view result is `gobi.Node` or `compilercontract.View`. Receiver methods are helpers; they do not become component roles.

For each supported source method declared on named type `T` in package `P`, the analyzer emits an internal symbol ID:

```text
P.T.Method
```

The method signature metadata prepends the receiver's type ID to the explicit source parameters. The result list remains the method's Go result list, in order. For example:

```go
func (state State) Reduce(message gobi.Message) (State, []gobi.Effect)
```

has metadata parameters `[P.State, gobi.Message]` and results `[P.State, []gobi.Effect]`. `Calls` links reachable package roles and source methods with these receiver-qualified IDs. This internal representation does not change `gobi.app-ir/v1` or the component role references.

## Supported source calls

A normal receiver-method call is supported only when `go/types` resolves the source call to a direct `MethodVal` selection and all of the following hold:

- The receiver is a concrete, named, non-pointer value type declared in the same package as the method.
- The method has no type parameters, and the receiver type has no type parameters or type arguments.
- The method is selected directly, without promotion through an embedded field.
- The call is made directly as `receiver.Method(arguments...)`; the method is not first stored or passed as a function value.

The analyzer represents the call as `OpCall` with the statically resolved method ID. Its operation children are ordered as the receiver expression followed by the explicit arguments in source order. Consumers must preserve Go's receiver-before-arguments evaluation order. Multi-result method calls retain all results, including direct tuple forwarding such as `return state.Reduce(message)` and `return state.AddParent()`.

The method ID includes the receiver type, so identically named methods on different receiver types remain distinct. The analyzer's tests cover this with `Left.Add` and `Right.Add`. Receiver type metadata uses the named type's package-qualified type ID.

The trusted Gobi node-builder exception is narrow: only direct, non-promoted `MethodVal` calls to value methods `gobi.Node.Set`, `Flag`, `Css`, `Keyed`, and `Handle` are within this profile, by exact package, receiver type, and method name. These builder calls are not a general exception for user-defined methods. Existing supported Gobi builder functions such as `El`, `Txt`, `Frag`, and `S` remain function calls under the current v1 profile.

Method expressions and promoted selections through the trusted exception are outside this profile. The original XR--COMPILER review found a trusted-path selection gap; repair and independent acceptance are tracked in R-COMPILER/XR-R-COMPILER and `RESULTS.md`. This history note records the review trail and makes no claim about current implementation status.

## Reachability and validation

Analysis starts from the package-level `Init`, `Update`, and `View` roles. It follows statically resolved `OpCall` edges recursively. Reachable source methods and source-local dependency functions are projected into the typed program, checked by the same operation and numeric validators as role bodies, and included in the AppIR symbol/call graph. `LoadSources` loads module-local dependencies and only projects their function bodies when reached. An external method without an analyzed source body must match an existing supported-call exception or the reachable call is rejected.

Unsupported reachable operations fail closed with source spans. Relevant diagnostics include `analyze.unsupported-operation` for unsupported method selections, `analyze.unsupported-call` for unresolved or unsupported call targets, and `analyze.dynamic-call` when a call target is dynamic or unresolved. The profile explicitly rejects:

- Pointer receiver calls, including implicit pointer adaptation.
- Interface or dynamic method dispatch.
- Promoted method selections.
- Generic or non-concrete receiver types.
- Method values (for example, `f := state.AddParent`) and method expressions (for example, `State.AddParent(state)`).

An unsupported receiver declaration is not projected as a supported helper; a reachable use is still rejected. Package initialization and mutable globals remain subject to the existing v1 source rules. This contract does not add support for managers, pointer-based ownership, sessions, cancellation, or imported dependency initialization.

## Numeric profile applies to reachable methods

The method body and every reached local helper body use the same conservative integer validator as the role functions. The validator intersects Go type bounds with the JavaScript safe-integer interval `[-9007199254740991, 9007199254740991]`; unsigned values use `[0, 9007199254740991]`. This is an operation-validation bound even for `int64` and `uint64` types whose runtime representation is BigInt. It does not claim arbitrary-width Go integer arithmetic.

The supported runtime integer arithmetic is deliberately small:

- `x++`, `x + 1`, and `1 + x` require a true-branch upper guard within both the declared Go range and the safe-integer limit.
- `x--` and `x - 1` require a corresponding lower guard.
- `len(collection) * 2` is accepted only in a `make` capacity argument when the collection representation has a known maximum length and the doubled result fits the output integer and safe-integer range.
- Integer conversions require a compile-time integer constant that fits both the target Go type and safe-integer range.

Other integer arithmetic is not proven safe by v1 and is rejected. This includes integer compound assignments, unguarded increments/decrements, runtime integer conversions, runtime integer negation, general multiplication/division/remainder, and integer bitwise operations. Integer literals outside the safe range are rejected.

Only a true-side `if` or loop condition contributes guards. `&&` may combine facts; `else` and switch case lists do not add upper/lower facts. A write invalidates facts for the written local or field path. Diagnostics use `analyze.numeric-profile` with source spans. This is a bounded validator, not general Go range analysis.

For the currently implemented comparison guards, `x < bound` establishes an upper fact when `bound` is no greater than the maximum accepted value, and `x <= bound` establishes one only when `bound` is strictly below that maximum. `x > bound` establishes a lower fact when `bound` is at least the minimum accepted value, and `x >= bound` establishes one only when `bound` is strictly above that minimum. These strictness rules leave room for the subsequent increment or decrement.

## Value semantics boundary

A receiver method in this source profile has Go value-receiver semantics: Go treats the receiver as a value, copying value fields while reference-bearing contents follow ordinary Go copy semantics. This is distinct from the external JavaScript role ABI's treatment of the opaque state object supplied to `Update`. The profile does not generally guarantee that a JavaScript caller retaining that object will observe it unchanged after a role call. It also does not promise a universal deep copy or immutability guarantee; for example, copying a struct containing a slice does not by itself copy the slice's backing array. The existing source type profile does not admit pointer or map fields.

The conformance fixture uses scalar fields and nested `counter.State` structs containing only `float64` values. Native tests retain the original nested state across receiver calls and `Update`, including both `PublishSaved` scenarios, and directly exercise child Add/Reset while `ReadOnly` is true. The later N3 emitted-module matrix also checks retained inputs for all 14 enabled fixture actions and runs two direct locked-role probes. This establishes isolation and guard behavior for this fixture's scalar/nested-struct state only, not a general external-ABI input-identity guarantee.

## Frozen fixture and evidence boundary

The canonical fixture is `compiled-value-method-composition-child-readonly-snapshot` in [`FIXTURE.md`](FIXTURE.md); its script is `conformance/fixtures/methods.json`. It has 18 actions and 19 trace ticks. Four disabled intents at action indexes `[6, 9, 10, 17]` are suppressed before `Update`, producing trace tick indexes `[7, 10, 11, 18]` with no message or dispatch ID. The native trace has 14 actual dispatches. The separate direct Go tests are necessary because disabled UI intents do not reach the child `ReadOnly` branches.

The E-CONTRACT evidence records five focused analyzer tests, N4's successful React/DOM compiler-gate artifacts, and a native CLI replay of the generated React AppIR against the fixture. E-CONTRACT itself did not execute the emitted module. The later E-HARNESS matrix exercised one compiled React module through direct role calls and the React, DOM, and swap profiles; its conclusions are bounded to the frozen fixture. It makes no general renderer, focus, event, or UI conformance claim beyond that separate fixture evidence.
