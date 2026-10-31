# E-INDEPENDENCE (N6)

**Outcome: passed.** A standalone DOM-only browser entry mounted the concrete compiled counter module and encoder selected by the frozen React-profile build manifest. It ran in Chromium through `createDOMRenderer` and the shared compiled-app runtime without importing or loading the React adapter, React, or ReactDOM.

## Proof method

The reproducible proof script is `compiled-backends/evidence/independence/prove-dom-only-counter.mjs`. It reads `/tmp/gobi-e-build-frozen/react/buildmanifest.json`, selects the counter entry, and creates a separate browser bundle with static imports for that entry's generated `gobi-compiled.mjs` and `encoder.mjs`, the DOM renderer, and `mountCompiledApp`. It does not import the demo's React↔DOM swap driver or call a Go function directly from test code. Real browser button clicks generate the application messages.

The esbuild metafile lists seven inputs: the compiled GoScript module, its encoder, shared view validation, the DOM renderer, the generic runtime, the proof entry, and `react-map.gen.mjs`. The named React map is only static attribute/event-name data used by the DOM renderer. No `node_modules/react` or `node_modules/react-dom` input, React renderer/bindings adapter, or external React import appears in the graph. `window.React` and `window.ReactDOM` are both undefined in Chromium.

## Chromium execution

The proof uses Node v22.23.4 and Chromium `153.0.8010.0`. The browser guard replaced every callable own `WebAssembly` API with a recorder that throws, instrumented `fetch` and XHR, observed browser resource requests, and captured page errors and unhandled rejections. The run completed with all of these lists empty:

- WebAssembly API attempts
- Fetch calls and XHR calls
- `.wasm` resource requests
- page errors and unhandled rejections

The live DOM and state observations were:

| Step | Go state | Reset disabled | App ticks |
|---|---:|---:|---:|
| Init | 0 | yes | 1 |
| Add | 1 | no | 2 |
| Add | 2 | no | 3 |
| Reset | 0 | yes | 4 |

The trace messages were exactly `add`, `add`, `reset`. The observations use the compiled Go state encoder and the renderer's live DOM; no JavaScript reducer or synthetic application state was used. HTTP requests were limited to the proof page and its single bundled JavaScript module.

## Frozen input pins

| Input | SHA-256 |
|---|---|
| Frozen React build manifest | `a2fa18abeab82a9d752ed3ecdf2c2734593eb0a292718a6b7e533e13701dbc5c` |
| Counter AppIR | `704e1d767e0abde21a33c300c7cc130a4e318688468a630fd8b394842cb6758b` |
| Concrete `gobi-compiled.mjs` module | `af3f866ab08297a09424af2924eb8faca439a5f70d30847c237420f703cb49f1` |
| Matching encoder module | `383bd7611e2175441e655f98aca6446523b30eec1fcfc5a7bc57048edc30d3f9` |
| Runtime | `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4` |
| DOM renderer | `8037c0b9d3430310aa9492ab9d1041207e33276f8a6dce219b84b2af17efa166` |
| Shared view validation | `ef2aaa7daf021b3e46dd5cec159951ec1e84d4ea3d7f3888ec6b8c27d7a959e0` |
| Static React map data imported by DOM renderer | `9cb7fa3ff84042c36b9ac211dfe2b97a69169e4fb880283e8f000495a8216a54` |

Run JSON, metafile, raw output log, and syntax-check output are preserved in `compiled-backends/evidence/independence/`. The generated bundle and screenshot are in ignored `compiled-backends/artifacts/independence/dom-only-counter/`; bundle SHA-256 is `05087b5f03e4f5e25f21d141fd2d6291160012625148c5f725bce2dae8bcbf42` (587,964 bytes).

Each frozen input was hashed immediately before and after the Chromium run; the preserved run record contains both pin sets and asserts they are identical (`stableAcrossRun: true`). The final runtime pin is the R-OBS frozen SHA-256 `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4`.

## Boundary

This closes the bounded DOM-only counter independence gap. It does not replace N3's four-app, five-fixture React↔DOM browser matrix, establish cross-backend focus transfer, or claim that React-backed and DOM-backed output bundles are byte-identical. No production, compiler, runtime, or demo files were changed by N6.

## Receipt outcome attribution

Native finish validation rejected the receipt outcome enum `passed`; the browser and metafile checks themselves remain passed. Before correction, the receipt was copied byte-for-byte to `coordination/history/E-INDEPENDENCE-invalid-outcome.json` (SHA-256 `99dba87cd6444994fc5667ab93ac03f8c0c8f8f2b35dad304aa23ef3d6b2b12d`). The current receipt's outcome was changed to the allowed `confirmed_reuse`; its enum-only corrected bytes before refreshing the report link had SHA-256 `44c4094688349cd30c1a3856b144c1be129106e160bd8df0e5431810e612f988`. The report-link hash was then refreshed in the receipt. No evidence or run result changed, and no test was rerun for this metadata-only correction.
