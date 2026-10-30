# R2-RUNTIME

**Outcome: mixed change.** Completion admission now reserves the runtime before any completion object can trigger Proxy or descriptor behavior. Invalid completion inputs cannot reenter completion, dispatch, stale-action, or unmount paths and mutate state or trace. Valid synchronous effect-host replies remain queued until the requesting dispatch has committed its view and tick.

## Repair

- `complete()` reserves `busy` and an `admittingCompletion` fence before closed-record validation. Completion and nested message values are copied only from own data descriptors; accessors and unknown keys remain rejected.
- While a completion is being inspected, nested completion, dispatch, stale-action, and unmount calls return without entering deferred work. This also covers reentry from `ownKeys`, `getPrototypeOf`, property-descriptor traps, and a Proxy thrown by a validation trap.
- The admission fence is released after validation. A valid reply delivered synchronously by `effectHost.request()` is checked against its pending correlation and queued once; the runtime drains it after the outer dispatch commit. Duplicate, unknown, mismatched, disposed, and halted replies remain rejected.
- The original N5 probe and raw JSON remain unchanged. A runtime-owned copy with repaired expectations records the same invalid-outer completion case after this change.

## Verification

The pre-repair Node 22 run against runtime SHA `18a9565d…912b1908` was intentionally red: **13 passed and 2 failed**. The failures showed a nested valid completion mutating state during an invalid outer `ownKeys` trap, and a prototype trap unmounting the runtime before a valid outer reply could commit. A targeted red test also caught reentry while reading a hostile thrown error's `message`.

Focused green run under Node `v22.23.4`:

```text
/tmp/gondola-node22/node_modules/node/bin/node --test frontend/runtime/runtime.test.mjs
```

Result: **16 passed, 0 failed**. Coverage includes completion own-key, prototype, property-descriptor and accessor behavior; cross-entrypoint reentry; hostile thrown-error handling; invalid-outer invariance; synchronous host delivery after commit; duplicate replies; stale callbacks; and post-unmount empty-DOM snapshots. Node emitted its existing experimental `EnvHttpProxyAgent` warning.

The adjusted independent N5 probe also passed:

```text
/tmp/gondola-node22/node_modules/node/bin/node frontend/runtime/r2_completion_probe.mjs
```

It observed one `ownKeys` trap, rejected the nested valid reply and invalid outer reply, left Count at `0` and Reply empty, and kept Update at the one call needed to create the pending request. The stale-action and post-unmount lifecycle checks remained green. Its output is retained in `frontend/runtime/r2_completion_probe.json`; the preserved original N5 source and raw result are `coordination/reviews/xr_r_runtime/probe.mjs` and `.json`.

## Limits

These checks exercise the runtime module with stub symbols, a renderer, and an effect host. N6 owns generated-app and mounted-browser conformance; this report does not claim that integration passed. N6 was notified to run against the frozen runtime source.

## SHA-256

| File | SHA-256 |
|---|---|
| `frontend/runtime/runtime.mjs` | `ab0a2fe8c97293a8e45a035b92e46a80ae53b702103de47ca337f0a830b26704` |
| `frontend/runtime/runtime.test.mjs` | `efda3ddcf83cc0cde9ec2fb9b37a69abee313cced1bcf067ded5645a1d0ae296` |
| `frontend/runtime/r2_completion_probe.mjs` | `e824a273767a7e73d57fab0c57ae84559b1850ca1ece181b57adc6251315c695` |
| `frontend/runtime/r2_completion_probe.json` | `e1a1e3e9ff64f02221b4d476f467560c8d0f3d7727b1f2f8d107c6a4599bf92f` |
| `frontend/runtime/r2-node-tests.log` | `21b739a9a6ec15e6ff237328e04bd54f5f211fae799bc940bd0983f24ddff9a4` |
| Preserved N5 probe `coordination/reviews/xr_r_runtime/probe.mjs` | `fadc6eac0466695bc4febb2c3fe4765b65f34e0ddc9a3807174d1958cde6d311` |
| Preserved N5 raw JSON `coordination/reviews/xr_r_runtime/probe.json` | `6cfb77a93f37c7dfa25c45fe58b34c913efdcf85fd945b846c4b61c268d1fe6f` |
