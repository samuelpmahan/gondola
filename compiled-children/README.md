# Compiled keyed child collections

This fixture demonstrates a bounded two-level Go state model: one parent and an ordered, keyed `[]ChildState`. Go owns child identity, order, counters, generations, request sequences, pending replies, and cancellation. The compiler emits the package as AppIR and a GoScript module; the shared host runs that module with React or DOM renderers. There is no JavaScript child-collection reducer and no compiler production change for this fixture.

The frozen contract in [CONTRACT.md](CONTRACT.md) covers add, remove, reorder, duplicate and malformed input, counter updates, requests, stale replies after key reuse, child-only clear, parent removal/remount, disabled controls, and compatible or rejected renderer swaps. Child removal and clear cancel pending child work in reverse presentation order. Parent removal cancels children first, then the parent request. A reused key gets a fresh generation.

## Reproduce the full evidence chain

Use Go 1.24 for the native Go program, the Go 1.27.3 toolchain selected by `GOTOOLCHAIN` for the compiler, Node 22, Chromium, and the locked React/ReactDOM 19.3.1 dependencies. The runner checks the tool versions, lockfile hashes, and installed dependency versions. The project uses the existing root, `interaction/`, and `compiled-frontend/` npm lockfiles.

From the repository root, install the locked dependencies and browser once:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
```

If using the supplied local toolchains, put them on `PATH` and select Chromium explicitly:

```sh
export PATH="/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH"
export CHROMIUM_PATH=/tmp/chromium
```

Run the full-only pipeline from the repository root:

```sh
bash run-compiled-children.sh
```

The runner starts a fresh inherited `run-compiled-capabilities.sh` regression, runs the host and conformance tests, builds the fixture through the existing compiler for React and DOM, checks the independent literal oracle, replays native/direct/browser traces and bounded seeded sequences, then builds and drives the HTTP demo in Chromium. The run has no partial mode. A failed stage is recorded and makes the command fail. CI installs the dependencies before calling this command.

Each run creates `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/`. Logs, raw captures, generated React and DOM builds, and demo files (including `demo/site/` and `demo/screenshot.png`) are inside that directory. The canonical delivery report and receipt are `compiled-children/coordination/reports/E-DELIVERY.md` and `compiled-children/coordination/receipts/E-DELIVERY.json`. The byte-checked archive and external manifest are siblings of the attempt directory at `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>.tar.gz` and `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>.archive-manifest.json`. After a successful run, find the exact `attempt` in the receipt and serve its demo site:

```sh
python3 -m http.server 8000 --directory compiled-children/demo/output/attempts/<attempt-id>/demo/site
```

Open `http://localhost:8000`. The demo uses actual compiled Go controls, lets you change counters and collection order, manually deliver pending replies, swap between compatible React and DOM renderers, and try an incompatible renderer candidate.

For a native-only fixed trace, the exact command is:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json
```

The output is the full step-aligned native trace, not a summarized application model. For acceptance, use the full runner above so the native result is checked against the compiled modules, browser captures, and independent literal expectations.

## Add another renderer backend

The backend contract reuses the compiled Go app and the shared renderer/effect runtime:

1. Keep domain transitions and `View` generation in the Go package. Build it through the existing compiler and consume its manifest paths for AppIR, generated encoder, and compiled module; do not create a JavaScript collection state machine.
2. Declare the app's closed capabilities: `view.node`, `effect.request-reply`, and `effect.cancel`. The renderer must advertise `view.node` and implement the existing renderer API (`update`, `viewRecord`, `domSnapshot`, and `unmount`). A candidate missing a required capability must be rejected while the current mount and callbacks remain active.
3. Mount through `mountCompiledChildrenApp({ module, componentId, appId, encoder, renderer, onTick, onFailure })`. The host exposes `effects.pending()`, `effects.records()`, and explicit `effects.deliver(token)`. It owns request/correlation bookkeeping only; Go decides which parent or child generation is live and whether a completion is accepted.
4. Replay the same fixture and literal expectations through native Go, each direct compiled module, and the mounted renderer. Compare complete typed state, Gobi view trees, ordered effects/messages, actual controls and DOM captures, key identity through reorder/reuse, disabled behavior, cancellation order, stale callback fencing, and accepted/rejected swaps. Add real browser actions for any renderer behavior the capture claims to cover.

The HTTP demo currently starts from the React compiled output and changes renderers through the shared runtime. A new backend should enter that same contract and conformance replay; it should not add a separate model or bypass the compiled controls.

## Scope and limits

This is a guarded Go profile: no mutable package globals, bounded numeric loops and key parsing, and value/slice state shapes supported by the current compiler. It demonstrates this parent plus keyed collection, not arbitrary Go object graphs, general map/pointer support, or unrestricted Go compilation. It does not establish behavior on other JavaScript engines, a production effect transport, hydration, IME input, concurrent React rendering, pixel-level output, or focus identity. The browser checks concern actual controls and recorded DOM structure/events within the fixed and bounded seeded schedules.

## Evidence status

Historical author captures are summarized in [RESULTS.md](RESULTS.md). They are not the pending exact-source acceptance run. At this documentation freeze, inherited-gate freshness/byte checks, fail-closed WebAssembly instrumentation, and active-renderer identity checks are under repair; the seeded coverage assertion repair is complete but its independent review is pending. Independent reviews for all four amendments and a fresh root-owned full run are still required before final acceptance. The source-bound runner pins this README and `RESULTS.md`; any later documentation edit requires a new evidence capture.
