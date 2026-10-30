# G-REACT

Implemented the generic React renderer, AppIR metadata emitter, and configured adapter for the existing `gobi.Backend` interface. `emit.NewBackend().Emit(appIR)` returns deterministic `react-map.gen.mjs` and `components.gen.mjs`; `NewGobiBackend(appIR, identity)` requires a validated AppIR and matching legacy app identity. `bindCompiledComponent` resolves the AppIR Init/Update/View IDs and checks the generated component table and exported role functions.

`createReactRenderer` lowers Node values and binding sidecars without running application code. It uses pinned React/ReactDOM 19.3.1, synchronous commits, optional StrictMode wrapping, live `target.value`/`target.checked` reads, literal `On.Arg` preservation, keyed focus restoration, detached callback fencing, and the `outerHTML-v1` snapshot shape. Validation admits the observed GoScript struct marker and slice windows while rejecting unsupported schemas, accessors, hidden fields, invalid bindings/events, and duplicate sibling keys.

Focused tests passed: `GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 ./emit` (4/4), and `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/react/renderer.test.mjs compiled-frontend/frontend/react/bindings.test.mjs` (14/14).

The GoScript representation support follows N1's pinned v0.6.2 ABI probe. Binder tests use synthetic functions; this lane did not execute a generated app or mount React in a browser. Four-app/browser conformance remains unverified here.
