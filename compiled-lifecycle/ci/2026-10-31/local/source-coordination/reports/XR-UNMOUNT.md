# XR-UNMOUNT independent review

**Decision: accepted.** The wrapper now asks the core runtime to unmount before retiring lifecycle effects. It retires immediately when core confirms disposal and schedules a coalesced microtask check when core returns `false`; a refused reentrant unmount therefore leaves callbacks live, while a deferred unmount retires only after the host is actually disposed.

## Review evidence

- The prior XR-RUNTIME evidence captured the failure: a completion validation `ownKeys` trap called wrapper unmount, got `false`, but the old wrapper had already closed its driver and canceled the pending request. That preserved before-state is `coordination/reviews/xr-runtime/unmount-reentry-repro.json`.
- The new wrapper calls `mounted.unmount()` first. It calls `effects.retireAll()` immediately only for an accepted unmount or when `mounted.isUnmounted()` is already true. A `false` result schedules one coalesced microtask; the callback retires only if the core is then disposed.
- I replayed the earlier valid completion Proxy shape against the actual compiled fixture. During the `ownKeys` trap, nested unmount returned `false`; the valid completion was accepted; after the microtask the runtime remained mounted and the driver remained open. A later child request and delivery both succeeded. The probe then made a sibling request, directly unmounted, and confirmed zero pending requests plus a released callback. Output: `coordination/reviews/xr-unmount/reentrant-unmount-probe.json`.
- The new actual-fixture rejected-unmount regression confirms a malformed completion Proxy cannot change state or trace, retire/cancel the pending request, or prevent a later child request and successful delivery of both replies.
- The deferred-unmount regression calls wrapper unmount during renderer update. Core returns `false` and queues disposal; the current dispatch commits; the lifecycle request remains pending until the retirement microtask observes `isUnmounted()`. It is then removed from pending and its callback cannot be force-delivered.
- Existing direct-unmount coverage still retires pending requests and clears callbacks. The 9-test lifecycle suite passes with both new regressions; the shared compiled runtime remains byte-for-byte at its reviewed hash.

## Verification

Toolchain: Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`.

- `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-lifecycle/runtime/runtime.test.mjs`: **9 passed, 0 failed**. Independent log: `coordination/reviews/xr-unmount/review-lifecycle-9.log`.
- `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/runtime/runtime.test.mjs`: **29 passed, 0 failed**. Independent log: `coordination/reviews/xr-unmount/review-shared-runtime-29.log`.
- `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node compiled-lifecycle/coordination/reviews/xr-unmount/reentrant-unmount-probe.mjs`: **exit 0**. It exercises the valid-completion reentrant case against the compiled fixture and verifies follow-on delivery and cleanup.

The cross-profile React/DOM/browser matrix remains a separate harness gate; this review only accepts the lifecycle wrapper's unmount sequencing and cleanup behavior.

## Source hashes

- `compiled-lifecycle/runtime/runtime.mjs`: `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed`
- `compiled-lifecycle/runtime/runtime.test.mjs`: `71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29`
- `compiled-frontend/frontend/runtime/runtime.mjs` (unchanged): `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0`
- `compiled-frontend/frontend/runtime/runtime.test.mjs` (unchanged): `6ea9236b08d1bf624bc9f8a84d2bebd6cacfbc12c91749cabf97b8fc6a7bf7b1`
- Previous XR-RUNTIME reproduction: `7a13946b98a78ef9e1e557ffe93465e0b93d66a085a5b22a33f2f4e6fbb1d0c273`
- Independent lifecycle log: `843a157f1596a7734f9b7e9c13753b14cb9aeebaaf21ebb4ca79b53b0cb7adb2`
- Independent shared-runtime log: `c8b30d73879c7536c5b975e149ffad84a2415eec0cc3be13533fca8f429fe230`
- Reentrant probe source: `9c256dd187c01fe9413f996314f8c64c79671ca0d595eb3e93de2f5ba8327b5e`
- Reentrant probe result: `216369990e704affd0f5745becb7633a1186f8c1caf3d1ac121089bb7911001e`

