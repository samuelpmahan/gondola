# Compiled Go lifecycle

This milestone compiles a finite Go-owned Parent → Child → Grandchild subtree beside an independent Sibling. The frozen fixture exercises effect requests, descendant-first cancellation, subtree removal and remount, stale and duplicate reply fencing, and a renderer swap while requests are pending. The Go fixture owns state transitions; the lifecycle host only tracks request correlations and delivers replies.

The scope is the fixture in [FIXTURE.md](FIXTURE.md) and [CONTRACT.md](CONTRACT.md). It does not establish compilation for a general pointer-based Manager or arbitrary ownership graph.

The AppIR `effect.request-reply` capability is a coarse effect-route marker. This experiment uses a closed lifecycle host policy for the exact `fixture.request` and `lifecycle.cancel` descriptors and retires canceled runtime correlations. The ordinary compiled runtime host still rejects `lifecycle.cancel`; another frontend must implement this explicit lifecycle profile and pass the replay before claiming cancellation support.

## Run

Use Go 1.24, Node 22, locked npm dependencies, and Playwright Chromium. The compiled frontend selects Go 1.27.3 through `GOTOOLCHAIN`.

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
bash run-compiled-lifecycle.sh
```

The default full run first executes `run-compiled-methods.sh`, then runs Go suites and the browser, renderer, conformance, and shared-host runtime Node suites. It builds the native adapter and fresh React/DOM outputs through `go run ./cmd/gobi-build`, runs the compiled lifecycle runtime suite against the fresh React app directory, and then runs the native/direct/browser matrix and HTTP demo smoke.

`bash run-compiled-lifecycle.sh --lifecycle-only` is an explicit partial route. It runs the lifecycle-specific chain but skips the inherited compiled-methods regression; the receipt and report label this mode.

## Build and evidence layout

Each invocation gets a unique directory under `compiled-lifecycle/builds/attempts/`. The React and DOM profiles each retain `request.json`, raw `result.json`, `buildmanifest.json`, generated `output/**`, and per-file output pins. The same attempt keeps command stdout/stderr, the native binary and trace, the demo site/screenshot, copied matrix traces, and a tar archive whose member hashes are checked after extraction.

The browser harness writes a separate, fresh attempt under `compiled-lifecycle/conformance/evidence/`. The stable E-BUILD execution receipt and readable report live in `coordination/receipts/E-BUILD.json` and `coordination/reports/E-BUILD.md`. An in-progress receipt has `status: running`; only the final receipt reports acceptance.

To view a successful local demo, serve that run's `demo/site` directory with a static HTTP server and open `/`. The demo exposes Go state, view, lifecycle effects, reply outcomes, renderer swaps, and runtime trace for inspection.

## CI

The `gobi-compiled-lifecycle` workflow installs the locked dependencies and browser, runs the same full entrypoint, and uploads the build archive and raw evidence even when a step fails.
