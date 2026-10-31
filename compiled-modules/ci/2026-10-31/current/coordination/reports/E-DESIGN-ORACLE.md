# E-DESIGN-ORACLE — independent typed-module ABI design

## Recommendation

Use an additive, closed `gobi.module-abi/v1` descriptor for each independently built app. Derive it from that build's AppIR and emitted file inventory; do not accept caller-authored type/signature descriptions. Bind the descriptor to the component/package identity and sorted `{path, bytes, sha256}` records for its module, AppIR, encoder, and generated component files. Keep an ABI-shape digest separate from the artifact digest: the shape digest is SHA-256 of canonical JSON with its own digest field omitted. These hashes establish byte/shape identity, not publisher authenticity.

Suggested descriptor fields:

```json
{
  "schema": "gobi.module-abi/v1",
  "appIRSchema": "gobi.app-ir/v1",
  "componentID": "...",
  "packagePath": "...",
  "artifacts": [{"path":"...","bytes":0,"sha256":"..."}],
  "roles": [{"name":"Init","symbol":"...","signature":{"params":[],"results":["..."]}}],
  "types": [{"id":"...","kind":"...","bits":0,"fields":[]}],
  "abiSHA256": "..."
}
```

`types` is the closed reachable type graph for the component state/message and all role parameters/results, sorted by TypeID for canonical serialization. Preserve each struct's declared field order. Include kind, width, element type, array length, and JS representation where present. The digest includes schema/version, component and package identity, role names/signatures, and all type data. `artifacts` are canonicalized by path and digest the exact emitted bytes. Reject missing, extra, duplicate, unsafe, or hash-mismatched artifact entries.

For this finite profile, the only cross-module records are the exact nominal types `github.com/samuelpmahan/gondola/fixtures/compiled/modulewire.Input{Step int, Locked bool, Revision int}` and `...modulewire.Publication{Count float64, Revision int}`. The parent exposes `Output(State) Input` and `Receive(State, Publication) State`; the child exposes `Input(State, Input) State` and `Publication(State) Publication`, alongside ordinary `Init/Update/View`. A pair link names those four ports and the two descriptor digests. Admission checks exact port signatures, nominal TypeIDs, and ordered field structures against both independently produced AppIRs before any `Init`, `View`, renderer construction, or host publication callback. Keep parent and child code in separate build invocations/output directories; parent imports only `modulewire`, never the child implementation.

N2/N3 agreed on the descriptor schema, exact ordered role/type binding, pair-link check, and admission timing. Proposed Go API for N5's gate-1 package is `Describe(appIR, artifactFiles) (Descriptor, error)` and `ValidatePair(parent, child Descriptor) error`; these are recommendations, not existing APIs. Generated facades should reconstruct each destination Go struct from primitive scalar arguments. The JS host may check/admit records, retain child slots, and transport scalar fields; it must not calculate input revisions, apply lock/step policy, mutate child counts, or implement publication acceptance.

## Independent oracle and adversarial acceptance cases

The native Go oracle should use the actual parent and child Go functions and emit a checkpoint after initialization and every dispatched event. Each checkpoint records parent/child typed states, the four bridge values at the relevant boundary, dispatch message, views, and deterministic operation order. The browser/direct harness compares against this independent trace and literal expected Gobi trees/DOM; it must not derive expected transitions from emitted JS.

| Case | Expected fail-closed or invariant |
|---|---|
| Parent/child module pair from separate builds | Both descriptors validate independently; only exact `Output → Input` and `Publication → Receive` links admit. Record both output dirs, artifact hashes, ABI digests, and compiler version. |
| Wrong schema/version, unknown or missing member, duplicate JSON key, trailing data, duplicate role/type/path, null where a required array/object is expected | Reject before calling any module function or renderer factory. Closed JSON decode is needed; ordinary permissive unmarshalling is insufficient. |
| Descriptor paired with different module bytes, AppIR, package/component, or encoder; ABI/artifact digest changed; one artifact omitted or added | Reject the pair and retain the currently mounted UI. Never let descriptor bytes claim a different compiled facade. |
| Same TypeID with changed fields; same fields in another package; reordered/renamed/added/removed fields; `int`/`bool`/`float64` substitution; changed widths or JS representation | Reject exact structural/nominal mismatch before init. TypeID string equality alone is not compatibility. |
| Bridge role missing, duplicated, wrong receiver/state, swapped argument order, wrong return type, or wrong effects result | Reject before init/render. Only the four declared bridge signatures and conventional component roles are admitted. |
| Pointer/interface/map/unsupported nested shape or nonempty effects on a bridge | Reject as outside this finite profile; do not coerce through generic JS objects. |
| Input changes step `1→3→2`, toggles lock, and resets input; child Add while unlocked and Reset while locked | Parent Go owns input/revision transitions; generated `Output`/`Input` carry typed values. Locked Add stays disabled; Reset remains enabled for positive count. Repeated identical input does not invent a JS revision. |
| Reset at zero, repeated Add/Reset, alternating child operations | Physical Reset at zero dispatches nothing because the control is disabled. A direct typed child Go message verifies Reset-at-zero is idempotent. Repeated operations follow the Go oracle exactly. |
| Two children share one child artifact; update/reorder one keyed instance; mount/swap React↔DOM | Keyed child states remain distinct and follow their keys; parent and child states and captured callbacks survive compatible swaps without re-running Go updates. |
| Child Publication captures count/revision; later count or parent input changes before Receive | Captured publication remains immutable. Parent `Receive` applies its Go revision rule and the trace records accept/reject; JS must not rewrite or revalidate business state. |
| Mismatched descriptor candidate while an old module is live | Candidate rejects before module init or renderer factory; old UI and its live callbacks remain usable. A stale callback from a retired renderer is suppressed by the runtime boundary. |
| Direct React, direct DOM, mounted React, mounted DOM, and renderer swaps | Compare all state, typed bridges, message/effect order, node trees, and normalized DOM to literal projections. Report each actual profile; do not infer a mounted profile from unit tests. |

Keep the numeric claims narrow: this contract uses Go `int` revisions/steps restricted to the fixture's small values and `float64` counts from the counter. Test JSON serialization of these actual values and reject type mismatches; do not claim general 64-bit integer or arbitrary-float fidelity. `compilercontract.Value` already has a typed encoding with exact float64 bits and rejects non-finite values, but the new ABI's JS primitive bridge is a separate boundary and should not be described as cryptographic or arbitrary-Go transport.

## Existing boundary and limits

Current `compilercontract.AppIR` already contains components, role symbols/signatures, capabilities, and `TypeInfo`; `TypeInfo` captures kind, bit width, element/length, ordered fields, and JS representation. `compilercontract.Value` encodes typed values and preserves exact float64 bits. The analyzer/build currently centers on one component's conventional `Init/Update/View`; it does not itself define the independent module pairing or four bridge roles. `counter` provides a suitable real child transition/view implementation. Therefore reuse the type/value/view contracts and add a bounded descriptor, generated bridge facade, and host pair admission; do not build a second JS type/reducer system.

This design does not cover arbitrary Go packages/types, general module graphs, interfaces/pointers/generics, cross-bundle Go object identity, async effects, malicious-code isolation, artifact authenticity, pixels, or untested browser/OS combinations. A finite fixture profile is evidence only for its exact toolchain, artifacts, runtime, and tested React/DOM configurations.

No production files were changed; no tests or builds were run. This is read-only reconnaissance for Gate 0.

## Inspected source pins

| File | SHA-256 |
|---|---|
| `module-coordination/CONTRACT.md` | `52e0ce00c2a4975881a28990b864854f02285b8b4a916bd830b736d39696d219` |
| `compilercontract/contract.go` | `35700b392b396a6ee9bdb822e3004854da75eeccadfd83b2989f754c24bfb188` |
| `compilercontract/value.go` | `e6f26347e56d8bd97f4802dff206489ed3901082525a2b4c7497fe0811c71a1f` |
| `compiled-frontend/analyze/types.go` | `50562366a1ec36c2c3b1ce19c1919ce451500f02cf90e80cc1bcbf82a05afbbf` |
| `compiled-frontend/build/pipeline.go` | `1c3b98f253f011b00a01460eb7b1611d05fb27792e775bd2cd57ab17a5c79309` |
| `counter/counter.go` | `054e4d52258a40dcb3b053ddebe4695ae720b934a0fb0969abb72af55592ae0e` |
