# E-BROWSER

**Worker N2 · Outcome: mixed change.** Added a hand-authored DOM and live-control oracle plus a browser adapter for the frozen value-method fixture. The final source-pinned browser run matched native/direct application traces through React-only, DOM-only, and 18 alternating React/DOM swaps. The browser matrix was orchestrated by N3; this lane independently checked the retained raw browser records against its oracle.

## Browser adapter and oracle

`compiled-methods/browser/dom-oracle.mjs` encodes all 19 expected fixture states, action intents, button keys, labels, disabled states, exact `outerHTML-v1` serialization, and live control properties without reading candidate AppIR or renderer output. Its fixture validator binds the browser run to the frozen 18-action script and empty host script. The mutation tests reject changed markup and live disabled state.

`compiled-methods/browser/runner.mjs` exports `runMethodsBrowserConformance({compiledPath, helpersPath, fixturePath, outputPrefix, schedule, chromiumPath})`. `browser-entry.mjs` imports one compiled GoScript module and its typed encoder once per browser page, then mounts fresh runtimes for React-only and DOM-only profiles and uses `replaceRenderer` in one swapped profile. Each action record separates the physical click and renderer observation from its application trace tick. Four disabled clicks (indexes 6, 9, 10, and 17) produce no renderer callback; the adapter records one runtime-suppressed tick for each.

The swapped profile follows the canonical alternating schedule after every action, including the last action. Before each swap, the adapter retains a real renderer callback from an enabled button. After the old root is synchronously emptied and detached, it invokes that callback and records the runtime fence separately from the Go trace. It verifies that each swap leaves trace ticks, state, and logical view unchanged, and that all 18 detached callbacks are fenced without advancing the trace. The fixture only has buttons; the renderer focus record covers inputs, so this run records no portable focus capture or restoration and makes no focus-preservation claim.

## Results

The final N3 run is `compiled-methods/evidence/harness/attempt-04-final/`. N3's checker reported `matched`: 19 ticks and 18 actions in each browser profile, 14 active dispatches, four suppressed actions, and 18 committed swaps with 18 retired-callback fences. Each profile contains 19 independent oracle snapshots and 19 physical DOM snapshots. React, DOM, and swapped traces share SHA-256 `5f4337422d692fabafa1dd77ab33273c524c9268ce40046d1fed15b87f031a98`, and the checker matched their trace cores to native Go and direct emitted-module replay. All profiles had zero page errors, zero WebAssembly requests or API attempts, and empty physical containers after unmount.

I re-read `methods.browser.json` and independently compared every trace DOM snapshot and physical snapshot to `expectedMethodsDOM` from the N2 oracle, then checked action messages, disabled suppression, swap tick counts, callback fences, no-WASM records, and unmount state. The audit summary is `compiled-methods/evidence/browser/observed-run-audit.json` (SHA-256 `dbc264efe29f6fe097ac06e625bd178973b2ae498c16d6d5156f9806efa7237a`). N3's run record says source pins remained stable across the matrix: 188 before and after.

## Verification

Node `v22.23.4` checks passed:

- `node --check` for `runner.mjs`, `browser-entry.mjs`, `dom-oracle.mjs`, and `dom-oracle.test.mjs`.
- Import check for the `runMethodsBrowserConformance` export.
- `node --test compiled-methods/browser/dom-oracle.test.mjs` — 6 passed, 0 failed. Raw output: `compiled-methods/evidence/browser/dom-oracle.node22.test.log`.

The N3 integrated command used the pinned React compiler output for all three browser profiles, the separate DOM build for AppIR/module parity, native Go `1.24.0`, Node `v22.23.4`, and Chromium `153.0.8010.0` at `/tmp/chromium`. The exact command and the source/output pin inventory are retained in `compiled-methods/coordination/reports/E-HARNESS.md` and `compiled-methods/evidence/harness/attempt-04-final/methods.run.json`. The shared no-WASM guard reported no requests or API attempts.

## Limits

This is one fixed 18-action fixture with no effects and no focusable input. It does not test input selection restoration, an effect-completion workflow, randomized action sequences, or managed-CI browser execution. The browser evidence exercises the React-built GoScript module through both renderer implementations; the DOM-built module is separately pinned by N3 and was not the module mounted by these three profiles.
