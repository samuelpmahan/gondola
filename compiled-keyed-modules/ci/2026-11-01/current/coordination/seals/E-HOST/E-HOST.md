# E-HOST author report — N3

**Outcome:** `mixed_change`. Added the compiled keyed-module host and actual-artifact runtime checks under the assigned `compiled-keyed-modules/runtime/**` path. No shared module ABI, renderer, or compiler architecture was rewritten.

## Runtime behavior

`mountCompiledKeyedModules(options)` consumes the independently compiled parent and existing `modulechild` build records, the backend renderer factories, and an empty DOM container. The parent build carries the `gobiKeyedModuleHelpers` sidecar. Before mounting, the host checks the helper byte length/SHA-256 and its backend, package, component, module ABI, and AppIR identity, then uses the existing closed module-pair validator and component binder.

The host reads ordered `{key,generation}` membership from Go `Children`. It initializes and retains a separate child Go state and renderer for each current key, applies the parent `Output` input to each instance, and sends child publications through only Go `ReceiveKeyed(key,generation,publication)`. It does not route keyed publications through the legacy no-op `Receive`. Removal unmounts that child; remount initializes only the new generation. Reorder changes root order while retaining each child instance/root. Renderer replacement has its own epoch fence, independent of Go's key-generation check.

The host provides renderer-neutral `viewRecord()` and `domSnapshot()` captures, per-key root/content identity IDs, current-control lookup by Go View path, trace call order/counts, and stale/suppressed event recording. Browser callers can use `elementAtPath(target,key,path)` to click the currently mounted control. A disabled control is recorded only after the caller has established the physical click was suppressed and no callback/Go call occurred.

Snapshot schema is `gobi.keyed-module-snapshot/v1`. It includes parent projections (`state`, `controllerState`, `goState`, encoded state, view, DOM, identity) and ordered child rows with key/generation, parent input, Go child state aliases, keyed publication, view, DOM, and identity. Trace schema is `gobi.keyed-module-trace/v1`, with bridge calls, role call order/counts, checkpoints, renderer swaps, disabled controls, stale callbacks, and stale publications.

## Verification

Build index: `compiled-keyed-modules/build/output/E-BUILD-final/build-index.json`, 84,891 bytes, SHA-256 `75df29c02218fab47294454bb0338a720d806901d64377b4cae024fd4f6a2e66`. The host tests loaded the final actual compiled artifacts through the source-pinned keyed build loader. Both independently compiled DOM and React parent/child pairs were exercised by the runtime test; each passed sibling isolation, reorder retention, remove/remount generation fencing, renderer-swap state retention, and stale callback/publication call-count checks.

The keyed helper descriptor source identity pins are: fixture `fixtures/compiled/keyedmoduleparent/app.go` (7,040 bytes, SHA-256 `610064486c28cb8a2abe1dc7094d8cf37312ea852e7ab83335b7239c1bb9c3b9`); emitted `index.ts` (186 bytes, SHA-256 `0a426e9c1e26906a6aa9b9484dc45f97d1eb233e10fa549b4c6ba86c985e5c86`); and emitted `app.gs.ts` (12,181 bytes, SHA-256 `0e40bb7496a649e6679e352bb54ba3065f35924b9e7e57c8542506649e957c8b`). These are pinned by the E-BUILD descriptor and loader before helper import.

| Backend | Parent module ABI SHA-256 | Child module ABI SHA-256 | Keyed helper SHA-256 |
|---|---|---|---|
| DOM | `afcc8a633dd042f197eae1fc980c51d36c6c606bddcda336e649871183932146` | `ffbba9b1c36182a7623f9b24468814bfab6210d725d5f3e549fd41542337166d` | `5937778c4b147344247b7886508605d0d2f0581b2f68fac3c4b799e533c29b37` |
| React | `3e34e9d8b09e7d9e726ec30c2325340e8ae4be1542d4d3c0ded0243b0009bea3` | `ed5fad22b7b94b4d7ffeb52e1ac880cafc582057673c656c875e369b7bd1ac69` | `7a9e993e97c4aaa47903a6e71449a318c0eb21071f2ed61cd0ac5b1ea5eb9545` |

The runtime test also ran six helper-admission negative controls: changed bytes, backend, package path, component ID, module ABI, and AppIR pin. Each was rejected before renderer factory invocation, parent `Init`, or container mutation.

The separate actual-artifact smoke exercised the DOM pair through 11 runtime events. It ended with `b` generation 1 at count 0 and remounted `a` generation 2 at count 1; stale callback/publication probes left Go call counts unchanged. After unmount, the trace had no mounted children. The smoke is a host capture-renderer run; it is not evidence of real browser click delivery.

Commands and raw output are preserved under `../keyed-module-coordination/rawlogs/E-HOST/`. The runtime test command was:

```sh
GOBI_KEYED_BUILD_INDEX=/workspace/scratch/39a56936f173/gondola/compiled-keyed-modules/build/output/E-BUILD-final/build-index.json \
  /tmp/gondola-node22/node_modules/node/bin/node --test compiled-keyed-modules/runtime/runtime.test.mjs
```

Result: Node `v22.23.4`, 2 tests passed, 0 failed, 0 skipped. Both `node --check` commands also exited 0. The environment emitted Node's experimental `EnvHttpProxyAgent` warning; no test failed.

## Scope and limits

The lifecycle tests use actual compiled GoScript modules and host ABI bridges with capture renderers and a lightweight fake DOM. Physical browser clicks, real browser DOM identity, direct/native/browser parity, and the seeded full scenario remain pending the N4 browser/conformance run (`E-RUN`). E-HOST does not claim those checks passed.

The unchanged shared module ABI analyzer reaches `Children` through AppIR. `ReceiveKeyed` and `IsCurrent` are supplemental, source/artifact-pinned GoScript helpers in the bounded keyed helper descriptor; they are not AppIR-reachability-admitted as general ABI roles. The loader validates the descriptor and source pins before importing the helper. E-HOST's six negative controls cover the host's supplied helper byte and identity pins.

## Source and review

Base source commit: `4395d41ade7e4196878b6885d4c46dd4d8ec85f1`. The shared workspace was dirty while the milestone lanes were building their assigned paths. E-HOST changed only `compiled-keyed-modules/runtime/runtime.mjs` and `compiled-keyed-modules/runtime/runtime.test.mjs`; their SHA-256 hashes are recorded in `receipts/E-HOST.json`. This receipt does not claim a clean-source build or independent review acceptance. Independent review remains pending.
