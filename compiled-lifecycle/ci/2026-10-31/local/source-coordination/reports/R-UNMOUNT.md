# R-UNMOUNT

**Outcome: mixed change.** Fixed the lifecycle adapter's reentrant unmount race without changing the shared compiled runtime. The wrapper now invokes core `unmount()` first. It retires and releases effect callbacks immediately only when core reports disposal; when core returns `false`, it schedules a coalesced microtask and retires only if the core host became unmounted after the current synchronous admission unwound.

## Finding and repair

The preserved XR-RUNTIME reproduction showed the wrapper calling `effects.retireAll()` before core unmount admission. During completion validation, a Proxy `ownKeys` trap reentered wrapper unmount. Core correctly rejected that call with `false`, but the wrapper had already canceled the outstanding request and closed its effect driver. The host remained mounted, and a subsequent Go request failed with `lifecycle effect driver is closed`.

The wrapper now defers retirement until core has admitted disposal. A `true` return retires immediately. A `false` return is ambiguous: core may have refused unmount during completion admission, or may have deferred it while the host was busy. The adapter therefore coalesces a microtask check of `mounted.isUnmounted()`. The refusal case leaves the driver and callbacks unchanged; the deferred case retires outstanding callbacks after core processes its queued unmount. No core runtime source was changed.

## Regression coverage

- The actual compiled lifecycle module is mounted with a pending parent request. An invalid completion Proxy reenters `runtime.unmount()` from `ownKeys`. The test confirms unmount is refused, Go state and trace stay unchanged, the pending request remains unchanged across the microtask check, and no cancellation or retirement record is emitted. It then requests a child and successfully delivers both original and new replies before performing a normal unmount.
- A renderer update reenters wrapper unmount while core is busy but not validating a completion. Core returns `false` and queues unmount. The test confirms that the current dispatch commits, then the queued unmount disposes core and the wrapper releases the emitted request callback on the scheduled microtask.
- Existing actual compiled-fixture unmount coverage continues to confirm a direct accepted unmount retires pending requests and releases callbacks.

The first run of the new completion-Proxy regression failed against the old wrapper because `effects.pending()` was empty instead of retaining `parent:g1:r1`. The preserved XR reproduction's recorded result also documents that subsequent request failure. The exact fixture evidence is `compiled-lifecycle/coordination/reviews/xr-runtime/unmount-reentry-repro.json`.

## Verification

Toolchain: Node `v22.23.4`. Commands ran from `/workspace/scratch/39a56936f173/gondola`; Node printed its existing experimental `EnvHttpProxyAgent` warning.

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-lifecycle/runtime/runtime.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/runtime/runtime.test.mjs
```

Results: lifecycle runtime **9 passed, 0 failed**; shared compiled runtime **29 passed, 0 failed**. Full TAP output is stored in the two R-UNMOUNT log files listed below. The core runtime hash matches the accepted R-EFFECT-SLICE source hash; the cross-profile browser matrix has not yet been rerun against this frozen wrapper.

## SHA-256

- `compiled-lifecycle/runtime/runtime.mjs`: `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed`
- `compiled-lifecycle/runtime/runtime.test.mjs`: `71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29`
- `compiled-frontend/frontend/runtime/runtime.mjs` (unchanged): `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0`
- `compiled-lifecycle/coordination/reviews/xr-runtime/unmount-reentry-repro.json` (preserved): `7a13946b98a78ef9ec34102fa8141e279f9c541d31c5fa84f2cf8865409301d6`
- `R-UNMOUNT.lifecycle-9.log`: `0f42685dbf5200db376b3bde6b3f51b827840fabd41f9efc36d9f11cb3742777`
- `R-UNMOUNT.shared-runtime-29.log`: `fd1793f023c23f71d82ef3b6ed7c6c38af91b0effbcb1affa9d1255d90869798`
