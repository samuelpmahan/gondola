# R-RUNTIME

**Path correction.** The first N4 draft was mistakenly written to the independent `XR-G-RUNTIME.md/json` paths. I preserved those mistaken draft bytes under `coordination/reviews/history/N4-miswrite-XR-G-RUNTIME.md/json`, restored the original N3 XR review from the captured initial file contents, and placed the N4 result at these canonical `R-RUNTIME` paths.

**Decision: mixed change.** Runtime now accepts the renderer’s `{Path,Event,Value}` and `{path,event,value}` action shapes, reserves dispatch admission before inspecting caller-owned descriptors, admits only exact marked GoScript `gobi.Effect` values, and validates the frozen `fixture.request` / `lookup` / `complete` effect contract. It retains the last logical view after unmount while reading the physical DOM snapshot from the renderer, which must report the actually empty root.

## Repairs

- Action normalization accepts only the renderer’s closed lowerCamel `{path,event,value}` shape. It uses own enumerable data descriptors, rejects symbols, accessors, non-enumerable/unknown fields and custom prototypes, and copies values without invoking getters. The runtime reserves `busy` before any action or message descriptor/proxy trap. Reentrant callbacks are rejected immediately and safely recorded as suppressed attempts after the active transition.
- Compiled effects require the exact GoScript ABI shape: own enumerable/writable/configurable data fields `Kind`, `Name`, `Arg`, `Reply`; own `__goStructValue: true`; and the observed generated GoScript struct prototype shape. Effects are read from dense own-data arrays. Unknown fields, symbols, accessors, missing markers, invalid prototypes, and non-contract `Name`/`Reply` values fail before host dispatch.
- Host scripts and runtime effect requests enforce `Kind=fixture.request`, `Name=lookup`, and `Reply=complete`, matching the frozen Go validators.
- Stale callbacks after unmount add a tick with the cached logical view and a renderer-provided empty DOM snapshot. They do not call Update or claim the old DOM remains mounted.

## Verification

Command:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/runtime/runtime.test.mjs
```

Result: **11 passed, 0 failed** under Node `v22.23.4`. The suite includes marked-effect acceptance; missing-marker, accessor, extra-property, and wrong-descriptor rejection; lowerCamel Action acceptance and PascalCase rejection; getter and proxy reentry; ordinary reentrant dispatch; and stale post-unmount logical-view/empty-DOM assertions.

The inherited pre-repair probe and result remain at `coordination/reviews/xr_g_runtime_probe.mjs` and `.json`. Its source SHA-256 is `3b5f1c6c7984424e410661aef42eae2d0db22b9f9dc666158e18a490e369a146`; result SHA-256 is `87b8fa610997e39e409193d9ad25bd7eb13fc17530526efd77a98b630b30a59d`. The focused post-repair runtime suite directly covers the prior casing, reentry, and lifecycle findings. The inherited probe’s renderer stub throws for `domSnapshot()` after unmount, unlike the repaired React renderer API, so its lifecycle case is not a post-repair integration check.

## Limits

The focused tests use stub symbols and a renderer stub. Four-app generated-JavaScript and mounted-browser conformance are pending N6’s run against the frozen runtime and renderer. No such result is claimed here yet.

## SHA-256

- Runtime: `18a9565d8e80179a22240f1fbe109b3d7297cee1551aaa43ccc09b0f912b1908`
- Runtime tests: `05c1b193038df485b260e98c5e6705d036a1eba2b27f79f884b0598811833af8`
- Pre-repair runtime: `6252e457db9992bb14ae7b866b2bc893c04eebab1b2917a3c0da6fa53e0067df`
- N1 ABI report: `123a3d0e75b06409572906107924f3389e3d63149486bd72cde61b5f7d8c4519`
- Build facade: `719c8495cdd131860b4879cba3108fc3e327aa967904037fd12dd3462ffa6277`
