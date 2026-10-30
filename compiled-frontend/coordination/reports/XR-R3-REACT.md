# XR-R3-REACT

**Decision: accepted for the bounded GoScript spare-capacity ABI observation.** The frozen R3 renderer admits the observed `goscript.spareZero` metadata by own descriptor shape, copies only dense visible GoSlice values, and leaves the metadata function uncalled. Independent Node, Go emitter, and actual compiled-module checks passed. This decision does not claim that the private symbol authenticates an object or that the browser conformance gate passed.

## Reviewed sources

Repository root and working directory for these checks: `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend`. I made no production-source changes.

| Source | SHA-256 |
| --- | --- |
| `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/frontend/react/renderer.mjs` | `12e50f96ec61975551d4f63242a512912aa986727170186ccb83ad66a9902da0` |
| `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/frontend/react/renderer.test.mjs` | `0d2c1483c19ff95cc320dab64aeb2f4ec795e0b14e4128b45fe9aa0dafc2e99f` |
| `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/frontend/react/bindings.mjs` | `ac9b40e56039e385adf5d5b66f7476092aedaec7887dd51b00026def6f2e105b` |
| `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/frontend/react/bindings.test.mjs` | `3ecbf7d0958e0ca4c330c2136ed615d6154e84d7efe79af5526cc38fb09249e9` |
| `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/emit/backend_test.go` | `e389a072b96397b5c6f9d11656d2b3a25d61ce75ba955483553419dca3d33c04` |

The source hash for `renderer.mjs` matches N3's frozen R3 hash. The reviewed implementation checks the exact GoSlice wrapper fields from their own data descriptors; permits at most one non-global symbol named `goscript.spareZero` with an own enumerable, writable, configurable function value; checks backing indexes and bounds; requires a dense visible window; and copies descriptor values into a fresh dense array. The function itself is never called. Native arrays continue through the strict path. The source checks are at `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/frontend/react/renderer.mjs:126`; descriptor-only Proxy coverage and the unused-capacity case are in `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/frontend/react/renderer.test.mjs:128`.

The private symbol is a shape observation, not an authenticity check. A caller can construct a symbol with the same description and a matching descriptor. The acceptance is limited to the observed pinned GoScript representation at this renderer boundary; it does not establish trusted provenance for arbitrary JavaScript objects.

## Independent test runs

| Command | Result | Preserved log |
| --- | --- | --- |
| `/tmp/gondola-node22/node_modules/node/bin/node --test frontend/react/renderer.test.mjs frontend/react/bindings.test.mjs` | Node `v22.23.4`, 25 passed, 0 failed, exit 0 | `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r3_react/node-tests.log`, SHA-256 `8343a22272abbadcc737680f96534d24bf4503884682c8ccf757493717c0dab5` |
| `GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 -v ./emit` | Go `go1.27.3 linux/amd64`, 4 passed, 0 failed, exit 0 | `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r3_react/go-emit-tests.log`, SHA-256 `7d03388bd0953a2be8cb39918bc0dd5de26f4621f2a464104fe76804573b25bd` |

The unit suite covers ordinary backing and wrapper `get` traps, unknown symbols, malformed marker descriptors, visible-window holes, and sparse spare capacity without the marker. The metadata function is not invoked by the implementation; a unit fixture uses a throwing function and confirms zero calls.

## Actual compiled-module checks

Using Node `v22.23.4`, I independently imported all four current N1 modules from `/tmp/gondola-compiled-atomic/apps/*/gobi-compiled.mjs`, resolved each component's `Init`, `Update`, and `View` roles from its AppIR, invoked each actual `Init` and `View`, and passed each view into `lowerView`. Counter, effect, form, and list initial views all lowered. The four module hashes match the output artifacts previously recorded by N1/N3:

| App | Module SHA-256 | Initial view lowered |
| --- | --- | --- |
| Counter | `e7fd6d515cb1c90a28d90db51b85ee4d06986ed5999ee2b7d15b64fba2acfeda` | yes |
| Effect | `7736585c8dea675a146861a840dbc7fec6afd3f0e4e70f2ea677dfbf757e038a` | yes |
| Form | `a3bbf244004e10ae1b82a895dc717247731fbddad8d57dd1fbffc36c91ac6a4a` | yes |
| List | `54b09d871576d33237c0bda34da1388b9ff9fa393ddafd4f26a71ca55cd75fd6` | yes |

The actual list module's emitted `Update({Name:"add",Arg:""})` was called five times. At 3 rows, the GoScript backing had capacity 4 and one unused-capacity hole; at 5 rows it had capacity 8 and three unused-capacity holes. In both cases all visible row indexes were own properties and the backing carried one non-global `goscript.spareZero` symbol with enumerable/writable/configurable data descriptor whose value is a function. I inspected the descriptor only and did not invoke the function. `lowerView` accepted both views and the resulting React tree contained exactly 3 and 5 row elements.

The detailed actual role and backing probe is `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r3_react/actual-go-view-probe.mjs` (SHA-256 `759e505ce06ab217da208eeb9cd015b19a6d48740de422132d967d928fb596f3`) with raw JSON `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r3_react/actual-go-view-probe.json` (SHA-256 `3112a82cf6582b6c327b03c764dd7cdf1d80e5217eaf06a4d859f4845c395b71`). The row-count assertions are in `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r3_react/actual-list-lowered-rows.mjs` (SHA-256 `fcf2475e0945685f7e31314c28c8994e3f7a9392d865d42ba133516c07635c38`); its JSON result has SHA-256 `53440b9e684eaef4f75d9c23f089a5a3f85f738fb721c2b4e1f44a91bf3d77b1`.

The list assertion harness first assumed React represented a single child as an array and failed on its own `undefined !== 1` assertion. I corrected the harness to count either a single element or an array, preserved the first source and stderr at `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r3_react/actual-list-lowered-rows.initial-harness.mjs` and `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r3_react/actual-list-lowered-rows.initial-harness.stderr.log`, then reran successfully. This was a harness-shape correction; it exposed no renderer or compiled-module failure.

## Preserved earlier evidence and limits

The older renderer source and test capture for SHA `9f10b75d...` remain preserved and unmodified at `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/history/renderer-9f10b75/renderer.mjs` (SHA-256 `9f10b75d194aab53cbe504321e8f6df26592c20b6a7123d7f267ba2e68868e5a`) and `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/history/renderer-9f10b75/renderer.test.mjs` (SHA-256 `51b9dd07d3ded887adde821f89c0485ad1f244726a26fea4f0a7d8dd51f67257`). Existing N6 browser captures and manifests under `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r2_react/n6-source-900dc38/` were left untouched: counter trace SHA-256 `eae3b114b843718bca18c841816fe4fd5c280f06760f80f42ac40b4e0f09e845`; form failed trace/manifest `9c2818e39cafebc2e9ae7b661a5697f49c083cb983243a594cda0f28bc4c6e91` / `01d9ccffc5e582992b8923a975144de2ec60ba036c80f64182765a8969ad45b6`; list failed trace/manifest `f72959ea2a8074c517ac326e493b5cfa44e8a330a52b148246bae4ac32ee48e8` / `8fd88b9f8ef413d243542c27d0248b03e365359457f838739ddd5a29ea615803`; effect failed trace/manifest `717f4525d9f9ff0006991e1a4782f47b9a8f7b5c9fbc49bd974b42e0e579bd56` / `0e29292df3a429b737ba61a8d3681602309250311f84b758a695b9952fe3382d`.

These checks exercise lowering with actual generated GoScript views; they do not mount the four apps in a browser. N6 owns that browser conformance gate, and this receipt makes no browser-pass claim. The review is only for the bounded spare-capacity renderer observation and is not a global milestone or analyzer acceptance.
