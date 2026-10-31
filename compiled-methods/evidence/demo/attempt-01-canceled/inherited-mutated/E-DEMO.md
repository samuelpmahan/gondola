# E-DEMO

**Outcome: mixed_change.** The HTTP demo and backend runner now build both compiler profiles, compare their shared AppIR and helper outputs, and exercise each actual GoScript module through state-preserving DOM/React swaps.

## Execution

- Mode: `backends-only`
- Status: `passed`
- Source pins: unchanged
- Started: 2026-10-31T00:56:09.304Z
- Finished: 2026-10-31T00:56:34.788Z

Exact commands executed:

- `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/run.mjs` — exit 0 (syntax-runner).
- `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/demo/app.mjs` — exit 0 (syntax-demo-app).
- `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/demo/build.mjs` — exit 0 (syntax-demo-build).
- `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/demo/smoke.mjs` — exit 0 (syntax-demo-smoke).
- `bash -n /workspace/scratch/39a56936f173/gondola-backends/run-compiled-backends.sh` — exit 0 (syntax-shell-runner).
- `go version` — exit 0 (version-root-go; env {"GOTOOLCHAIN":"local"}).
- `go version` — exit 0 (version-compiled-go; env {"GOTOOLCHAIN":"go1.27.3"}).
- `go build -o /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled-native ./cmd/compiled-native` — exit 0 (build-native; env {"GOTOOLCHAIN":"local","GOFLAGS":"-buildvcs=false"}).
- `go run ./cmd/gobi-build` — exit 0 (compile-react; env {"GOTOOLCHAIN":"go1.27.3","GOFLAGS":"-buildvcs=false"}).
- `go run ./cmd/gobi-build` — exit 0 (compile-dom; env {"GOTOOLCHAIN":"go1.27.3","GOFLAGS":"-buildvcs=false"}).
- `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/conformance/run.mjs --app-ir /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/counter-b05e9eb0e4e6/app-ir.json --compiled /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/counter-b05e9eb0e4e6/gobi-compiled.mjs --helpers /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/counter-b05e9eb0e4e6/encoder.mjs --native-bin /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled-native --fixture /workspace/scratch/39a56936f173/gondola-backends/compiled-frontend/fixtures/counter.json --output /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/conformance/counter.json --chromium /tmp/chromium` — exit 0 (backend-conformance-counter; env {"CHROMIUM_PATH":"/tmp/chromium"}).
- `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/conformance/run.mjs --app-ir /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/form-a3fe6b48b000/app-ir.json --compiled /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/form-a3fe6b48b000/gobi-compiled.mjs --helpers /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/form-a3fe6b48b000/encoder.mjs --native-bin /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled-native --fixture /workspace/scratch/39a56936f173/gondola-backends/compiled-frontend/fixtures/form.json --output /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/conformance/form.json --chromium /tmp/chromium` — exit 0 (backend-conformance-form; env {"CHROMIUM_PATH":"/tmp/chromium"}).
- `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/conformance/run.mjs --app-ir /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/list-f8359aa2866d/app-ir.json --compiled /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/list-f8359aa2866d/gobi-compiled.mjs --helpers /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/list-f8359aa2866d/encoder.mjs --native-bin /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled-native --fixture /workspace/scratch/39a56936f173/gondola-backends/compiled-frontend/fixtures/list.json --output /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/conformance/list.json --chromium /tmp/chromium` — exit 0 (backend-conformance-list; env {"CHROMIUM_PATH":"/tmp/chromium"}).
- `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/conformance/run.mjs --app-ir /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/effect-ff8449e8f5b2/app-ir.json --compiled /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/effect-ff8449e8f5b2/gobi-compiled.mjs --helpers /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/effect-ff8449e8f5b2/encoder.mjs --native-bin /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled-native --fixture /workspace/scratch/39a56936f173/gondola-backends/compiled-frontend/fixtures/effect.json --output /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/conformance/effect.json --chromium /tmp/chromium` — exit 0 (backend-conformance-effect; env {"CHROMIUM_PATH":"/tmp/chromium"}).
- `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/conformance/run.mjs --app-ir /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/list-f8359aa2866d/app-ir.json --compiled /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/list-f8359aa2866d/gobi-compiled.mjs --helpers /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react/apps/list-f8359aa2866d/encoder.mjs --native-bin /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled-native --fixture /workspace/scratch/39a56936f173/gondola-backends/compiled-frontend/conformance/fixtures/list-growth.json --output /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/conformance/list-growth.json --chromium /tmp/chromium` — exit 0 (backend-conformance-list-growth; env {"CHROMIUM_PATH":"/tmp/chromium"}).
- `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/demo/build.mjs --compiled /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/compiled/react --output /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/demo --backend react` — exit 0 (build-http-demo).
- `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/demo/smoke.mjs --demo /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/demo` — exit 0 (http-demo-smoke; env {"CHROMIUM_PATH":"/tmp/chromium"}).

## Retry history

- Attempt 01 failed during module import before a complete attempt archive was captured. No complete execution receipt, logs, source snapshot, build outputs, or traces remain; its artifacts were not reconstructed.
- Attempt 02 failed when the HTTP smoke timed out waiting for `window.gobiDemo`; its server containment check rejected the root URL. Its 519-file archive is `compiled-backends/artifacts/failed-attempts/demo-attempt-02/` and all archived hashes verified.
- Attempt 03 passed the five backend conformance profiles, then failed because the smoke compared the `rendererDiagnostics().fencedCallbacks` array directly with a number. Its 513-file archive is `compiled-backends/artifacts/failed-attempts/demo-attempt-03/` and all archived hashes verified.
- The focused command `CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node compiled-backends/demo/smoke.mjs --demo compiled-backends/artifacts/demo` exited 0 against the attempt-03 build after the count assertion fix. The fresh composed run below independently repeated and passed the complete HTTP smoke.

## Versions

- node: `v22.23.4`
- react: `19.3.1`
- reactDOM: `19.3.1`
- playwright: `1.64.1`
- esbuild: `0.28.2`
- rootGo: `go version go1.24.0 linux/amd64`
- compiledGo: `go version go1.27.3 linux/amd64`

## Checks

- --backends-only explicitly skipped the inherited frontend regression chain
- react CLI build published four apps with the requested per-app backend metadata
- dom CLI build published four apps with the requested per-app backend metadata
- React and DOM manifests match apart from backend tags; AppIR, encoders, components, Gobi node mapping, forwarder sources, and GoScript TypeScript are byte-identical; raw bundle hashes are recorded separately and the demo/harness use one actual bundle with both renderers
- counter native/direct/browser backend conformance passed
- form native/direct/browser backend conformance passed
- list native/direct/browser backend conformance passed
- effect native/direct/browser backend conformance passed
- list-growth native/direct/browser backend conformance passed
- four-card HTTP demo passed state, focus/selection, stale callback, pending effect, and no-WASM assertions

## Failures

- None recorded.

## Limits

- The demo's effect host is in memory and returns the captured argument; it does not send production transport requests.
- The DOM and React renderers replace physical nodes. The check asserts Go state, focus/selection where the renderer contract covers it, preserved pending effect delivery, and stale callback suppression; it does not assert cross-backend DOM node identity.
- A renderer replacement failure is surfaced without a visual rollback guarantee.
- Raw bundle hashes from separate compiler output directories are retained; no bundle normalization is treated as proof. The demo and harness each load one actual raw compiled module and exercise it with both renderers.
- For this linked worktree, GOFLAGS=-buildvcs=false disables binary VCS stamping only; the command remains in the receipt.
- This was the explicit --backends-only route; inherited full regression gates were skipped.
