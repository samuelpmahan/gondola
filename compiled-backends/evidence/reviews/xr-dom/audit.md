# XR--DOM review evidence

Review target: N2's `E-DOM` implementation (native DOM renderer, shared view validator, and React renderer extraction). No production files were edited by this review.

## Independent executions

| Command | Result | Toolchain |
| --- | --- | --- |
| `CHROMIUM_PATH=/tmp/chromium PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/dom/renderer.test.mjs` | 3 passed, 0 failed | Node v22.23.4; Chromium 153.0.8010.0 |
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/react/renderer.test.mjs compiled-frontend/frontend/react/bindings.test.mjs` | 25 passed, 0 failed | Node v22.23.4 |
| `node --check` on the shared validator, DOM renderer, and React renderer modules | All three exited 0 | Node v22.23.4 |

The Node test output includes the non-failing experimental `UNDICI-EHPA` warning. Captured logs are `dom-node22.log`, `react-node22.log`, `static-node22.log`, `dom-syntax.log`, and `react-syntax.log` in this directory. Toolchain versions are in `toolchain-node.txt` and `toolchain-chromium.txt`.

## Reviewed behavior

- The React refactor replaces its in-file validation/record helpers with `createViewTools`; inspection against the base React renderer shows this is an extraction, with the remaining React lowering and mounting code unchanged.
- Shared validation snapshots own data descriptors, rejects unknown fields/accessors, and checks native arrays and GoSlice wrapper/backing descriptors. GoSlice acceptance requires the observed own `target: undefined` field; spare capacity holes are accepted only with the local `goscript.spareZero` function descriptor, which is inspected but never called.
- The DOM adapter uses the shared `identityFor` rule and keeps keyed element instances across reorder. The Chromium test confirms the same input node remains focused with its backward selection through a keyed reorder.
- The Chromium test verifies exact `outerHTML`, ordered live control records, boolean `disabled`, ordered style properties, and click/input/change event messages. The literal handler argument stays separate from the physical target value; value and checked bindings read live DOM properties.
- The retained callback test exercises a detached node from an earlier DOM view epoch and observes `onStaleAction`. The React tests cover stale epochs, nested keyed identity, fragments, event/binding admission, and descriptor edge cases.

## Review boundary

The DOM test helper constructs descriptor-shaped GoScript structs and slices using the marker and wrapper fields; it does not import an actual generated application module. Its live-control snapshot assertion samples the initial values, while the subsequent input/checkbox interaction assertions verify event messages. It does not take a second snapshot after those interactions. The three DOM tests also do not exercise a retired renderer callback after `runtime.replaceRenderer`, cross-backend focus/selection restoration, or the contract's new physical node identity across a React↔DOM swap. The React regression suite is renderer-lowering/bindings coverage, not a mounted React browser run.

Those swap and generated-app assertions are owned by N3's integrated four-app/five-fixture matrix. That matrix was pending at this review checkpoint, so the focused source/tests cannot establish universal backend-replacement coverage.

## Source fingerprints

- `compiled-frontend/frontend/shared/view.mjs`: `ef2aaa7daf021b3e46dd5cec159951ec1e84d4ea3d7f3888ec6b8c27d7a959e0`
- `compiled-frontend/frontend/dom/renderer.mjs`: `86fed3d2bd883a1de533731148c6b5238ac220343ccf9db6b4cc5340a0a7a38e`
- `compiled-frontend/frontend/dom/renderer.test.mjs`: `7c7d472e2994869a1798bad82c7b466ba653734e35abdaaad9d0295e5347ca29`
- `compiled-frontend/frontend/react/renderer.mjs`: `2bb7c59b3d160c09ec9fea61d382df7c4e07ed97ba22c6c790f9682fa00a26c6`
- `compiled-backends/coordination/reports/E-DOM.md`: `8b536abbb8e742bb7a8968558d94391e6c633df3ae1f5b35979709290efc318d`
