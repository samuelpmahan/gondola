# E-DEMO

**Outcome: insufficient_evidence.** inherited-full-runner failed; captured inherited-full-runner.stdout.log and inherited-full-runner.stderr.log

## Execution

- Mode: `full`
- Status: `failed`
- Source pins: unchanged
- Started: 2026-10-31T01:06:50.874Z
- Finished: 2026-10-31T01:29:48.343Z

Exact commands executed:

- `/opt/hostedtoolcache/node/22.23.4/x64/bin/node --check /home/runner/work/gondola/gondola/compiled-backends/run.mjs` — exit 0 (syntax-runner).
- `/opt/hostedtoolcache/node/22.23.4/x64/bin/node --check /home/runner/work/gondola/gondola/compiled-backends/demo/app.mjs` — exit 0 (syntax-demo-app).
- `/opt/hostedtoolcache/node/22.23.4/x64/bin/node --check /home/runner/work/gondola/gondola/compiled-backends/demo/build.mjs` — exit 0 (syntax-demo-build).
- `/opt/hostedtoolcache/node/22.23.4/x64/bin/node --check /home/runner/work/gondola/gondola/compiled-backends/demo/smoke.mjs` — exit 0 (syntax-demo-smoke).
- `bash -n /home/runner/work/gondola/gondola/run-compiled-backends.sh` — exit 0 (syntax-shell-runner).
- `go version` — exit 0 (version-root-go; env {"GOTOOLCHAIN":"local"}).
- `go version` — exit 0 (version-compiled-go; env {"GOTOOLCHAIN":"go1.27.3"}).
- `bash /home/runner/work/gondola/gondola/run-compiled-frontend.sh` — exit 1 (inherited-full-runner; env {"GONDOLA_SKIP_NPM_CI":"1","GONDOLA_SKIP_BROWSER_INSTALL":"1"}).

Nested inherited runner commands:

- `go version` — exit 0 (inherited/version-go).
- `go version` — exit 0 (inherited/version-root-go; env {"GOTOOLCHAIN":"local"}).
- `go test ./compilercontract ./fixtures/compiled/... ./cmd/compiled-native` — exit 0 (inherited/root-go-tests; env {"GOTOOLCHAIN":"local"}).
- `go test -race ./compilercontract ./fixtures/compiled/... ./cmd/compiled-native` — exit 0 (inherited/root-go-race; env {"GOTOOLCHAIN":"local"}).
- `go vet ./compilercontract ./fixtures/compiled/... ./cmd/compiled-native` — exit 0 (inherited/root-go-vet; env {"GOTOOLCHAIN":"local"}).
- `go test ./analyze ./build ./cmd/... ./emit` — exit 0 (inherited/go-tests).
- `go test -race ./analyze ./build ./cmd/... ./emit` — exit 0 (inherited/go-race).
- `go vet ./analyze ./build ./cmd/... ./emit` — exit 0 (inherited/go-vet).
- `/opt/hostedtoolcache/node/22.23.4/x64/bin/node --test /home/runner/work/gondola/gondola/compiled-frontend/frontend/dom/renderer.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/bindings.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/renderer.browser.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/renderer.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/frontend/runtime/runtime.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/browser-options.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/check.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/compare.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/direct-js.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/dom-oracle.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/fixture-expectations.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/list-growth.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/no-wasm.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/observed-action.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/provenance-order.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/provenance.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/conformance/trace.test.mjs` — exit 1 (inherited/node-tests).

## Versions

- node: `v22.23.4`
- react: `19.3.1`
- reactDOM: `19.3.1`
- playwright: `1.64.1`
- esbuild: `0.28.2`
- rootGo: `go version go1.24.13 linux/amd64`
- compiledGo: `go version go1.27.3 linux/amd64`

## Checks

- No end-to-end check completed.

## Failures

- inherited-full-runner: inherited-full-runner exited with 1 (stdout e6fc670f1024ac019e5657a0c5a8ea64023484aac398c23f49511012beacd7c1, stderr 14cec0ac5546433c6691e3b9dd3c2dbeaa02459e2ec982a8f02c24dcb1f0f05f).

## Limits

- The demo's effect host is in memory and returns the captured argument; it does not send production transport requests.
- The DOM and React renderers replace physical nodes. The check asserts Go state, focus/selection where the renderer contract covers it, preserved pending effect delivery, and stale callback suppression; it does not assert cross-backend DOM node identity.
- A renderer replacement failure is surfaced without a visual rollback guarantee.
- Raw bundle hashes from separate compiler output directories are retained; no bundle normalization is treated as proof. The demo and harness each load one actual raw compiled module and exercise it with both renderers.
- The checkout uses its configured Go VCS stamping behavior.
- The inherited full runner was requested before backend-specific checks.
