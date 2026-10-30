# XR-RH-RH-E4 — Independent review of the bridge adapter repair

## Decision: accepted

Reviewed `multi-root/runtime.mjs`, `multi-root/host.mjs`, their focused tests, the actual `gobiMultiRoot` WASM API, and the demo's HTTP codec wrapper. I made no implementation or test changes.

## Findings

- **Error-frame detection:** `createMultiRootManagerAdapter()` converts only a non-array object whose enumerable own string keys are exactly `error` and whose value is a string. That matches the bridge's `errorResult()` output (`Object.New()` with one `error` property). Frames become contextual `Error`s containing the method and Go-provided detail. Ordinary values, arrays, null, and objects with additional enumerable keys pass through unchanged. The detection is intentionally based on the JSON bridge shape; a fake that returns exactly `{ error: "..." }` is indistinguishable from a bridge frame by contract.
- **Manager context and idempotence:** adapter calls use `Reflect.apply(call, manager, args)`, retaining the source manager as `this`. The existing context test passes. Wrapping an already-adapted manager returns that same adapter, which prevents the host's outer adaptation and the runtime's inner adaptation from stacking. Re-adapting the same raw manager twice creates two equivalent wrappers; it does not mutate or nest wrappers.
- **Method coverage:** the adapter validates and wraps all eight methods used by the multi-root session manager: `create`, `list`, `snapshot`, `dispatch`, `effects`, `complete`, `audit`, and `dispose`. The raw WASM object exposes two additional HTTP codec methods, `encodeHTTP` and `decodeHTTP`; these are not session-manager methods and are wrapped separately by `demo.mjs`'s `unwrapManager()`. Thus the runtime/host boundary is complete for its contract, while `createMultiRootManagerAdapter()` alone is not a full ten-method bridge facade.
- **Fake compatibility:** fake return objects with extra fields and `this`-dependent methods remain intact. Bridge methods that throw continue to throw naturally. `createSessionRuntime()` clones returned snapshots/effects/audits, so the adapter does not introduce a mutable alias to bridge state.
- **Cause behavior:** the adapter's direct throw has the Go detail in its message and no `.cause` of its own; the bridge supplies a string frame, not an `Error`. In the actual host dispatch path, the keyed host wraps the invalid result and sets the adapter error as `.cause`, so the Go detail remains reachable as `caught.cause.message`. This confirms the end-to-end cause-chain claim, with the distinction that the cause is attached by the keyed-host boundary rather than by the manager adapter.

## Verification

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test multi-root/host.test.mjs multi-root/runtime.test.mjs
```

Passed: 19 tests, 0 failures (Node emitted the environment's experimental `UNDICI-EHPA` warning).

I also initialized the existing raw `multi-root/build/multi-root.wasm` with Node 22 and probed invalid dispatch path `999` through `createMultiRootHost()`. The call threw `keyed host: runtime.dispatch() returned an invalid snapshot`; its `.cause.message` was `multi-root runtime: gobiMultiRoot.dispatch returned error frame: child index 999 out of range in path "999"`. The probe unmounted the session and exited successfully. A direct `createSessionRuntime()` probe returned the same bridge detail in the thrown message and confirmed `.cause` is absent at that boundary. The raw bridge listed ten methods; the session adapter exposed the eight manager methods above and returned itself when adapted again.

## Limits

The codec error-frame path is visibly wrapped in `demo.mjs`, but I did not run a browser demo action that forces `encodeHTTP` or `decodeHTTP` to fail. I used existing WASM build artifacts; I did not rebuild Go/WASM or run the full browser/replay runner.
