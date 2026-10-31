# XR-GO: independent review of compiler cancellation inference

## Decision

**Amend.** The `effect.cancel` capability is accepted by AppIR validation and is inferred from the actual lifecycle fixture and the transitive helper probe. One inference edge case violates the frozen contract and can cause an app to mount without a required cancellation-capable host.

## Finding

`compiled-frontend/analyze/analyze.go` adds an unstated non-empty-value test for the keyed `gobi.Effect.Arg` field. The frozen inference contract requires the exact typed cancellation descriptor and a string-typed Arg expression; runtime policy validates the token value. A direct empty string is still a string-typed expression in that descriptor, but `hasNonEmptyTokenValue` returns false for it, so `effect.cancel` is omitted.

The check is also syntactically inconsistent. For the same descriptor, `Arg: ""` becomes an `OpLiteral` and is rejected, while `Arg: ("")` becomes an `OpParen`; `hasNonEmptyTokenValue` accepts every non-literal operation and the capability is added. Parentheses alone therefore change AppIR requirements.

Minimal repro:

```go
func Update(state State, _ gobi.Message) (State, []gobi.Effect) {
	return state, []gobi.Effect{{Kind: "lifecycle.cancel", Name: "cancel", Arg: "", Reply: ""}}
}
```

Changing only the field to `Arg: ("")` declares `effect.cancel`. Remove the non-empty check and test both forms against the frozen string-typed-Arg rule. Without the capability, the host admission gate can accept the component before Go Init even though Update can emit `lifecycle.cancel`; the runtime then rejects when that effect is emitted.

## Confirmed areas

- The AppIR validator accepts `effect.cancel`, retains generic duplicate detection, and still rejects values outside its fixed capability map. Legacy `effect.request-reply` and numeric capability constants are unchanged.
- Inference uses the Update result slice element and requires the exact `github.com/samuelpmahan/gondola/gobi.Effect` type with string protocol fields and keyed fields.
- Update-only reachability follows helper chains. The actual finite lifecycle fixture gains the capability; the request-only fixture and counter do not. The synthetic package probe is named `effectcancelprobe`, so inference does not depend on the lifecycle app ID.
- Existing analyzer negatives cover unrelated text plus a mismatched name, an unreachable helper, and a computed kind. They do not cover the empty-Arg inconsistency.

## Verification

- Go `1.24.0`, from the repository root: `PATH=/tmp/gondola-go/bin:$PATH go test -count=1 ./compilercontract` — passed.
- Go toolchain `1.27.3`, from `compiled-frontend/`: `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 go test -count=1 ./analyze` — passed.
- Raw command output is preserved under `reviews/XR-GO/logs/`.
- Reviewed changes are relative to base `00da54ad0f5a4006b13a5cded18ce291845978bc`. The source SHA-256 hashes for both base and reviewed files are in `receipts/XR-GO.json`.

No production files were modified during this review. N1 owns the repair; integrated capability execution remains pending.
