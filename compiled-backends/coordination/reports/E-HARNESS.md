# E-HARNESS

**Outcome: mixed change.** Added a reusable browser conformance driver for the compiled React and native DOM renderers. The driver runs one compiled module against native/direct-JavaScript references, both static renderers, and an alternating swap schedule. After preserving and correcting issues exposed by earlier attempts, the final attempt-10 matrix matched all five fixture scripts. All five runs recorded stable before/after source pins, exact native/direct trace equality, and passing static React, static DOM, and swap oracles. The harness checker tests pass 5/5.

## Harness

- `compiled-backends/conformance/run.mjs` provides `--app-ir --compiled --helpers --native-bin --fixture --output`, with optional `--schedule` and `--chromium`. It writes native/direct/browser/check/manifest/run JSON and bundles the browser app for reproducibility. Failures retain partial evidence and input pins.
- `browser.mjs` captures static React and DOM runs plus fixture-specific alternating swaps, including Go state/View/trace/effect-correlation invariance, retired renderer callback fencing, old-root emptiness, physical target values, focus/selection restoration, disabled controls, and post-unmount probes. Swap observations are a separate `gobi.backend-swap-observations/v1` record, outside `Gobi.Trace`.
- `check.mjs` compares against the existing native/direct/DOM oracles and validates actual target values, Go messages, effects, and mutation controls. `swap-schedules.json` names the five existing deterministic fixture scripts; it introduces no seeds or new app actions.
- The effect fixture sends a wrong-correlation attempt before the scripted manual completion, records pending state before reply, and exercises duplicate completion. The latest checker requires this evidence. The preserved browser counter pass below predates this latest effect-control addition, so it does not verify the current harness source.

## Verification

Toolchain: Node `v22.23.4`, Playwright `1.64.1`, Chromium `153.0.8010.0` at `/tmp/chromium`, Go `go1.24.0`. Node tests emit a non-failing experimental `UNDICI-EHPA` warning.

Latest harness-only command:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-backends/conformance/browser.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-backends/conformance/check.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-backends/conformance/run.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-backends/conformance/check.test.mjs
```

Result after the detached-callback evidence correction: **5 passed, 0 failed**. These checker tests include mutation rejection, action evidence, preserved focus without a declared witness, explicit keyed focus and selection checks, rejection of missing or changed witnesses, and separate lifetime/no-double-tick checks for retired and active stale callbacks.

A native oracle executable was built with:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go build -o compiled-backends/artifacts/compiled-native ./cmd/compiled-native
```

SHA-256: `fbbc867acb4a7baf0a0c6e5f26ab1abf524b5d2011b992cce1e5a30d75c3a186`.

The preserved attempt-06 counter command was:

```sh
CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node compiled-backends/conformance/run.mjs --app-ir /tmp/gobi-e-build-cli-smnn3g0r/react/apps/counter-b05e9eb0e4e6/app-ir.json --compiled /tmp/gobi-e-build-cli-smnn3g0r/react/apps/counter-b05e9eb0e4e6/gobi-compiled.mjs --helpers /tmp/gobi-e-build-cli-smnn3g0r/react/apps/counter-b05e9eb0e4e6/encoder.mjs --native-bin compiled-backends/artifacts/compiled-native --fixture compiled-frontend/fixtures/counter.json --output compiled-backends/artifacts/conformance-captures/attempt-06/counter
```

It recorded `matched`: five application ticks, four swaps, and eight then-current mutation controls, with native/direct trace equality and static React/DOM oracle matches. That run's 33 source pins were stable during execution. Its pinned `browser.mjs` and `check.mjs` hashes differ from the latest harness files, so it is historical diagnostic evidence only, not a pass for the current source. Its input AppIR/module/encoder hashes were respectively `704e1d767e0abde21a33c300c7cc130a4e318688468a630fd8b394842cb6758b`, `cec7070ff40af28407e70b1028ee9b89a6082e9ae2b972eb3e7111fdb836fdbd`, and `383bd7611e2175441e655f98aca6446523b30eec1fcfc5a7bc57048edc30d3f9`.

The attempt-06 form run used the same command shape with `apps/form-a3fe6b48b000/{app-ir.json,gobi-compiled.mjs,encoder.mjs}` and `compiled-frontend/fixtures/form.json`. Native and direct captures completed, followed by static React and DOM browser profiles. During the first React-to-DOM swap after editing the text input, the harness rejected because the new renderer's `outerHTML-v1` differed from the independent DOM oracle: the React and DOM input attribute order differed. N2 later corrected the DOM renderer's input order. Attempt-07 then exposed a separate checked-attribute mismatch when React remounted a checked controlled input; details follow below.

## Frozen-source integration attempt-07

Root opened the source-freeze gate after runtime and build repairs; the matrix used fresh post-repair CLI outputs in `/tmp/gobi-e-build-frozen/{react,dom}` and a rebuilt native oracle. Both builds produced four apps and 209 files with the correct backend tags. Their file path sets matched and all 204 non-manifest/non-bundle files were byte-identical. The React and DOM manifest hashes were `a2fa18abeab82a9d752ed3ecdf2c2734593eb0a292718a6b7e533e13701dbc5c` and `5174d864a318fd7c7356d2158dc725ee2088d76aadc8c4f60c78ecb9447a9f11`. The compiled-native executable SHA-256 was `fbbc867acb4a7baf0a0c6e5f26ab1abf524b5d2011b992cce1e5a30d75c3a186`.

Each fixture was run with this exact CLI shape (the concrete AppIR/module/encoder directory and fixture/output values are listed below):

```sh
CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node compiled-backends/conformance/run.mjs --app-ir /tmp/gobi-e-build-frozen/react/apps/<app>/app-ir.json --compiled /tmp/gobi-e-build-frozen/react/apps/<app>/gobi-compiled.mjs --helpers /tmp/gobi-e-build-frozen/react/apps/<app>/encoder.mjs --native-bin compiled-backends/artifacts/compiled-native --fixture <fixture> --output compiled-backends/artifacts/conformance-captures/attempt-07/<profile>
```

| Profile | App directory | Fixture | Output stem |
| --- | --- | --- | --- |
| `counter` | `counter-b05e9eb0e4e6` | `compiled-frontend/fixtures/counter.json` | `compiled-backends/artifacts/conformance-captures/attempt-07/counter` |
| `form` | `form-a3fe6b48b000` | `compiled-frontend/fixtures/form.json` | `compiled-backends/artifacts/conformance-captures/attempt-07/form` |
| `list` | `list-f8359aa2866d` | `compiled-frontend/fixtures/list.json` | `compiled-backends/artifacts/conformance-captures/attempt-07/list` |
| `effect` | `effect-ff8449e8f5b2` | `compiled-frontend/fixtures/effect.json` | `compiled-backends/artifacts/conformance-captures/attempt-07/effect` |
| `list-growth` | `list-f8359aa2866d` | `compiled-frontend/conformance/fixtures/list-growth.json` | `compiled-backends/artifacts/conformance-captures/attempt-07/list-growth` |

Every attempt-07 run recorded 33 stable source pins and pinned its AppIR, compiled module, encoder, native executable, bundle, and captured traces. Toolchain: Node `v22.23.4`, Playwright `1.64.1`, Chromium `153.0.8010.0` at `/tmp/chromium`, Go `go1.24.0` for the native oracle and Go `go1.27.3` for fresh frontend builds. The React-tagged compiled module for each app was mounted through both renderer adapters.

| Fixture | Attempt-07 result |
| --- | --- |
| `unchanged-counter-add-reset-disabled` | Matched: 5 trace ticks, 4 swaps, 8 then-current mutation controls. |
| `compiled-form-text-checked-literal-save-reset` | Rejected during swap checking: React's new mount serialized a checked checkbox as `checked=""`; the independent oracle records checked as a live control property and omits that outerHTML attribute. |
| `compiled-keyed-list-identity-empty-and-detached` | Rejected on the same checked-attribute mismatch after checked row actions. |
| `compiled-effect-commit-before-deterministic-reply` | Browser profiles completed 3 swaps. Observed focus/selection matched before and after the swaps and runtime diagnostics recorded capture/restore. The checker then rejected because the fixture has no explicit `focusWitnesses` entry even though the input became focused through the normal edit action. |
| `compiled-list-growth-spare-capacity-edit-reorder-reset` | Rejected on the same checked-attribute mismatch after checked row actions. |

Root confirmed the three checked-attribute failures come from a React mount with a checked controlled input; the oracle was not weakened. The React repair was frozen with its focused browser suite passing 26/26. An independent runtime review then held the accepted run for returned-promise handling in renderer observations. N1 froze the runtime correction with its 27/27 suite, after which the attempt-10 matrix ran. The effect witness failure was a checker condition: focus preservation is always compared when the browser reports focused input, while fixture-specific key/range is required only when that fixture declares a witness. The checker correction preserves the observed focus comparison and requires explicit witness details only for declared witnesses. Attempt-07 remains immutable as the pre-repair failure record; attempt-10 below validates the corrected source.

Captures are under `compiled-backends/artifacts/conformance-captures/attempt-07/`. The per-fixture `.run.json` files retain before/after source pins and commands; completed/failing browser bundles, browser evidence/partials, and native/direct traces are present. All native/direct trace hashes match, but integration status for those files is governed by the browser/checker outcomes above.

## Frozen-source integration attempt-10

After the runtime observation fix, React checked-property repair, DOM renderer repair, and checker updates were frozen, the complete matrix was rerun. It uses the same React-tagged compiled module per app through both renderers, from fresh post-build-fix four-app outputs `/tmp/gobi-e-build-frozen/react` and `/tmp/gobi-e-build-frozen/dom`. The CLI output trees have identical paths and 204 common non-manifest/non-bundle files match byte-for-byte; each contains four apps and 209 files. The native oracle SHA-256 is `fbbc867acb4a7baf0a0c6e5f26ab1abf524b5d2011b992cce1e5a30d75c3a186`.

Toolchain: Node `v22.23.4`, Playwright `1.64.1`, Chromium `153.0.8010.0` at `/tmp/chromium`, Go `go1.24.0` for the native oracle and `go1.27.3` for frontend CLI builds. Each run captured 34 input pins before and after execution; all ten pin sets (before/after for five fixtures) matched. Each native trace exactly matched its direct-JavaScript trace. No seeds were supplied or invented; these are the five deterministic existing fixture scripts.

Exact CLI shape, with the concrete paths in the table:

```sh
CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node compiled-backends/conformance/run.mjs --app-ir /tmp/gobi-e-build-frozen/react/apps/<app>/app-ir.json --compiled /tmp/gobi-e-build-frozen/react/apps/<app>/gobi-compiled.mjs --helpers /tmp/gobi-e-build-frozen/react/apps/<app>/encoder.mjs --native-bin compiled-backends/artifacts/compiled-native --fixture <fixture> --output /workspace/scratch/39a56936f173/gondola-backends/compiled-backends/artifacts/conformance-captures/attempt-10/<profile>
```

| Profile | App directory | Fixture file |
| --- | --- | --- |
| `counter` | `counter-b05e9eb0e4e6` | `compiled-frontend/fixtures/counter.json` |
| `form` | `form-a3fe6b48b000` | `compiled-frontend/fixtures/form.json` |
| `list` | `list-f8359aa2866d` | `compiled-frontend/fixtures/list.json` |
| `effect` | `effect-ff8449e8f5b2` | `compiled-frontend/fixtures/effect.json` |
| `list-growth` | `list-f8359aa2866d` | `compiled-frontend/conformance/fixtures/list-growth.json` |

| Profile | Fixture | Ticks | Swaps | Focus swaps | Mutation controls | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `counter` | `unchanged-counter-add-reset-disabled` | 5 | 4 | 0 | 8 | matched |
| `form` | `compiled-form-text-checked-literal-save-reset` | 10 | 9 | 1 | 10 | matched |
| `list` | `compiled-keyed-list-identity-empty-and-detached` | 11 | 10 | 5 | 8 | matched |
| `effect` | `compiled-effect-commit-before-deterministic-reply` | 5 | 3 | 2 | 11 | matched |
| `list-growth` | `compiled-list-growth-spare-capacity-edit-reorder-reset` | 12 | 11 | 1 | 8 | matched |

Attempt-10 totals: **43 application ticks, 37 swaps, 9 focus-preserving swaps, and 45 detected mutation controls**. Every `.run.json` reports `status: matched` and `sourceStable: true`. Every `.check.json` reports `react`, `dom`, and `alternatingSwap` as matched. The effect profile records one request, one manually delivered completion, a rejected wrong-correlation attempt before reply, a rejected duplicate completion, the pending state before reply, and three swaps while preserving effect correlation.

The list stale-action record explicitly separates two actors. It invokes a retained callback from retired React renderer 7, verifies that it adds no application tick and records one out-of-band stale fence, then performs one active renderer 8 `onStaleAction` missing-target callback attempt. The active attempt adds exactly one suppressed application tick, leaves state unchanged, and causes no dispatch. This is recorded as a driver callback attempt, not as proof that a retained DOM event listener ran. Attempt-09 targeted list validation matched at 11 ticks and 10 swaps before attempt-10.

The current runtime/renderer source pins observed in the attempt-10 input manifests include runtime `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4`, React renderer `35581215d912c0b19a63de9f122b75fef774c717100590d272cf9e7731943f6a`, DOM renderer `8037c0b9d3430310aa9492ab9d1041207e33276f8a6dce219b84b2af17efa166`, and shared view `ef2aaa7daf021b3e46dd5cec159951ec1e84d4ea3d7f3888ec6b8c27d7a959e0`. Per-fixture `.run.json` files and `.manifest.json` files retain complete source and output hashes for each bundle, trace, app module, encoder, AppIR, and native executable.

Earlier preserved diagnostic failures and fixes:

| Capture | Result |
| --- | --- |
| `attempt-01/counter` | Initial shared-container teardown probe incorrectly queried the old React renderer after remount. |
| `attempt-02/counter` | Harness `ReferenceError: action is not defined`; fixed in the driver. |
| `attempt-03/counter` | Checker compared swap-prefix browser DOM to native ticks whose DOM is intentionally `null`; fixed to compare application traces separately from backend DOM observations. |
| `attempt-05/counter` | Post-unmount callback probe lacked a message; fixed to use a safe Go message probe and preserve established suppressed-tick behavior. |
| `attempt-06/counter` | Historical harness snapshot matched; see qualification above. |
| `attempt-06/form` | Cross-backend DOM-oracle attribute-order mismatch, preserved for renderer review. |

Captured directories retain bundles, native/direct/browser traces, run manifests, and failure partials. The initial source-freeze gates were raised after runtime focus/observation handling findings and a zero-valued exported build emitter panic; root later confirmed the reviewed production fixes frozen and opened attempt-07. Attempt-07 then found the separate React checked-attribute issue and a checker witness mismatch. After those were repaired, attempt-08 found the retained-old-React-callback versus active-DOM missing-target lifetime mismatch. Attempt-09 passed the focused list schedule after N3 corrected the evidence classification. Attempt-10 is the final accepted full five-fixture matrix described above.

## Current source pins

- `compiled-backends/conformance/browser.mjs`: `9c0f4e41c918c1104b10fb29a0a218bd2b723280bcf6573a5350952041a5179e`
- `compiled-backends/conformance/check.mjs`: `8445bb81fa6fc3822f58ca7d090d48eaa91596e99585d14c88180c30f9c201a3`
- `compiled-backends/conformance/run.mjs`: `bb4d5036f95695600a07c55b01852c784e98ad0fd7357e08fe22a33fa3bfe73b`
- `compiled-backends/conformance/swap-schedules.json`: `f0bf47cf0ac5c17f876a316508729e6d29082feecf08df9813538c5a49b24053`
- `compiled-backends/conformance/check.test.mjs`: `5cbab8a25128b39ebb78fc1b942f9f931faad67671b6793e59f8020f2a781b66`
