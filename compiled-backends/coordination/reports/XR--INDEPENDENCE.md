# XR--INDEPENDENCE (N4 independent review)

**Decision: accepted for the bounded DOM-only counter boot proof.** The evidence shows the concrete counter module and encoder selected from the frozen React-profile manifest execute in a standalone Chromium bundle with the DOM renderer and shared runtime. This accepts the independence claim for that counter run only; it does not accept the React↔DOM app matrix.

## Bundle evidence

The script selects `github.com/samuelpmahan/gondola/counter` from `/tmp/gobi-e-build-frozen/react/buildmanifest.json` and asserts the selected app has `backend: "react"`. It imports that app's exact `gobi-compiled.mjs` and `encoder.mjs`, checks the AppIR component's Init/Update/View symbol exports, then mounts that module through `mountCompiledApp` and `createDOMRenderer`.

The esbuild metafile records seven inputs: that compiled GoScript module, its encoder, the shared View validator, `react-map.gen.mjs`, the DOM renderer, the generic runtime, and the proof entry. There are no `react`/`react-dom` package inputs, React renderer or bindings adapter inputs, or external React imports. `react-map.gen.mjs` is static attribute/event mapping data imported by the DOM renderer; its pathname does not mean the React renderer was bundled. The bundle output has no React or ReactDOM globals, and the browser checks `window.React` and `window.ReactDOM` are absent.

The artifact SHA-256 is `05087b5f03e4f5e25f21d141fd2d6291160012625148c5f725bce2dae8bcbf42` (587,964 bytes); the metafile SHA-256 is `4103c86d36151df7ac180e95eff996301c6ae379fb312dcc8c59ca693118a7c3`.

## Browser behavior and guards

The recorded Chromium `153.0.8010.0` run reads the typed state snapshot through the emitted encoder and clicks actual DOM buttons. It records Init at count 0 with Reset disabled; Add at 1 and 2 with Reset enabled; then Reset at 0 with Reset disabled. The trace has exactly four ticks and messages `add`, `add`, `reset`.

The page replaces callable own WebAssembly APIs with throwing recorders and instruments Fetch and XHR before loading the module. The run records no WebAssembly API attempts, Fetch calls, XHR calls, `.wasm` resources, page errors, or unhandled rejections. Browser resource requests are limited to the local proof page and its single bundle. These are observations from this controlled run, not a universal no-network or security claim.

## Pins and receipt history

The run JSON records identical `filesBefore` and `filesAfter` sets for the manifest, AppIR, compiled module, encoder, DOM renderer, runtime, shared View code, static React map data, and proof script. `stableAcrossRun` is true. In particular, the recorded runtime pin is `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4`, and the current runtime file has the same hash. The complete independent extraction and reviewed hashes are in `evidence/reviews/xr-independence/audit.json`.

The original E-INDEPENDENCE worker receipt with `outcome: "passed"` failed the receipt enum validator. Its bytes remain preserved at `coordination/history/E-INDEPENDENCE-invalid-outcome.json` (SHA-256 `99dba87cd6444994fc5667ab93ac03f8c0c8f8f2b35dad304aa23ef3d6b2b12d`). The current receipt has valid `outcome: "confirmed_reuse"`; it records the metadata correction and links the same underlying run, metafile, source pins, and logs. The run JSON's separate `decision: "passed"` is the proof-run result, not the worker-receipt outcome. The enum correction did not rerun the browser proof, and no rerun is needed to validate that metadata-only correction. Thus the artifact proof is sound while its receipt history is explicitly not pristine.

## Boundary

This review accepts a single DOM-only boot of the counter module produced under the React build profile. It does not prove a same-session React↔DOM swap, cross-backend focus behavior, the four-app/five-fixture matrix, byte-identical bundles from separate builds, or independence from every possible browser API. No new browser run was performed because the preserved raw run, bundle metadata, and stable source pins answer the assigned questions. No production files were changed.
