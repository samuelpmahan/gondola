# R-RUNTIME

**Outcome: mixed change.** Fixed the two protocol defects found in the independent `XR--RUNTIME` review and added runtime regressions. The final scoped runtime suite passes 25/25 under Node `v22.23.4`.

## Behavior repaired

`replaceRenderer(nextRenderer)` still uses the cached Go-produced view and does not run an application update as part of the swap. When both renderers provide the optional focus pair, the runtime now accepts `focusState()` returning `null` or an exact record with `identity`, nonnegative safe-integer `selectionStart`/`selectionEnd`, and string `selectionDirection`. `undefined` and malformed records are rejected before teardown; the old renderer stays active and the application trace remains unchanged.

After old-renderer teardown and the new renderer commit, `restoreFocus(state)` must return a boolean. `true` is the only result recorded as `focusRestored`. `false` or a non-boolean result fails at phase `focus-restore`, throws `RuntimeFailure` with stage `renderer-replacement`, halts the runtime, and makes snapshots unavailable. No rollback or old-view restoration is claimed after teardown.

The synchronous return guard now uses captured `Promise.prototype.then` as a native Promise brand check and attaches a rejection handler to a returned Promise before reporting the synchronous-protocol error. This handles a rejected Promise without leaving its rejection unobserved, while avoiding an own `then` accessor. Non-Promise thenables are rejected without calling their `then` method; the runtime does not claim a security boundary against arbitrary Proxy/getter behavior. The replacement busy/reentrant guards remain active while the renderer operation and any Promise species machinery execute.

## Reproduction and verification

The pre-fix independent reproduction is preserved in [the XR review probe](../evidence/reviews/xr-runtime/replacement-failure-probe.mjs) and [its result](../evidence/reviews/xr-runtime/replacement-failure-probe.json). The recorded baseline showed `restoreFocus(undefined)` committing with `focusRestored:true`; `update()` returning a rejected Promise correctly failed closed but also emitted `unhandledRejection: "late renderer rejection"`. Original source hashes are retained from the review receipt: runtime `a35338302fc391499575fe7d3c7c59c41a3eeaddce23a3039f0a13d84ac94ae2`, tests `f2fb585601675f60a2994b91b4c8feb4dd77507668bef27ff6e37200ad4c381d`.

The new tests cover malformed/undefined focus capture before teardown; `restoreFocus` returning `undefined`, a non-boolean truthy value, or `false` after teardown; and a rejected Promise from `update()`. The Promise test installs an own `then` getter that would reenter dispatch and replacement, then verifies that the intrinsic rejection sink does not read it, no Go Update or trace tick occurs, and no `unhandledRejection` arrives on the next turn.

Final verification was run against the frozen production source:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/runtime/runtime.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check compiled-frontend/frontend/runtime/runtime.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check compiled-frontend/frontend/runtime/runtime.test.mjs
```

The full suite result is **25 passed, 0 failed**. Node emitted the existing experimental `EnvHttpProxyAgent` warning. Both syntax checks exited 0. Raw output is in [`runtime-node22.log`](../evidence/repairs/runtime/runtime-node22.log), [`runtime-syntax.log`](../evidence/repairs/runtime/runtime-syntax.log), and [`test-syntax.log`](../evidence/repairs/runtime/test-syntax.log). The fixture-level React↔DOM conformance matrix was not rerun by this runtime repair lane; N3 owns that composed gate after source freeze.

## Final source hashes

- `compiled-frontend/frontend/runtime/runtime.mjs`: `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105`
- `compiled-frontend/frontend/runtime/runtime.test.mjs`: `3ddaaded2db26d7b2acf9bcbd8e85584f1f4b57e1e89b325a602aff5dab39fcc`
