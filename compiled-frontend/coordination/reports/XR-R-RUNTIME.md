# XR-R-RUNTIME

**Decision: amend.** The frozen N4 runtime at `frontend/runtime/runtime.mjs` accepts the renderer’s lowerCamel `{path,event,value}` action, admits the exact marked GoScript Effect shape, and limits effects to `fixture.request` / `lookup` / `complete`. Dispatch and stale-action entry both reserve `busy` before inspecting caller-owned input; the current focused Node suite passes 11/11. Post-unmount stale ticks preserve the last logical view and record the renderer’s empty physical DOM in the stubbed lifecycle test.

## Finding: completion validation can reenter before admission

**Medium — an invalid outer completion can trigger a valid nested reply and mutate application state.** `runtime.complete()` calls `validateCompletion(completion)` before checking `busy` or taking any completion-admission lock. `validateCompletion()` reaches `Reflect.ownKeys()` through `ownDataRecord()`, which invokes a Proxy `ownKeys` trap. With one real pending `fixture.request` effect, the independent probe passes an invalid outer Proxy whose `ownKeys` trap calls `runtime.complete(validReply)`. The nested reply is accepted and runs Update; then the outer completion rejects because its keys are incomplete. The final state has Count `1` and Reply `reply-from-reentrant-trap` even though the supplied outer completion returned `accepted: false`.

This is a concrete invalid-input invariance failure on the public completion API. In the frozen source, `runtime.complete()` validates at lines 817–820 and checks `busy` only afterward. Reserve completion admission before inspecting caller-controlled input, and prevent nested completion admission while that validation is in progress. Preserve the current valid synchronous-delivery behavior when `complete()` is called from the effect host during an active dispatch. No runtime source edits were made in this review.

The reproduction is `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r_runtime/probe.mjs`; its exact raw JSON is `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r_runtime/probe.json`. It used the actual frozen runtime with a marked GoEffect-shaped object and a pending reply, not an instrumented runtime copy.

## Confirmed bounded behavior

- The N4 suite passed **11/11** under Node `v22.23.4`, including lowerCamel action acceptance, PascalCase rejection, marked effect and invalid-marker/descriptor rejection, `lookup`/`complete` restriction, dispatch reentry rejection, and stale post-unmount behavior.
- The independent probe confirmed a lowerCamel action is accepted and a marked effect produces the exact `{kind:"fixture.request", name:"lookup", reply:"complete"}` request. The frozen Go validator also requires those exact Kind/Name/Reply values.
- An `ownKeys` trap entered by `recordStaleAction()` cannot reenter a nested dispatch: the nested dispatch is rejected, Update remains uncalled, and no runtime failure is recorded. A post-unmount stale callback preserves the last logical view, reports empty DOM, and does not call Update.
- Existing `dispatch()` and `recordStaleAction()` set `busy` before validation; this review found the remaining admission gap specifically in `complete()`.

## Limits

The suite and independent harness use compiled-symbol and renderer stubs; they exercise the actual runtime module but do not establish generated-app or mounted-browser conformance. The deterministic HostScript fixture is a trusted plain JSON fixture in the tested path. Its positive result does not establish safe admission for arbitrary hostile HostScript objects with getters or Proxies. This review covers the frozen runtime ABI and the concrete completion-admission case, not a general Go or JavaScript security audit.

## Verification and hashes

Commands run from `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/`:

```text
/tmp/gondola-node22/node_modules/node/bin/node --test frontend/runtime/runtime.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node coordination/reviews/xr_r_runtime/probe.mjs
```

Both exited 0. The focused suite output is retained at `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r_runtime/node-tests.log`.

| File | SHA-256 |
|---|---|
| `frontend/runtime/runtime.mjs` | `18a9565d8e80179a22240f1fbe109b3d7297cee1551aaa43ccc09b0f912b1908` |
| `frontend/runtime/runtime.test.mjs` | `05c1b193038df485b260e98c5e6705d036a1eba2b27f79f884b0598811833af8` |
| `/workspace/scratch/39a56936f173/gondola-compiled/compilercontract/validation.go` | `ccb28713bfa7dd0fd5b22fb5dd377945006d9f0517357c62f230666b91ec2e76` |
| `coordination/reviews/xr_r_runtime/probe.mjs` | `fadc6eac0466695bc4febb2c3fe4765b65f34e0ddc9a3807174d1958cde6d311` |
| `coordination/reviews/xr_r_runtime/probe.json` | `6cfb77a93f37c7dfa25c45fe58b34c913efdcf85fd945b846c4b61c268d1fe6f` |
| `coordination/reviews/xr_r_runtime/node-tests.log` | `fbd81fb807be11e9bc9e91b97ab8ff1862f1bfdaf18cd5fa7bdd4755117f2b42` |
