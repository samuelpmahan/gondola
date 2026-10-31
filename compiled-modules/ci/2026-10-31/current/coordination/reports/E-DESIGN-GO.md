# E-DESIGN-GO — Go interface recommendation

## Finding

The existing compiled app is a good base, but it has no independently compiled module bridge yet. The analyzer discovers only `Init() State`, `Update(State, Message) (State, []gobi.Effect)`, and `View(State)` roles; the build requires one component per entry and exports only those three roles. `mountCompiledApp` and `bindCompiledComponent` likewise bind one compiled component. `compilercontract` already supplies closed Go type descriptions, signatures, capabilities, and exact state-value encoding. The existing `counter.State`/`counter.Update` and value-slice fixtures are suitable for child semantics.

## Recommended bridge signatures

Use a small shared Go package, `fixtures/compiled/modulewire`, with primitive-only records:

```go
type Input struct {
    Step int
    Locked bool
    Revision int
}

type Publication struct {
    Count float64
    Revision int
}
```

Keep each parent and child as a normal compiled app with its existing `Init` / `Update` / `View` roles. Add these explicit, generated module bridge roles:

```go
// Child module
func Input(state State, input modulewire.Input) State
func Publication(state State) modulewire.Publication

// Parent module
func Output(state State) modulewire.Input
func Receive(state State, publication modulewire.Publication) State
```

All four are Go functions, so the native oracle can call the exact same transitions/projections used by emitted modules. The compiler should discover these exact optional signatures, include their reachable helpers and type metadata, and export generated role forwarders. Record them in a separate versioned module-ABI descriptor so AppIR v1 and ordinary apps stay unchanged. Bind role IDs and fully described wire types. Admission compares the parent's `Output` result with the child's `Input` parameter and the child's `Publication` result with the parent's `Receive` parameter, including schema, Go type identity, field order/types, role signatures, and required capabilities. Reject mismatches before either Go `Init` or rendering runs.

Build parent and child in separate compiler invocations and output directories; neither imports the other's implementation. Mount them as separate roots in one UI. A generic host owns only root lifecycle/render ordering and transport of validated plain records. It calls generated Go bridge functions and renderer/runtime APIs; it contains no child state reducer. Never pass GoScript class instances between bundles. The finite composition is effect-free; reject nonempty effects. Apply bridges at initialization and preserve this deterministic cycle: parent event → parent Update → parent Output → child Input → child render; child event → child Update → child Publication → parent Receive → parent render. Parent input revisions advance in Go; publications carry the child's captured input revision, and parent Receive ignores stale revisions. Keep renderer swaps on the shared runtime path.

## Native parent oracle

Use a Go parent fixture and deterministic action script. For each parent event, call parent `Update`, then `Output`, then child `Input`; for each child event, call child `Update`, then `Publication`, then parent `Receive`. The child reuses `counter` state/transitions and may render its counter view in the composed view. Record both states, typed input/publication, messages, views, and ABI admission result at every step. Include repeated Add and Reset at zero, alternating Add/Reset, step values 1–3, lock changes, stale publication revisions, renderer swaps, and a deliberately mismatched descriptor; assert the mismatch fails before either `Init` or render. This exercises Go semantics independently of browser/rendering evidence.

## Evidence and limits

Read-only reconnaissance only; no production source changed and no tests/builds were run. The recommendation reuses the current compiler type/value contracts, conventional app roles, `counter`, and the shared renderer/runtime. It requires bounded compiler/manifest and generic host support for the four bridge roles; the current compiler/runtime cannot yet compose these modules. This does not claim arbitrary Go module linking, nested Gobi nodes, general graph compilation, async effects, or cross-bundle object identity.

Inspected pinned sources:

| File | SHA-256 |
|---|---|
| `module-coordination/CONTRACT.md` (initial read) | `3eccc76a9a5be36dfc18830826b52cb28a1b36fa03afff437b70879bbb68990e` |
| `module-coordination/CONTRACT.md` (reconciled ABI recheck) | `52e0ce00c2a4975881a28990b864854f02285b8b4a916bd830b736d39696d219` |
| `compiled-frontend/CONTRACT.md` | `97246c9051d57341b6c92c0516e15e4282f9c709fab4189af7279a32169e3038` |
| `compiled-frontend/analyze/analyze.go` | `9e39ccd6cbe6b68dd5b42af9abf50ee2dc3fe926b4ac08f4f76fafbe59a60f52` |
| `compiled-frontend/build/pipeline.go` | `1c3b98f253f011b00a01460eb7b1611d05fb27792e775bd2cd57ab17a5c79309` |
| `compiled-frontend/frontend/react/bindings.mjs` | `29711c7dea81be8e71549984246c7efdb97e8163096f9cf49d6e04ab1917e02b` |
| `compiled-frontend/frontend/runtime/runtime.mjs` | `52c44ead9f79f75ef7b211168d4cdb1260544846e8735f67cad93ff470240c5f` |
| `counter/counter.go` | `054e4d52258a40dcb3b053ddebe4695ae720b934a0fb0969abb72af55592ae0e` |
