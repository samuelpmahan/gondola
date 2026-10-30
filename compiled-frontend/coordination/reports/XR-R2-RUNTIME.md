# XR-R2-RUNTIME

**Decision: accepted.** N4's completion-admission repair closes the reproduced invalid-outer completion reentrancy path. An invalid outer completion cannot mutate state, trace/effect history, or lifecycle through nested `complete`, `dispatch`, stale-action, or `unmount` calls. Valid synchronous host delivery remains queued until the pending view has committed, then completes once.

## Reviewed source and preserved reproduction

Reviewed `frontend/runtime/runtime.mjs` SHA-256 `ab0a2fe8c97293a8e45a035b92e46a80ae53b702103de47ca337f0a830b26704` and `runtime.test.mjs` SHA-256 `efda3ddcf83cc0cde9ec2fb9b37a69abee313cced1bcf067ded5645a1d0ae296`. Read-only snapshots are retained at `coordination/reviews/xr_r2_runtime/runtime.pre-review.mjs` and `runtime.test.pre-review.mjs`.

N5's original bug reproduction and raw result remain unchanged and are copied byte-for-byte into the review directory. The original raw result recorded an invalid outer completion rejected after its `ownKeys` trap had already admitted a nested valid reply: Update ran a second time, Count became 1, and Reply became `reply-from-reentrant-trap`. I did not edit or rely on the original probe's expected-result assertion; the decision is based on the state/trace observations and the independently adapted replay below.

## Admission and completion checks

`runtime.complete()` now checks an existing completion-admission fence, reserves `busy`, and sets `admittingCompletion` before inspecting caller-controlled completion keys, prototypes, or descriptors. During validation, a nested completion is rejected; nested dispatch and stale-action calls are rejected without deferred trace entries; unmount is rejected without scheduling lifecycle work. The fence remains set while formatting an invalid completion's error message. Error text is taken from an own data descriptor, so no ordinary `.message` getter runs; the descriptor lookup itself is also inside the fence and is guarded against Proxy exceptions.

The completion fence is released after validation/error observation. A valid synchronous callback from `effectHost.request()` occurs while the requesting transition is still busy, after the candidate pending view and request tick have been committed. Its completion is correlation-checked and queued once. The outer dispatch then drains it; duplicate completions are rejected after the pending item is queued or completed.

I independently replayed the invalid outer completion through its `ownKeys` trap and also exercised reentry from the error object's `message` descriptor trap. In both cases nested `complete`, `dispatch`, stale-action, and `unmount` attempts were rejected; Update remained at its single call for the initial request; trace and pending host request were unchanged; Count remained 0; Reply remained empty; and runtime lifecycle/failure state did not change. The independently adapted probe also confirmed that synchronous delivery observes pending DOM `<div>count=0;pending=true;reply=</div>` and two trace ticks, returns `queued: true`, drains to one completion tick, and rejects a duplicate without another Update.

## Verification

Commands ran from `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/` with Node `v22.23.4`:

- `/tmp/gondola-node22/node_modules/node/bin/node --test frontend/runtime/runtime.test.mjs` — **16 passed, 0 failed**, exit 0. Log: `coordination/reviews/xr_r2_runtime/node-tests.log`, SHA-256 `a3ae046c3a062709efe6689a4b610e99cdbe02f629102cdf20a029863cf71b1b`.
- `/tmp/gondola-node22/node_modules/node/bin/node frontend/runtime/r2_completion_probe.mjs` — exit 0. The rerun output is `coordination/reviews/xr_r2_runtime/n4-adjusted-probe-rerun.json`, SHA-256 `e1a1e3e9ff64f02221b4d476f467560c8d0f3d7727b1f2f8d107c6a4599bf92f`. Its source SHA-256 is `e824a273767a7e73d57fab0c57ae84559b1850ca1ece181b57adc6251315c695`.
- `/tmp/gondola-node22/node_modules/node/bin/node coordination/reviews/xr_r2_runtime/runtime-admission-probe.mjs` — exit 0. Probe source SHA-256 `46d32da7ca96cef0918d4ba9a328d0c45e2aff81f71b10ebc65b9fd80e6081ab`; raw result SHA-256 `f5788e9f39c836fbe56ba23ba039f2ab7dfec2cbde891604155317b972269249`.

The runtime's existing focused tests cover the original invalid-outer case across all runtime entrypoints, descriptor/prototype traps, accessors, stale/post-unmount callbacks, valid synchronous host delivery, pending-state commit ordering, and duplicate completion rejection. N4's adjusted probe independently shows the fixed state after the original `ownKeys` reproduction. The additional review probe checks error-message descriptor reentry and the pending physical DOM observed by a synchronous host callback.

## Integration boundary

This is a runtime-contract review, not a general Go source audit. The runtime tests and probes use compiled-symbol, renderer, and effect-host stubs. Root/N6's current four-app browser evidence has a passing counter run; the form, list, and effect browser failures are the separately reviewed React `goscript.spareZero` ABI-admission issue. This review makes no new four-app conformance claim and does not attribute that React failure to this runtime repair.
