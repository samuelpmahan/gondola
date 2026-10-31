# XR-COMPILER: independent review of E-COMPILER

**Decision: accepted.** The analyzer change is narrow and matches Go keyed-literal semantics: an omitted `Reply string` field on a keyed `gobi.Effect` has zero value `""`. The analyzer still requires a reachable, exact `gobi.Effect` composite with literal `Kind: "lifecycle.cancel"`, literal `Name: "cancel"`, and a present string `Arg`. If `Reply` is supplied, it must remain a literal empty string.

## Analyzer and test review

`hasLifecycleCancelDescriptor` checks the declared effect element and struct fields, visits only operations in functions reachable from `Update`, filters composites by the actual `gobi.Effect` type, collects keyed fields, checks literal kind/name, and requires `Arg` to be present with string type. It treats only an absent `Reply` field as the Go zero string. A present nonliteral or nonempty `Reply` fails the descriptor check.

The regression tests cover omitted and explicit-empty `Reply` as positive cases; nonempty and computed `Reply`, wrong effect type, wrong kind/name, computed kind, and unreachable descriptors as negative cases. Existing positive cases pass a present string Arg, including empty string literals; the source guard also requires the Arg key and string type. I found no broad source-text matching or capability inference from an unrelated literal.

## Independent artifact checks

I reran the analyzer package suite using the compiler module's supported Go 1.27.3 toolchain. It passed. The Go 1.24 analyzer attempt remains blocked by the module's declared Go 1.27.0 floor, as recorded in E-COMPILER; it is not a red test under the supported compiler toolchain.

The read-only independent checker verified all 22 current compiler source/tool pins against disk, including N1's final `app_test.go` hash, and confirmed E-COMPILER's before/after pin files are byte-identical. There is no stale test-source pin discrepancy.

For each React and DOM proof build, I independently checked all 67 generated files against the CLI result byte lengths and SHA-256 values. The AppIR and encoder are identical between backends; the AppIR declares `effect.cancel`, `effect.request-reply`, `numeric.safe-integer`, and `numeric.float64`. Backend modules are separate outputs as expected.

Both encoder probes contain 46 checkpoints: initial state plus 45 Go dispatches. I decoded every emitted encoder `Value` and compared the result with the corresponding native Go trace state. All 46 checkpoints matched for both backends, all React and DOM probe snapshots were identical, and `Children` and `Publications` encoded as typed slices at every checkpoint. Their GoScript runtime representations vary between arrays and GoScript slice wrappers; the encoder output remains a typed slice in either case.

## Verification

The focused analyzer command passed:

```sh
GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test ./analyze -count=1
```

The independent read-only artifact checker passed. Its output confirms 22/22 current pins, 67/67 verified outputs for each backend, and 46/46 native-state checkpoints for both encoders. This review does not claim browser-mounted or full inherited-pipeline acceptance.

## Pinned source and proof inputs

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `compiled-frontend/analyze/analyze.go` | 39,143 | `9e39ccd6cbe6b68dd5b42af9abf50ee2dc3fe926b4ac08f4f76fafbe59a60f52` |
| `compiled-frontend/analyze/analyze_test.go` | 11,756 | `e67a8060324212838ff9e385d0a4d77eea5c830ea1baae957149780aa1942145` |
| N2 source pins before and after | 3,809 each | `f6604b31b7a7fadfb5ce9d7234070502ca800371a5b4e75db8b6f96817e04478` |
| React proof build manifest | 4,706 | `121ab8a802f0d0294235aae43f2fa93eabf22cdc419b135b718346025f45cf15` |
| DOM proof build manifest | 4,704 | `73556d0f1ca736f850aa6a75a88e19f7e8540609c5213015c02a1ae0c82d2f39` |
| encoder comparison | 1,227 | `25de402fc21407075917ae44d5ef1e8aa5698b0951df36cc12142889a6a1ec62` |
| native Go trace | 1,148,369 | `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d` |

N1's pinned fixture test source is `6402baa2a342528c93ef52e4e93ba6e9c51d013193cc2a8fa8d9989bde39c392`; this matches the compiler's final 22-path source pin set.

## Limits

This review validates the bounded publications fixture and its generated React/DOM modules, not arbitrary Go programs. Browser rendering, HTTP delivery, and full inherited acceptance remain outside this compiler review.
