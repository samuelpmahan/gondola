# E-CI-DOM

**Outcome: not_reuse.** The published DOM and React renderers passed focused local browser suites, but both browser test files still default to `/tmp/chromium` when `CHROMIUM_PATH` is unset. The managed CI environment does not provide that path, so these browser tests are not portable there. The fresh CI run for published PR 12 / commit `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb` is still pending; this report does not claim a CI result or the integrated application matrix.

## Source audit

The renderer implementation and shared view validator match the published source pins recorded below. The DOM renderer orders input attributes to match `outerHTML-v1`, keeps `checked` as live control state, reconciles keyed nodes, captures/restores logical focus and selection, fences detached callbacks, and empties the container on unmount. React clears only serialized `checked` attributes for explicit `target.checked` bindings after its synchronous commit while retaining the live `checked` property; static checked attributes remain. Shared validation snapshots own data descriptors and admits the observed GoScript struct/GoSlice forms without invoking getters or spare-capacity factories.

I found no source-level mismatch in those behaviors. The concrete blocker is in test setup: `compiled-frontend/frontend/dom/renderer.test.mjs` and `compiled-frontend/frontend/react/renderer.browser.test.mjs` each call `chromium.launch` with `process.env.CHROMIUM_PATH || "/tmp/chromium"`. Local runs succeeded because they explicitly supplied `CHROMIUM_PATH=/tmp/chromium`. The existing shared launch helper is exported as `chromiumLaunchOptions` from `compiled-frontend/conformance/browser.mjs`; the test portability change is deferred to a separate authorized repair task.

## Local verification

Toolchain: Node `v22.23.4`; Chromium `153.0.8010.0` at `/tmp/chromium`.

- `CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/dom/renderer.test.mjs`: **4 passed, 0 failed**.
- `GOBI_CAPTURE_PHYSICAL_OUTERHTML=1 CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/react/renderer.test.mjs compiled-frontend/frontend/react/renderer.browser.test.mjs compiled-frontend/frontend/react/bindings.test.mjs`: **26 passed, 0 failed**.
- `node --check` passed for the shared validator, DOM renderer, React renderer, and React browser test.
- Both suites ran against the unchanged published sources. The temporary dependency symlinks needed by this worktree were removed after the run.

The React browser run confirmed controlled checked remains a live true/false/true property while its serialized checked attribute stays absent; the static checked attribute remains present. It also confirmed keyed nodes and focused backward text selection survive updates. The DOM focused suite confirmed input attribute order, live checked state, keyed identity and selection, and detached callback fencing.

## Limits

- Fresh CI evidence for commit `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb` has not been supplied, so CI outcome remains pending.
- The four-app/five-fixture native/direct-JS/DOM matrix is not established by these focused runs.
- The local browser suites do not verify behavior under the managed CI browser path; the hardcoded fallback is the portability finding.

## SHA-256 source pins

- `compiled-frontend/frontend/dom/renderer.mjs`: `8037c0b9d3430310aa9492ab9d1041207e33276f8a6dce219b84b2af17efa166`
- `compiled-frontend/frontend/dom/renderer.test.mjs`: `8857f373a5d39c0f04b328021315867e6ffea34166ff18877f9dee3b44033efd`
- `compiled-frontend/frontend/shared/view.mjs`: `ef2aaa7daf021b3e46dd5cec159951ec1e84d4ea3d7f3888ec6b8c27d7a959e0`
- `compiled-frontend/frontend/react/renderer.mjs`: `35581215d912c0b19a63de9f122b75fef774c717100590d272cf9e7731943f6a`
- `compiled-frontend/frontend/react/renderer.browser.test.mjs`: `4e8cd936b0ebd0597f9011c5c9a448d07fc76a9b4919cdc74da3a73b420cb78c`
- `compiled-frontend/frontend/react/renderer.test.mjs`: `0d2c1483c19ff95cc320dab64aeb2f4ec795e0b14e4128b45fe9aa0dafc2e99f`
- `compiled-frontend/frontend/react/bindings.test.mjs`: `3ecbf7d0958e0ca4c330c2136ed615d6154e84d7efe79af5526cc38fb09249e9`

