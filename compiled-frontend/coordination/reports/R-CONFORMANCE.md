# R-CONFORMANCE

**Outcome: passed.** The frozen R-ABI-CODEC encoder and R3 renderer were rebuilt, and N6 ran five deterministic profiles through native Go replay, independent emitted-JavaScript replay, mounted Chromium, and the closed checker. All five reports matched exactly. The four built apps cover five scripts because `list-growth` runs a second scenario against the existing list app.

## Profile results

| Profile | Trace ticks | Mutation controls | Result |
| --- | ---: | ---: | --- |
| counter | 5 | 17 | matched |
| form | 10 | 18 | matched |
| list | 11 | 19 | matched |
| effect | 5 | 18 | matched |
| list-growth | 12 | 17 | matched |
| **Total** | **43** | **89** | **0 mismatches** |

The 12-tick growth trace has 11 action expectations plus init. Its final disabled Reset attempt is captured as a suppressed action tick. Hand-authored expectations cover the five `Add` states, Row 3 edit, Row 5 check, Row 5 reorder, Row 3 removal, reset to non-nil empty `Rows`, and a disabled reset attempt.

The independent GoScript probe against the fresh list module confirms the Add sequence reaches `Rows` length/capacity 3/4 after Add #3 and 5/8 after Add #5. Both backings carry the own `Symbol(goscript.spareZero)` function descriptor; unused capacity slots remain holes. The module hash was stable during the probe. This is recorded in [list-growth-abi.json](../../conformance/raw/r-conformance-final/list-growth-abi.json).

## Browser evidence

- Every profile records zero WASM API attempts and zero `.wasm` requests. Each browser run observes the physical root and renderer snapshot empty after unmount; all page error arrays are empty.
- The form literal action preserves three separate facts: requested value `must not replace literal`, actual button value `""`, and Go message argument `target.value`.
- The original list fixture preserves the keyed input node through reorder. Its focused selection remains start 0, end 2, direction `backward` before, immediately after, and after a frame. The retained callback from the removed input produces one stale observation and no dispatch.
- The effect host sees the committed pending trace and DOM before completing request `dispatch-0002`; the Request button is disabled at that point. One completion is delivered; a duplicate is rejected without adding a trace tick.
- The growth fixture finishes with `Rows: []`, `NextID: 5`, and disabled Reset. The final physical click is suppressed, with no additional state dispatch.
- A stale callback after **runtime unmount** remains `not-tested`. The verified stale callback is for a detached React DOM node before runtime unmount.

## Commands and pinned inputs

The independent sequential run is [run.sh](../../conformance/raw/r-conformance-final/run.sh). It reads the fresh root build at `compiled-frontend/artifacts/compiled`, builds the native replay binary with Go 1.24 and `GOFLAGS=-buildvcs=false`, then writes native/direct/browser/checker outputs for all five profiles in order. It runs the Node conformance suite with the explicit Chromium environment. The post-run independent verifier is [verify-five-profiles.mjs](../../conformance/raw/r-conformance-final/verify-five-profiles.mjs).

```sh
compiled-frontend/conformance/raw/r-conformance-final/run.sh
/tmp/gondola-node22/node_modules/node/bin/node \
  compiled-frontend/conformance/raw/r-conformance-final/verify-five-profiles.mjs
```

Focused test result: `CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/conformance/*.test.mjs` — Node `v22.23.4`, 40 passed, 0 failed. N6 native replay used Go `1.24.0`; root's fresh compiler profile used Go `1.27.3`. Playwright launched Chromium `153.0.8010.0`. The fixtures and host scripts are deterministic; no random seed is used.

The root integration run also passed: five checker reports, 43 ticks, demo smoke passed, 116 source pins unchanged, and 209 compiled output hashes unchanged. Its complete receipt is [execution.json](../../artifacts/execution.json). Fresh build manifest SHA-256 is `ab7f08e05f210f48f63c4bc7319383a6f2e08a3c89caf5c5a660fc91b64a7ae4`.

N6 direct manifests pin 98 inputs per profile; browser provenance pins the same 98 inputs before loading and adds one generated bundle. Direct replay checks before/after source pins; browser checks before loading, after bundling, and after execution. The five-profile verifier compares the pre-load and bundled input sets after removing only the generated bundle entry. The full root runner compared 116 source pins before and after execution.

Key source hashes for the accepted run:

- `compilercontract/js_encoder.go`: `a605b3267f63f7c7ed90c17ee2ed9bf04c7667827a23496c8620070f13b9b46d`
- `frontend/react/renderer.mjs`: `12e50f96ec61975551d4f63242a512912aa986727170186ccb83ad66a9902da0`
- `frontend/runtime/runtime.mjs`: `ab0a2fe8c97293a8e45a035b92e46a80ae53b702103de47ca337f0a830b26704`
- `conformance/browser.mjs`: `e5226c8156a27bb1da620556e71cc10daa49d5b7ec3b364c00aa806f2ac90bea`
- `conformance/direct-js.mjs`: `94e0da9f2d177d1ab6840bddfed0774358db36a3abe368b79b044d89167308c0`
- `conformance/fixtures/list-growth.json`: `1159fea3b6937b325d66f6fbc201f31b3e6edd22bb1426723bd92e6d2d76a0a0`

Per-profile traces, manifests, checker reports, logs, and hashes are in [the raw capture](../../conformance/raw/r-conformance-final/); [SHA256SUMS](../../conformance/raw/r-conformance-final/SHA256SUMS) covers every artifact there. The earlier R2 `G-CONFORMANCE` failure capture and receipt remain preserved as historical evidence; this result uses the fresh R-ABI-CODEC/R3 build.
