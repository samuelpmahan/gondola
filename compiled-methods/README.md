# Compiled Go value methods

This experiment compiles a nested counter application with concrete Go value-receiver methods into an actual GoScript module. The same module runs through the existing React and standalone DOM renderers, including renderer replacement between actions. Application state transitions remain in Go; the fixture reuses the original `counter.Init` and `counter.Update`.

The fixture captures a child count, changes the child, and later publishes the captured value to the parent. A Go-defined read-only policy disables child controls and also guards direct Go messages. This is a scalar/nested-value composition experiment. It does not compile the existing session manager or implement subtree ownership and effect cancellation.

## Reproduce

Use Go 1.24, Node 22, locked npm dependencies, and Playwright Chromium. The compiler module requests its pinned Go 1.27.3 toolchain; network access or a populated toolchain/module cache is required.

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
bash run-compiled-methods.sh
```

The default command runs the complete inherited `run-compiled-backends.sh` chain before method-specific tests, both real CLI builds, native/direct/browser comparisons, and an HTTP demo smoke. `bash run-compiled-methods.sh --methods-only` is explicitly partial. Each invocation keeps its own directory under `compiled-methods/artifacts/attempts/`; its `execution.json` records commands, versions, source/output hashes, failures, and final status. A `running` receipt is not acceptance.

After a successful run, serve that attempt's `http-demo/site` directory with a local static HTTP server and open `/`. The directory contains the bundled executable demo. Its buttons add/reset both counters, lock/unlock the child, capture a child value, publish the saved value, and switch renderer while retaining the Go state. The page exposes state, tree, messages, and renderer lifetime records.

## Contract and evidence

See [CONTRACT.md](CONTRACT.md) for supported calls and rejection rules, [FIXTURE.md](FIXTURE.md) for the frozen 18-action script, [RESULTS.md](RESULTS.md) for executed status and limits, and [coordination/state.json](coordination/state.json) for native assignments and dependency gates. Author and independent review packets live in `coordination/reports` and `coordination/receipts`.

The public role ABI remains package-level `Init`, `Update`, and `View`; `gobi.app-ir/v1` is unchanged. Concrete method symbols include the receiver type, their typed signatures prepend the receiver, and call metadata places receiver evaluation before arguments. The Go source is still emitted by GoScript rather than interpreted from the metadata.

Another frontend consumes the same compiled module and encoder, implements the existing synchronous renderer, binding, teardown, and callback-lifetime contract, and passes the native/reference/oracle replay matrix. Supporting another Go application shape additionally requires analyzer coverage and actual compiler/runtime conformance for its types and operations. Pointer-based managers, interfaces, promoted methods, generic receivers, and arbitrary libraries are outside this profile.
