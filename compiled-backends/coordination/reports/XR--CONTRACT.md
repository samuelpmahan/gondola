# XR--CONTRACT (N4) review

**Decision: amend.** The contract and plan correctly bound the feature to four compiled apps, one runtime per app, the existing Go-produced module, and the five named fixtures. They do not claim browser-engine equivalence or hostile-Proxy security. The bundle audit correctly rejects source-label normalization as proof and keeps raw bundle hashes.

## What the code supports

- `build.ValidateRequest` admits only `react` and `dom`. `produce` compiles and publishes the same AppIR/GoScript/encoder/forwarder pipeline, then selects `emit.NewBackendFor`; the internal per-app manifest records the selected emitter name.
- The React and DOM AppIR emitters share the canonical node map and component role metadata. The build tests and E-BUILD receipt compare AppIR, encoders, forwarder Go, emitted TypeScript, component mapping, and role bindings across the two builds. Raw `gobi-compiled.mjs` hashes differ across temporary roots and remain separately recorded.
- The conformance browser entry statically imports one `gobiCompiled` object. `mountCompiledApp` receives that object, and `swap()` only calls `runtime.replaceRenderer(next)`, so the harness design reuses one module object within a swap run. N3's five-fixture browser run was still pending during this review; this source inspection is not execution evidence for that matrix.
- Runtime replacement uses the cached raw View, does not call Init/Update/View, and records no app tick on success. It checks renderer method shape, the focus-method pair, same-instance replacement, synchronous results, and callback leases. The shipped React and DOM renderers implement the same focus pair and share `identityFor` logic.
- `module-normalization-vectors.json` is a passive fixture set, not an executed comparator. The adjacent audit explicitly rejects the unsafe normalizer. The Go build tests likewise retain raw bundle hashes rather than stripping comments.

## Required contract amendment

`runtime.replaceRenderer` calls the old renderer's `focusState()` before setting `oldUnmountAttempted`. A thrown value or thenable from that call therefore takes the pre-teardown rejection path: the old lease is restored, the old renderer remains mounted, `runtime.failure()` stays null, and snapshots remain available. The current Failure Behavior paragraph groups focus-capture failures with post-teardown fail-closed failures. Split those phases explicitly: focus-capture failure before old unmount rejects safely with the current renderer active; errors after old-unmount is attempted fail closed without rollback.

The focus return contract also needs to be precise. The shipped renderers return booleans, but the current runtime treats only exact `false` from `restoreFocus()` as refusal. A separate Node 22 probe returned `undefined`; the runtime committed and recorded `focusRestored:true`. Require a boolean in the contract and runtime. N1 has this runtime check in progress; the probe records the pre-repair behavior.

## Execution and failure history

I independently ran the semantic audit on Node `v22.23.4`:

```text
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-backends/evidence/semantic/swap-semantics.test.mjs
```

Result: **5 passed, 0 failed**. The captured TAP log is in `evidence/reviews/xr-contract/node22-semantic5.log`. It uses stub Go symbols and mock renderers, so it verifies the runtime swap/queue boundary, not real DOM or four-app browser behavior.

The additional source probe in `evidence/reviews/xr-contract/runtime-limit-probes.mjs` confirms the pre-teardown focus-capture behavior and `restoreFocus()` return handling. It also confirms that directly supplied and bound native async methods are rejected before teardown in Node 22. The JSON output is pinned beside the probe.

Relevant earlier failures are properly scoped in peer receipts: E-RUNTIME records one earlier failing reentrancy probe (22 pass/1 fail), then a corrected 23/0 run; E-DOM records the expected pre-implementation missing-renderer red run; E-BUILD records an overstrict raw-bundle comparison that differed only because temporary source-label roots vary, then removes that comparison. None is a failure of the five current semantic tests. The current semantic file has no recorded failing run; the independent rerun passed.

## Review boundary

No production files were changed. This review covers contract/plan wording, the semantic fixtures, and source capability at the current runtime, DOM, and build APIs. The shared-module browser harness and four-app fixture matrix remain N3 acceptance evidence; do not treat the semantic stub suite as universal renderer or security proof.
