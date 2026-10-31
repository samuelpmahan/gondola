# XR-FIX-WASM-OBSERVABILITY (N4): independent review

**Decision: `accepted`.** N2's guard repair addresses XR-DELIVERY's fail-open finding. A present hook that cannot be replaced is recorded as failed and makes `assertClear()` throw; a missing coverage ledger also fails. A fresh Node 22 run passed all seven guard tests, including the two live Chromium cases and five VM-backed descriptor/coverage cases. The four amended source files retained their receipt hashes through the run.

## Coverage and evidence binding

The helper installs the request blocker and instruments the listed public WebAssembly entry points: `compile`, `compileStreaming`, `instantiate`, `instantiateStreaming`, and `validate`; plus the `Module`, `Instance`, `Memory`, `Table`, and `Global` constructors. It records an entry for each hook as installed, absent, or failed. A global-absent environment is accepted only with an explicit absent-global entry. Installation failure, an unobservable ledger, an invalid status, or unobservable attempt counts cause `assertClear()` to reject. The VM cases prove the read-only non-configurable hook fails closed, a missing ledger fails closed, and a non-configurable writable hook can be wrapped without changing its descriptor.

The successful Chromium control and N2's pinned HTTP smoke show all ten listed hooks installed. The HTTP smoke stores `wasmGuardCoverage` alongside its legacy `webAssemblyRequests` and `webAssemblyApiCalls` counters. Its coverage check requires a recognized status, at least one entry, and no failures; the shared helper also requires an observable ledger and attempt-count array and rejects failures or nonzero request/API attempts. The compiled browser adapter binds one `noWasm` record to the top-level capture and all three profiles, retaining `apiAttempts` and `wasmRequests`. The children checker requires `browser.noWasm` and every profile record, compares them exactly, and checks the ten installed entries; its captured-data mutation removes an entry and is rejected. Thus missing coverage cannot produce a passing smoke or matched browser capture.

The claim is intentionally finite: it covers these listed APIs and browser requests matching the `.wasm` URL route pattern. It does not claim observation of every engine path by which WebAssembly might execute.

## Fresh verification

Using Node `v22.23.4` and Chromium `153.0.8010.0`, the following focused command passed **7/7** tests:

```sh
CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/conformance/no-wasm.test.mjs
```

The two real Chromium tests still exercise a blocked `WebAssembly.compile` call and a blocked `.wasm` asset request. Five VM cases cover all ten exact hook entries, absent global reporting, read-only non-configurable failure, missing-coverage failure, and non-configurable writable support. Node emitted the environment's `[UNDICI-EHPA]` experimental warning; the process exited 0. Test stdout/stderr, exit code, tool versions, and before/after source hashes are pinned under [`XR-FIX-WASM-OBSERVABILITY-20261031-01`](../rawlogs/XR-FIX-WASM-OBSERVABILITY-20261031-01/).

The pinned N2 author smoke artifact also passed 32/32 checks in Chromium 153.0.8010.0. I independently verified its receipt-pinned JSON, screenshot/build record, and bundle. The smoke records all ten entries as installed, an empty failure list, and zero values for the legacy WebAssembly request/API counters. This is targeted author-smoke evidence, not a fresh full delivery run.

## Original-source custody

At base commit `60b5aeff3172837ad7831c2b78b210454a3d81a2`, the shared helper `compiled-frontend/conformance/no-wasm.mjs` was 2,772 bytes with SHA-256 `512d3debbcb8c8bb1f9edd01cb6b930a6364bcd680d7a6580c2096c5dc37ed29`; it matches both the E-FIX preservation manifest and preserved original copy. The base-tracked `no-wasm.test.mjs` had two Chromium tests (1,775 bytes; SHA-256 `4092cbd692428e647d8c2deb361beb5032d3a39f4599aa4d55a0a207c4700775`). The amended test retains their compile-attempt and `.wasm` request checks and adds five VM tests.

The base commit did not contain `compiled-children/demo/smoke.mjs` or `compiled-children/conformance/browser.mjs`. Their E-FIX pre-repair copies match the preservation manifest at 16,837 bytes / `607aac6378610c425de5aeeb0925deb10d8643306a5b6e017a86f3edc4c5bab1` and 8,362 bytes / `d36b6bae1dd606e4b5e4bf069d7ec7a9d8303833b8451c953d9eb6edd0d4693d`, respectively. The audit script and exact results are in [`evidence-audit.log`](../rawlogs/XR-FIX-WASM-OBSERVABILITY-20261031-01/evidence-audit.log).

## Boundary

The four E-FIX sources still match the frozen hashes in N2's receipt. This review did not edit them. It ran the targeted seven-test guard file and audited N2's pinned 32-check smoke; it did not run the full inherited delivery pipeline, CI, or a new demo smoke. No Git or native coordination state was changed.
