# E-RUNTIME

**Outcome: mixed change.** Added a lifecycle adapter around the existing compiled `mountCompiledApp` host. The wrapper does not add an application reducer: Go-emitted `fixture.request` lookup effects and explicit `lifecycle.cancel` effects drive a deterministic manual scheduler, while the existing host continues to own state, dispatch, renderer replacement, pending reply correlations, and renderer callback fences.

## Runtime behavior

- `mountLifecycleApp({module, componentId, appId, encoder, renderer, onTick, onFailure})` returns `{runtime, effects}`. `runtime` uses the existing host API; `effects` exposes `pending()`, ordered `records()`, `deliver(token)`, and `forceDeliverRetired(token)`.
- When `componentId` is omitted, the adapter derives the only component ID from the emitted module's AppIR. The lifecycle component ID is `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`; `compiled-lifecycle` is only its display name.
- The lifecycle policy accepts only exact `fixture.request/lookup/<token>/complete` and `lifecycle.cancel/cancel/<token>/""` effects. Tokens must identify one of the four fixture scopes with positive safe-integer generation and request parts. The generic host retains its original strict effect validator by default, including its `effect.request-reply` capability check.
- Request records retain the Go `dispatchId` and `effectIndex`. A Go cancellation resolves its token to the original correlation and calls the host's neutral `runtime.cancelEffect`. That API removes the pending reply correlation and any queued completion for it without changing Go state or trace.
- Forced delivery of a canceled callback exercises the retired host callback and is rejected as an unknown effect correlation. The mounted harness can separately dispatch an old `complete` message to compiled Go `Update` to exercise its token guard.
- Runtime unmount retires outstanding effect correlations and releases callbacks, including requests from unrelated scopes. Post-unmount delivery attempts are recorded and rejected without calling Go.
- Effect validators receive a frozen copy of the structurally checked Go effect. The original effect used for the trace and host request cannot be mutated by policy code.
- The fixture's initial `lifecycle.request` proposal did not cause the compiler to derive `effect.request-reply`. The accepted contract uses existing `fixture.request` for genuine lookup requests and retains explicit `lifecycle.cancel` for cancellation; no analyzer or capability bypass was added.

## Verification

Commands ran from `/workspace/scratch/39a56936f173/gondola/compiled-frontend` and `/workspace/scratch/39a56936f173/gondola/compiled-lifecycle` respectively:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test frontend/runtime/runtime.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test runtime/runtime.test.mjs
```

Toolchain: Node `v22.23.4`. Results: shared compiled host **29 passed, 0 failed**; lifecycle driver **3 passed, 0 failed**. Node printed its existing experimental `EnvHttpProxyAgent` warning.

The focused checks cover default-policy compatibility, immutable policy input, closed lifecycle effect validation, request/cancel ordering, child-first retirement, sibling request survival, normal completion, force-delivery rejection after cancellation, queued completion removal, and callback release at unmount. Go emission and mounted browser integration remain with their respective lanes; no Go compiler was available in this runtime lane.

## SHA-256

- `compiled-frontend/frontend/runtime/runtime.mjs`: `4856f0a425c5893928c7708c21c39143e8a86afac115c6a979d1ab068f55a995`
- `compiled-frontend/frontend/runtime/runtime.test.mjs`: `6ea9236b08d1bf624bc9f8a84d2bebd6cacfbc12c91749cabf97b8fc6a7bf7b1`
- `compiled-lifecycle/runtime/runtime.mjs`: `c6fad592554dda059c45ecdb1db55ab62283783de1b1d76c0f320f44fbdf7166`
- `compiled-lifecycle/runtime/runtime.test.mjs`: `91766c382f4147150804781c3ce9dd554eb2ae0d1c38ac67e5e62773ef47781e`
