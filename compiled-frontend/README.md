# Compiled Go frontend experiment

The unchanged `counter` and three small Go fixtures compile through pinned `github.com/s4wave/goscript` v0.6.2 into TypeScript and JavaScript. One generic React19.3.1 renderer and runtime invoke generated Go forwarding functions. Application state transitions, views and effect declarations stay in Go. This path does not use WASM.

This feature branch stacks on PR10. It preserves the existing `gobi.Node`, `Message`, `On`, `Effect`, `Backend` and original Milestone0 receipt bytes. Explicit controlled-value/checked bindings live in a new `compilercontract.View` sidecar. The nested compiler module requires Go1.27.3; the root application and inherited regression gates retain Go1.24.

## Reproduce

Requirements: Go1.24.x on PATH with Go toolchain download available for Go1.27.3, Node22, and Chromium/Playwright. Dependencies are locked. No production services or credentials are required.

```sh
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install chromium
bash run-compiled-frontend.sh
```

The default command runs every inherited static and interaction gate through `run-typed-composition.sh`, then compiler Go tests/race/vet, runtime/renderer/conformance Node tests, a single atomic four-entry compilation, native replay, independent direct-JavaScript replay and mounted Chromium replay. Five scripts include a separate list-growth regression. Every action and reply is checked. `compiled-frontend/artifacts/execution.json` records commands, versions, exact source pins, comparison reports and failures. Raw traces, logs, generated TypeScript and bundles remain under `compiled-frontend/artifacts/`. Output is not accepted if source hashes change during the run.

For an explicitly partial compiler rerun after installing dependencies:

```sh
bash run-compiled-frontend.sh --compiled-only
```

Set `CHROMIUM_EXECUTABLE_PATH` for inherited gates and `CHROMIUM_PATH` for compiler conformance when using a separately provisioned Chromium binary. The local runner discovers `/tmp/chromium` when available; CI installs the pinned Playwright browser.

Go1.24 does not recognize this environment's linked-worktree `.git` file when stamping binaries and searches an invalid ancestor checkout. For that environment, run with `GOFLAGS=-buildvcs=false`; this disables binary VCS stamping only. Source hashes and published Git trees are recorded separately. A normal clean CI checkout uses the default stamping behavior.

## Demonstrate

After the build, serve the repository root:

```sh
python3 -m http.server 8080
# Open http://127.0.0.1:8080/compiled-frontend/artifacts/demo/
```

The four cards expose actual compiled Go state and ordered traces. The form includes text/checkbox controls and literal-message behavior; the list supports stable keyed edits; the effect's manual host completes a captured request after its pending state is visible. WebAssembly APIs are disabled in this demo. Inspect readable compiler output under `artifacts/compiled/`.

## Inspect the executed checkpoint without rebuilding

`evidence/accepted/` contains the accepted execution, per-script check reports, HTTP smoke, screenshot and full artifact manifest. The checked archive preserves all309 executed artifact files, including209 compiler outputs, native executable, generated forwarding Go/TypeScript, raw traces and logs. The separate capture archive retains independent N6 runs and earlier failed browser bundles; historical reports identify their limits.

```sh
mkdir -p compiled-frontend/artifacts
tar -xJf compiled-frontend/evidence/compiled-artifacts.tar.xz -C compiled-frontend/artifacts
tar -xJf compiled-frontend/evidence/conformance-captures.tar.xz -C compiled-frontend
tar -xJf compiled-frontend/evidence/historical-compiled-modules.tar.xz -C compiled-frontend
```

Use the artifact manifest and evidence checksums to verify bytes. The same native/direct/browser `check.mjs` command can recheck extracted traces offline. Rebuild for your platform to execute native binaries. The archived outputs are experimental evidence; no production deployment is included.

## Contracts and limits

[CONTRACT.md](CONTRACT.md) defines closed versioned AppIR/build/trace/host contracts. [semantic/ABI.md](semantic/ABI.md) records actual compiler behavior and negative probes. [DESIGN.md](DESIGN.md) records ownership and deliberate adaptations; [RESULTS.md](RESULTS.md) distinguishes executed evidence from untested guarantees.

The accepted profile is deliberately small: structs, slices, selected numeric operations and library calls, explicit bindings, keyed nodes and one deterministic request/reply effect. Unsupported reachable operations produce source-relative diagnostics. Full Go, arbitrary standard-library behavior and overflow equivalence are not claimed. The public compiler does not expose typed semantic IR; the source loader independently uses Go AST and type information.

Another frontend backend must implement `gobi.Backend` through the configured AppIR adapter, consume the same emitted Go symbols and exact typed state, preserve keys/bindings/controlled properties, provide synchronous commit and honest DOM/lifecycle observations, and pass all four native/direct/browser scripts plus rejection and mutation controls. This experiment does not establish a second compiled backend, concurrent React scheduling, hydration, IME, pixels, cross-engine behavior or production effects.
