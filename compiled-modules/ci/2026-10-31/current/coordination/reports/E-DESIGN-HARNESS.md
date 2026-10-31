# E-DESIGN-HARNESS — independent Go modules

**Outcome:** `confirmed_reuse` for the harness/renderers, with a new typed-module bridge adapter required. This was read-only design reconnaissance: no source, build, or test changes were made.

## Concrete reuse

- `compiled-children/conformance/direct.mjs` shows how to validate a `gobi.compiled-module/v1` component and invoke compiled Go `Init/Update/View`, generated state encoders, typed effects, Go views, and bindings without a JS app reducer.
- `compiled-children/conformance/browser.mjs` and `browser-entry.mjs` provide the actual Chromium/esbuild harness, import independently generated module/encoder files, drive physical clicks, capture live controls, and exercise React, DOM, and renderer swaps. `check.mjs` compares full typed traces and literal projections and contains mutation controls.
- `compiled-children/runtime/runtime.mjs` and `compiled-frontend/frontend/runtime/runtime.mjs` expose one `mountCompiledApp({module,componentId,encoder,renderer,...})` per module instance, with snapshots, traces, callback fencing, and `replaceRenderer`. Both current renderers consume one ordinary Gobi Node view.
- `session-tree/host.mjs` is a shell/layout precedent: each session owns a renderer root; children have a separate container so parent swaps do not erase child roots. It is not the new ABI host: it currently uses the multi-root bridge.
- `compiled-frontend/demo/build.mjs` bundles four independently compiled modules and their encoders together; `demo/app.mjs` mounts them in separate cards. This proves separate artifact imports, not typed parent-child composition.

The current AppIR/module artifacts provide component/package IDs, state/message type IDs, role signatures, capabilities, and generated encoders. The existing compiled runtime mounts one module at a time, and the renderer has no nested-module slot. The new contract therefore needs a narrow bridge and two-root host, not a handwritten reducer or a renderer tree synthesis in JS.

## Harness plan aligned to the frozen Gate 1 contract

The fixture has exactly two independently built, effect-free modules and shared wire package `fixtures/compiled/modulewire`:

- Parent roles: `Init/Update/View`, `Output(State) modulewire.Input`, and `Receive(State,modulewire.Publication) State`.
- Child roles: `Init/Update/View`, `Input(State,modulewire.Input) State`, and `Publication(State) modulewire.Publication`.
- The parent build must not import the child implementation, and the child build must not import the parent. Each backend build gets independent output directories/artifacts. Generated facades reconstruct destination Go structs from primitive-field arguments; GoScript classes do not cross bundles.

Make the native Go replay, direct compiled replay, actual React, actual DOM, and swap profile consume one fixed script and retain the exact bridge ordering in each trace:

1. Initialize parent, initialize child, call parent `Output` then child `Input`, call child `Publication` then parent `Receive`, then render.
2. For a parent event: parent `Update` → parent `Output` → child `Input`. Do not publish automatically after a parent event.
3. For a child event: child `Update` → child `Publication` → parent `Receive`.

At each checkpoint capture complete typed parent and child states, all Go views, bridge values and ordering, actual actions/dispatches, normalized physical DOM, and ordered live controls. The independent literal oracle must contain those full expected values. Exercise repeated Add/Reset (including Reset at zero), step and lock changes, successful React↔DOM swaps, and rejected ABI candidates before `Init` or renderer update. JS only validates/routes bridge inputs and captures evidence; all arithmetic, lock/reset policy, state, and publication validation remain in Go.

ABI negatives should alter only a candidate descriptor: ABI version, component/role signature, input/publication type ID, field order/shape, capability, or artifact identity. Assert fail-closed admission before any Go init/render call and unchanged container. For an incompatible live renderer/module candidate, assert existing parent and child identities, snapshots, traces, and callbacks stay active, then prove that a real action through the retained callback still works. A successful renderer swap must preserve both module states and trace order. Mutations to bridge values, state fields, order, or DOM must be detected by the checker.

## Recommended ownership paths and API seam

Use the paths selected in the shared contract: N4 owns `compiled-modules/conformance/**` and `compiled-modules/oracle/**`; N3 owns `compiled-modules/runtime/**`; N5 owns `moduleabi/**` and `compiled-modules/abi/**`; N6 owns top-level `compiled-modules/run.mjs` and demo build/docs.

Proposed N4 entry points:

```js
replayModulesDirect({ parent, child, fixture, abi, label })
installCompiledModulesBrowser({ parentModule, childModule, abi, host })
// -> { runProfile, inspectRaw, dispose }
runCompiledModulesBrowserConformance({
  parentReact, childReact, parentDom, childDom,
  fixturePath, expectationsPath, abiPath,
  profileKinds: ["react", "dom", "swap"], outputPrefix, chromiumPath,
})
```

`host` is N3's independent two-root composition adapter; it receives ABI-validated modules and calls only the frozen typed role bridges in the order above. The ABI admission helper is N5's validator. The top-level runner obtains a fresh native Go trace from N1's CLI and passes the exact same fixture and independent expectations into each profile. This API is a harness seam recommendation, not an assertion that these functions exist yet.

## Scope limits

Acceptance is for the frozen finite two-module, effect-free profile, specific tested bridge types, action script, React 19.3.1, and Chromium run. It does not establish arbitrary Go, arbitrary module graphs, async effects, malicious-code containment, cryptographic provenance, concurrent React scheduling, other browsers/OSes, hydration, IME, or pixel equivalence.

## Read-only source pins

| Source | SHA-256 |
| --- | --- |
| `module-coordination/CONTRACT.md` | `52e0ce00c2a4975881a28990b864854f02285b8b4a916bd830b736d39696d219` |
| `gondola/compiled-children/conformance/direct.mjs` | `6e7afeb56a117c4f2f5aafee0f9df3766a6ce6edc01a24883fa79503a184c728` |
| `gondola/compiled-children/conformance/browser-entry.mjs` | `c916521fc57fc5a55634443ad3c0177d2488724b2d35ba4959e0fa3a95ed0734` |
| `gondola/compiled-children/conformance/browser.mjs` | `5f2a47999f0861e2ad3977066ed1903e265d48a4d169f07fab15bc6a45f22ab9` |
| `gondola/compiled-children/conformance/check.mjs` | `e34d01e98d2f3f1b16a84d5108de91ea2c60b5ee01414b5d5e80c8e627ee069e` |
| `gondola/compiled-children/runtime/runtime.mjs` | `7ed7bfa6f567658a0fc283cfce4e76c4dd28fa2646eeea2d8519b2bf4746777b` |
| `gondola/compiled-frontend/frontend/runtime/runtime.mjs` | `52c44ead9f79f75ef7b211168d4cdb1260544846e8735f67cad93ff470240c5f` |
| `gondola/compiled-frontend/frontend/react/renderer.mjs` | `14644a6b2545b2dbf52854779fcf4187d8b1e221636d97178647d64259e04ce4` |
| `gondola/compiled-frontend/frontend/dom/renderer.mjs` | `14d6d12e1360cb1668ce5b901604c1d7d71415aca52fc45f80b34f2a24bbed54` |
| `gondola/compiled-frontend/CONTRACT.md` | `97246c9051d57341b6c92c0516e15e4282f9c709fab4189af7279a32169e3038` |
| `gondola/session-tree/host.mjs` | `f5ce451235ec2506d80d9ac3ebc364a9e43ba774cd56a66e25e3f8f7bd8a0c5a` |
| `gondola/session-tree/README.md` | `ed0d8e9cb9a19e9fe5779b94649dc7916070c06fb334350ee055bc192f0b980c` |
| `gondola/compiled-frontend/demo/build.mjs` | `5d0f7c626a00eb59f37ea5d42eb1a8dbda306fb9b5257a28f62a06652a194f62` |
| `gondola/compiled-frontend/demo/app.mjs` | `cea72624525c608ee1207f7e9cdafad254bad0ae7a41a6a04bbb30fb89b57d15` |
