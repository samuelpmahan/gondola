# R-OBSERVATION

**Outcome: mixed change.** Added synchronous-result checks to the two renderer observation methods and active runtime unmount. The Node `v22.23.4` runtime suite passes 27/27 after the repair.

## Repaired paths

`viewSnapshot()` now checks the value returned by `renderer.viewRecord()` with the existing `noThenable` guard before validating its record shape. `domSnapshot()` does the same for `renderer.domSnapshot()`. A regular synchronous method returning a rejected native Promise is therefore observed by the runtime's rejection sink, then rejected as an asynchronous renderer result. In renderer replacement these observations occur after old-renderer teardown/new-renderer commit, so the runtime keeps its existing fail-closed behavior: `RuntimeFailure(stage="renderer-replacement")`, halted runtime, unavailable snapshot, no rollback claim, and no Go update or application trace tick.

`performUnmount()` now checks the returned value from the active renderer's `unmount()` call before returning success. A rejected native Promise is observed and reported through the existing `unmount` failure path; `runtime.unmount()` returns `false`, the runtime remains disposed/halted, and the runtime does not claim successful physical teardown. This preserves honest failure semantics when the asynchronous renderer method has not synchronously emptied its view.

## Regression coverage and verification

Two tests were added. The observation test covers rejected Promise returns from both `viewRecord()` and `domSnapshot()`, confirms old-renderer teardown and `renderer-replacement` failure, checks that Go `Update` and the application trace remain unchanged, and listens through the next event-loop turn for unhandled rejections. The unmount test checks a rejected Promise return, `false` from `runtime.unmount()`, `unmount` failure stage, unchanged trace/update count, retained renderer view (no false teardown success), and no unhandled rejection.

The preserved XR-R-CONTRACT reproducer independently recorded the original `viewRecord()` and `domSnapshot()` leaks at runtime hash `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105`; its script and result remain unchanged at hashes `cc6d2fa59a2dfef2dd25e3f6bab561bd20764bd4989d5e131e21d5a98d04ccf9` and `a1aa98f2b808887d695b2cca107a2f4887dc44baaced37b957e8d80c9aa48555`.

Commands run against the frozen source:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/runtime/runtime.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/frontend/runtime/runtime.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/frontend/runtime/runtime.test.mjs
```

The full suite passed **27/27**, with zero failures; both syntax checks exited 0. Node emitted the existing experimental `UNDICI-EHPA` warning. Raw logs are in [`runtime-node22.log`](../../evidence/repairs/observation/runtime-node22.log), [`runtime-syntax.log`](../../evidence/repairs/observation/runtime-syntax.log), and [`test-syntax.log`](../../evidence/repairs/observation/test-syntax.log). The toolchain version is recorded in [`node-version.txt`](../../evidence/repairs/observation/node-version.txt).

## Scope and limits

The source changes are limited to renderer return-value observation. This is not a JavaScript sandbox or a claim to defend against arbitrary Proxy/getter behavior. Renderer methods declared `async` remain rejectable during replacement preflight; a regular function that returns a Promise is only detectable after invocation. For replacement snapshot calls that is after teardown, so failure remains fail-closed without rollback. This runtime lane did not run the composed Go build or React↔DOM browser matrix; those remain with the integration lane.

## Source hashes

Previous frozen R-RUNTIME source: runtime `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105`; tests `3ddaaded2db26d7b2acf9bcbd8e85584f1f4b57e1e89b325a602aff5dab39fcc`.

Final R-OBSERVATION source: runtime `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4`; tests `39790809f3392bb47b3f48d17bfdc40b6fe8628961513f0b1ddf3e69a014e907`.
