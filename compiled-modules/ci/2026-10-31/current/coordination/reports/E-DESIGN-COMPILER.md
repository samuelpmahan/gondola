# E-DESIGN-COMPILER — independent typed module boundary

**Outcome:** `confirmed_reuse` for the existing GoScript/AppIR compiler and React/DOM renderer APIs, with a bounded generated bridge export and host pair adapter required. This is read-only design reconnaissance; no production source, tests, or builds were changed or run.

## Compiler findings

`compiled-frontend/build.Build` accepts a `BuildRequest`, validates it, analyzes its entry packages, compiles generated Go forwarders, emits an AppIR, encoder and component file per app, bundles `gobi-compiled.mjs`, and writes `buildmanifest.json` (`gobi.build-manifest/v1`). A request with several entry packages still uses one generated forwarder module and one GoScript `CompilePackages` invocation. It does not establish the independent compilation boundary required here. Build the parent and child in separate requests, each with one entry package, a separate `OutputDir`, and its own manifest/artifact directory. The existing `compiled-frontend/cmd/gobi-build` CLI accepts the normal build request; no second compiler or general module linker is needed.

The existing analyzer requires package-level `Init`, `Update`, and `View`, and roots supported-function reachability/type collection at those roles. The forwarder generator and bundled facade currently expose only those three roles. `gobiCompiled` has schema `gobi.compiled-module/v1` and the current frontend runtime admits the exact three-role `symbols` shape. Preserve that object and its standard symbol exports unchanged for legacy apps. Do not add bridges to that `symbols` object.

## Bounded bridge recommendation

Keep AppIR/component v1 unchanged. Extend analysis only for these exact optional package functions, in addition to the existing three app roles:

```go
// Child
func Input(state State, input modulewire.Input) State
func Publication(state State) modulewire.Publication

// Parent
func Output(state State) modulewire.Input
func Receive(state State, publication modulewire.Publication) State
```

The shared wire package is `fixtures/compiled/modulewire` with the frozen `Input{Step int, Locked bool, Revision int}` and `Publication{Count float64, Revision int}` records. Add an optional `moduleABI` manifest path that points to a separate descriptor file with schema `gobi.module-abi/v1`, and a separate named `gobiModuleBridges` export. Ordinary apps retain no module ABI descriptor. Describe the component/package identity, exact ordered bridge signatures and closed wire-type field descriptions, and an artifact digest binding the descriptor to its module/encoder/AppIR outputs. The compatibility check should compare the expected parent/child roles, exact signature and nominal shared type identity, and ordered field kinds/types. N5's proposed `Describe(appIR, artifactFiles)` and `ValidatePair(parent, child)` are suitable helper seams; these are recommendations, not existing APIs.

Generate local primitive adapters rather than passing a struct/class across module bundles. For incoming `Input` and `Publication`, host code validates the plain record's exact keys and primitive types, then passes primitive fields to a wrapper compiled into the receiving module; that wrapper reconstructs that module's own `modulewire` GoScript value and invokes its bridge role. For outgoing `Output` and `Publication`, a wrapper projects the local GoScript struct fields into a plain record before returning to the host. Keep all state transitions, input revision updates, publication freshness checks, and counter math in Go. Accept only the finite scalar fields and numeric range established by the shared contract; reject unsupported or unsafe values at the bridge boundary.

N3's `mountCompiledModulePair({parent, child, renderer, container, ...})` proposal fits the ABI boundary. It should validate both descriptors before calling either `Init`, `View`, renderer factory, or mutating DOM; then own two ordinary module runtimes and separate DOM/React containers under the outer root. At init, call parent `Init`, child `Init`, parent `Output` then child `Input`, and child `Publication` then parent `Receive`; after parent events call parent `Output` then child `Input`; after child events call child `Publication` then parent `Receive`, in the frozen deterministic order. Render only after each full synchronous transaction. Callbacks dispatch only to their owning module. Version 1 is effect-free: reject nonempty effects. The current one-module runtime and renderers do not provide pair mounting or child slots, so N3 needs a small composition/container adapter; neither renderer needs a new view-node ABI.

## Lowest-risk compiler change surface

- `compiled-frontend/analyze/analyze.go`: discover only the four exact optional function names when present, validate role-specific `go/types` signatures against `modulewire` records, add those functions as reachability roots, and include their typed symbols and type closure in compiler analysis. Keep ordinary Init/Update/View validation and update-derived capability rules intact.
- `compiled-frontend/build/pipeline.go`: generate optional Go forwarders for present bridge roles and export them separately as `gobiModuleBridges`; leave `gobiCompiled` shape and its three standard symbols alone. Add the additive `moduleABI` manifest entry and bind it to sorted output paths, sizes, and digests. Parent/child use separate build transactions.
- `compilercontract` or a small build helper: derive a closed, ordered bridge descriptor from existing `TypeInfo` and signatures; validate exact primitive types, field names/order, safe numeric representation and capability requirements. Add focused analyzer/build tests for exact accepted signatures, absent optional roles, malformed/crossed signatures, bad field shape, incompatible pair, and legacy facade stability.
- `compiled-frontend/frontend/runtime/runtime.mjs` and React/DOM integration are N3's scope; keep host policy out of the Go analyzer. Host pair admission consumes the separate descriptor and bridge export only.

This is finite to two independent apps and two typed ports; it does not require cross-package module graph compilation, a JS application reducer, generic nested components, or changes to the existing view-node mapping. It also avoids relying on TypeID alone: the ABI binds package/artifact identity and validates the full ordered type closure. These hashes are consistency checks, not a claim of trusted or cryptographic code provenance.

## Read-only source pins

| Source | SHA-256 |
|---|---|
| `gondola/compiled-frontend/CONTRACT.md` | `97246c9051d57341b6c92c0516e15e4282f9c709fab4189af7279a32169e3038` |
| `gondola/compiled-frontend/analyze/analyze.go` | `9e39ccd6cbe6b68dd5b42af9abf50ee2dc3fe926b4ac08f4f76fafbe59a60f52` |
| `gondola/compiled-frontend/analyze/types.go` | `50562366a1ec36c2c3b1ce19c1919ce451500f02cf90e80cc1bcbf82a05afbbf` |
| `gondola/compiled-frontend/analyze/load.go` | `36d4218e5bac025c644ce19bf5bd7af4aa41b7429265a0f75030e794ea32dc4f` |
| `gondola/compiled-frontend/build/pipeline.go` | `1c3b98f253f011b00a01460eb7b1611d05fb27792e775bd2cd57ab17a5c79309` |
| `gondola/compiled-frontend/build/request.go` | `7d288b0cd06e480a7dea0098ece974432f5e9e89cc602ba52a5f697ec1c6d6e6` |
| `gondola/compilercontract/contract.go` | `35700b392b396a6ee9bdb822e3004854da75eeccadfd83b2989f754c24bfb188` |
| `gondola/compilercontract/validation.go` | `43b7ca7356782caa23ed8826b8778e5ce91eabaab50dcd06580a10d70deadc8e` |
| `gondola/compilercontract/js_encoder.go` | `a605b3267f63f7c7ed90c17ee2ed9bf04c7667827a23496c8620070f13b9b46d` |
| `gondola/compiled-frontend/emit/backend.go` | `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed` |
| `gondola/compiled-frontend/frontend/runtime/runtime.mjs` | `52c44ead9f79f75ef7b211168d4cdb1260544846e8735f67cad93ff470240c5f` |
| `gondola/compiled-frontend/frontend/react/renderer.mjs` | `14644a6b2545b2dbf52854779fcf4187d8b1e221636d97178647d64259e04ce4` |
| `gondola/compiled-frontend/frontend/dom/renderer.mjs` | `14d6d12e1360cb1668ce5b901604c1d7d71415aca52fc45f80b34f2a24bbed54` |
| `gondola/compiled-frontend/build/bundle.mjs` | `62683c1073645b1748f9607c4d29d09956883fa038e5613745bba45e006f6f1b` |
| `gondola/compiled-frontend/cmd/gobi-build/main.go` | `9f9dbbf3c0bf5e90333e3d406d4150cc5d354dfb5af59df76b5fc11a3f7f21ee` |
| `gondola/gobi/node.go` | `e51a1970f0a8e72ffd3d5aaf06f8fcce2137fd87113bb7412f692671743bcc93` |
