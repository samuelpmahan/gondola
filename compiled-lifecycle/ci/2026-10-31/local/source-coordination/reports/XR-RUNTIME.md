# XR-RUNTIME independent review

**Decision: amend.** The E-RUNTIME cancellation and effect-policy implementation is supported by focused tests, but the lifecycle wrapper has a concrete unmount reentrancy failure described below. This review covers the original E-RUNTIME scope only. The separate R-EFFECT-SLICE bridge and its acceptance remain out of scope.

## Reviewed behavior

- With no `effectPolicy`, the shared host still applies its closed `fixture.request` validator and the `effect.request-reply` capability gate. The custom policy receives a frozen copy, must be synchronous, and must return `undefined`; the lifecycle policy closes over only `fixture.request/lookup/complete` and `lifecycle.cancel/cancel/""`.
- `cancelEffect` validates the exact correlation shape, deletes that pending correlation, removes its queued completion, recomputes the held-replacement flag, and records the cancellation. It does not run Go `Update` or append a trace tick. The suite covers both an ordinary pending callback and cancellation of a completion held during renderer replacement.
- The lifecycle driver associates each Go request token with its original `dispatchId/effectIndex`. It forwards Go cancellation intents to `cancelEffect`, preserves Go effect order, keeps an unrelated sibling request pending, and rejects a force-delivered retired callback at the core correlation fence.
- `retireAll` cancels all pending correlations and clears the driver callback references. The actual compiled-fixture test also confirms a normal wrapper unmount retires an outstanding request and releases its callback.

## Finding requiring amendment

`mountLifecycleApp().runtime.unmount()` calls `effects.retireAll()` before calling the mounted host's `unmount()`. The host intentionally returns `false` without queuing unmount when called during completion admission (the core suite tests this reentrancy rule). In that case the wrapper has already closed the driver and canceled requests, although the host remains mounted.

I reproduced this through the actual compiled lifecycle fixture: dispatch `requestParent`, then pass a completion `Proxy` whose `ownKeys` trap calls `runtime.unmount()`. The result was `nestedUnmountResult: false`, `runtimeStillMounted: true`, and no pending effect. A later `requestChild` committed Go state but failed with `lifecycle effect driver is closed`. The concise output is in `coordination/reviews/xr-runtime/unmount-reentry-repro.json`.

The wrapper needs to coordinate retirement with an unmount that the host accepted or deferred, so a rejected reentrant unmount cannot leave a live host with a permanently closed effect driver. This is a behavior issue, not a documentation-only concern.

## Verification

Toolchain: Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`.

- Shared-host suite: **29 passed, 0 failed** against runtime hash `b9bad9…`. Command: `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/runtime/runtime.test.mjs`. Output: `coordination/reviews/xr-runtime/current-core-29-latest.log`.
- E-RUNTIME original-scope lifecycle tests selected by name: **3 passed, 0 failed** (four newer bridge tests skipped), against the earlier shared-host hash `56aac3…` and unchanged lifecycle-wrapper hash `c6fad5…`. Command: `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test --test-name-pattern='closed lifecycle policy|manual effect driver|host unmount retires' compiled-lifecycle/runtime/runtime.test.mjs`. Output: `coordination/reviews/xr-runtime/current-lifecycle-original-scope-3.log`.
- An interim whole-lifecycle run recorded **3 passed, 4 failed** at an earlier bridge revision; those four tests were the new GoSlice bridge tests. The runtime author subsequently reported that the separate R-EFFECT-SLICE revision below passes 7/7 lifecycle and 29/29 shared-host tests. That separate gate is not accepted by this review, and its author is recording its own report/receipt.
- The E-RUNTIME receipt reports 29+3 passing tests and its report hash matches `E-RUNTIME.md`. Its historical shared-host runtime hash (`4856f0…`) and lifecycle test hash (`91766c…`) are not the current files; no archived copies of those exact source bytes were found. The current lifecycle wrapper hash remains identical to E-RUNTIME's recorded hash. The core runtime changed while the bridge was being edited, so the 29/29 log above is not represented as a run against the final bridge source. The current core runtime includes the separate effect-slice bridge, so it must not be represented as the original E-RUNTIME-only source.

## Source hashes

Recorded by the E-RUNTIME author packet:

- `compiled-frontend/frontend/runtime/runtime.mjs`: `4856f0a425c5893928c7708c21c39143e8a86afac115c6a979d1ab068f55a995`
- `compiled-frontend/frontend/runtime/runtime.test.mjs`: `6ea9236b08d1bf624bc9f8a84d2bebd6cacfbc12c91749cabf97b8fc6a7bf7b1`
- `compiled-lifecycle/runtime/runtime.mjs`: `c6fad592554dda059c45ecdb1db55ab62283783de1b1d76c0f320f44fbdf7166`
- `compiled-lifecycle/runtime/runtime.test.mjs`: `91766c382f4147150804781c3ce9dd554eb2ae0d1c38ac67e5e62773ef47781e`

Current files reviewed:

- `compiled-frontend/frontend/runtime/runtime.mjs`: `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0`
- `compiled-frontend/frontend/runtime/runtime.test.mjs`: `6ea9236b08d1bf624bc9f8a84d2bebd6cacfbc12c91749cabf97b8fc6a7bf7b1`
- `compiled-lifecycle/runtime/runtime.mjs`: `c6fad592554dda059c45ecdb1db55ab62283783de1b1d76c0f320f44fbdf7166`
- `compiled-lifecycle/runtime/runtime.test.mjs`: `3c6f5c9d8631a9e1e557ffe93465e0b93d66a085a5b22a33f2f4e6fbb1d0c273`

