# XR-R-REACT

**Decision: amend.** N3’s intended React changes are present and the focused suites pass: event callbacks emit lowerCamel `{path,event,value}` actions and uppercase `{Name,Arg}` Go messages; GoScript slice wrappers require exactly five own enumerable data properties including `target`; and post-unmount `domSnapshot()` checks the physical container is empty before returning an empty snapshot. The emitter change is confined to its test fixture, which now provides valid `gobi.Node` metadata.

## Finding

**Medium — proxy `get` traps bypass the GoScript slice descriptor validation.** `listOrEmpty()` checks own keys and own data-property descriptors, then reads `value.backing`, `value.offset`, `value.length`, `value.capacity`, and `value.target` through normal property access. A Proxy can therefore report an own data descriptor with `target: {}` but return `undefined` from its `get` trap. The exact reproduction in `coordination/reviews/xr_r_react/proxy-slice-repro.mjs` exits successfully with `{"accepted":true}` and installs an `onClick` handler. This makes the advertised own `target: undefined` requirement bypassable. The same direct-read pattern is present for metadata and native-array length/index use.

Use descriptor values for validation and create validated copies before later indexing or slicing. Dense native-array elements must also be copied from their own descriptors, and GoScript slice backing must be consumed from that copy rather than via an ordinary `backing.slice` property access. Add a regression that proves a Proxy with a contradictory `get` trap is rejected or that only copied descriptor values are consumed. The raw stdout is retained in `coordination/reviews/xr_r_react/proxy-slice-repro.raw.json`.

## Confirmed changes

- `lowerView()` creates Action as `{path,event,value}` and Go Message as `{Name,Arg}`; the tests assert both exact payloads.
- `listOrEmpty()` rejects symbols, extra/missing keys, accessor descriptors, missing `target`, non-undefined `target`, and invalid bounds; native arrays reject sparse or extra-property shapes.
- After unmount, `viewRecord()` returns `null`. After a successful commit, `domSnapshot()` returns empty HTML and no controls only when `container.childNodes.length === 0`; otherwise it throws. This is a physical-root check, not a cached-DOM claim.
- `emit/backend_test.go` now defines the actual seven-field `gobi.Node` and its nested type/slice metadata. The receipt reports no production emitter change, consistent with the reviewed test-only diff.

## Verification

- `/tmp/gondola-node22/node_modules/node/bin/node --test frontend/react/renderer.test.mjs frontend/react/bindings.test.mjs` — **15 passed, 0 failed**, Node `v22.23.4`; output is retained in `coordination/reviews/xr_r_react/node-tests.log`.
- `GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 -v ./emit` — **4 passed, 0 failed**; output is retained in `coordination/reviews/xr_r_react/go-tests.log`.
- `/tmp/gondola-node22/node_modules/node/bin/node coordination/reviews/xr_r_react/proxy-slice-repro.mjs` — **exit 0**, output `{"accepted":true}` for the invalid target descriptor behind a Proxy.

The focused Node suite tests `lowerView()` and bindings. It does not mount React in a browser, so the physical unmount snapshot branch remains for N6’s browser gate. Four-app compiled-JavaScript integration is also pending N6’s fresh build with N1’s facade source. This review does not make a claim about N4 runtime correctness.

## SHA-256

- `frontend/react/renderer.mjs`: `458383ffeb719937e6a4b9a331f635cd2358c6593c8b34ce05e58cc3ba1d6906`
- `frontend/react/renderer.test.mjs`: `1430c7ebc246b6f9547498c4947d72054139470b1e5d2b5eb762e7714280599b`
- `frontend/react/bindings.mjs`: `ac9b40e56039e385adf5d5b66f7476092aedaec7887dd51b00026def6f2e105b`
- `frontend/react/bindings.test.mjs`: `3ecbf7d0958e0ca4c330c2136ed615d6154e84d7efe79af5526cc38fb09249e9`
- `emit/backend_test.go`: `e389a072b96397b5c6f9d11656d2b3a25d61ce75ba955483553419dca3d33c04`
- Proxy reproduction: `e9b8a7abe9fd62b757aacf22db8cd7b30e7b5b3f800e76bc1d075ad08f6fb40e`
- Proxy reproduction raw stdout: `11a49f853eb8befe94fef278d487125cd20930b9e41c4c0934394443e7f00878`
- Node test log: `e15fe016785e938cc68e9dd73fe069da4f2e795109171b435fe46799fa201055`
- Go test log: `7d03388bd0953a2be8cb39918bc0dd5de26f4621f2a464104fe76804573b25bd`
