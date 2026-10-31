# E-DOM

**Outcome: mixed change.** Added a native DOM renderer and extracted the shared GoScript view validation from the React renderer. The React adapter continues to pass its existing renderer and binding tests. The integrated four-app/five-fixture matrix is pending N3 and is not claimed here.

## Changes

- `compiled-frontend/frontend/dom/renderer.mjs` exports `createDOMRenderer({container,onFailure})` with the runtime renderer protocol: synchronous `update(view,callbacks)`, `viewRecord()`, `domSnapshot()`, and physical `unmount()`.
- Native rendering creates and reconciles DOM nodes directly. Logical identities use the same key/index rule as React, so keyed reorder retains the physical node and backward text selection. Focus snapshots use React's `{identity,selectionStart,selectionEnd,selectionDirection}` shape for renderer swaps.
- Controlled `value` and `checked` bindings read live target properties; literal handlers keep their declared message arguments. Boolean attributes and styles map to native DOM behavior. Each render replaces event listeners and stale callback epochs are fenced.
- `compiled-frontend/frontend/shared/view.mjs` now owns the renderer-neutral descriptor snapshot, GoScript struct/GoSlice admission, tree and binding validation, path/key helpers, and record encoding. React imports these helpers; the DOM renderer uses the same validation. Descriptor-only checks do not invoke getters or spare-capacity factories.

## Verification

Toolchain: Node `v22.23.4`; Chromium `153.0.8010.0` from `/tmp/chromium`.

- `node --test compiled-frontend/frontend/dom/renderer.test.mjs`: **3 passed, 0 failed** in Chromium. Covers GoScript wrapper inputs, outerHTML and live controls, disabled/style attributes, literal and value/checked binding arguments, keyed reorder with backward selection, detached callback fencing, and physical unmount.
- `node --test compiled-frontend/frontend/react/renderer.test.mjs compiled-frontend/frontend/react/bindings.test.mjs`: **25 passed, 0 failed** after shared-validation extraction.
- `node --check` on the shared, DOM, and React renderer modules and `git diff --check` on owned source files: passed.
- The pre-implementation RED command, `node --test compiled-frontend/frontend/dom/renderer.test.mjs`, exited 1 because the new renderer module did not yet exist (`ERR_MODULE_NOT_FOUND`).

The Node 22 test runs emit a non-failing `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning from the Playwright/undici environment.

## Limits

N2 did not run the integrated four-app/five-fixture native/direct-JS/DOM oracle. N3 owns that harness run; it remains pending. This report establishes the renderer contract and focused browser behavior only.

## SHA-256

- `compiled-frontend/frontend/dom/renderer.mjs`: `86fed3d2bd883a1de533731148c6b5238ac220343ccf9db6b4cc5340a0a7a38e`
- `compiled-frontend/frontend/dom/renderer.test.mjs`: `7c7d472e2994869a1798bad82c7b466ba653734e35abdaaad9d0295e5347ca29`
- `compiled-frontend/frontend/shared/view.mjs`: `ef2aaa7daf021b3e46dd5cec159951ec1e84d4ea3d7f3888ec6b8c27d7a959e0`
- `compiled-frontend/frontend/react/renderer.mjs`: `2bb7c59b3d160c09ec9fea61d382df7c4e07ed97ba22c6c790f9682fa00a26c6`
- DOM test log: `eabd90e814ac4432f082ce9f451b2f280fb3ae11c04eb56936755950ea2a3769`
- React regression log: `509eb40226b009f448500451e4202ad1cdd710aeb4faf26fb60f3bfcd99e956c`
