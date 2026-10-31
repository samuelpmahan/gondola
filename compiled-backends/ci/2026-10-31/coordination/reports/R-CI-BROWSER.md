# R-CI-BROWSER

**Outcome: mixed_change.** Replaced the two local `/tmp/chromium` fallbacks with the existing shared Playwright launch-options helper. When `CHROMIUM_PATH` is unset, the helper omits `executablePath` so Playwright can select its managed browser; an explicitly configured path remains supported. The focused local browser suites and the helper suite pass. The managed Playwright browser was absent from this environment, so an unset-path browser launch remains untested here and must be covered by fresh CI.

## Change

Only these source files changed:

- `compiled-frontend/frontend/dom/renderer.test.mjs`
- `compiled-frontend/frontend/react/renderer.browser.test.mjs`

Each file imports `chromiumLaunchOptions` from `../../conformance/browser.mjs` and calls `chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH))`. The helper supplies headless and no-sandbox flags, conditionally adds `executablePath` for a nonempty explicit path, and otherwise leaves executable selection to Playwright. No renderer implementation, oracle, harness, test assertion, or fixture changed.

The `CHROMIUM_PATH`-unset helper behavior is covered by the existing `compiled-frontend/conformance/browser-options.test.mjs` suite. Local browser runs below explicitly used `/tmp/chromium`; the probe found Playwright's managed executable path `/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` absent. I therefore did not claim an unset-path browser run.

## Verification

Toolchain: Node `v22.23.4`; Playwright `1.64.1`; Chromium `153.0.8010.0` at `/tmp/chromium`.

- `CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/dom/renderer.test.mjs`: **4 passed, 0 failed**.
- `GOBI_CAPTURE_PHYSICAL_OUTERHTML=1 CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/react/renderer.browser.test.mjs`: **1 passed, 0 failed**.
- `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/conformance/browser-options.test.mjs`: **2 passed, 0 failed**.
- `node --check` passed for both changed test modules; `git diff --check` passed for the two owned files.
- Managed-browser probe: `chromium.executablePath()` resolved to `/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, which does not exist here. An unset-`CHROMIUM_PATH` browser launch is untested pending fresh CI.

Logs and the managed-browser probe are saved under `compiled-backends/ci/2026-10-31/lanes/dom/repair/`.

## E-CI-DOM packet location closure

The consumed E-CI-DOM receipt retains its historical `source_scope` strings for the base coordination directory. Its report and receipt were relocated byte-for-byte to the required dated paths. The canonical packet is:

| Artifact | Canonical path | SHA-256 |
|---|---|---|
| Report | `compiled-backends/ci/2026-10-31/coordination/reports/E-CI-DOM.md` | `a141f71c0b289d7b16c027ae331a1c89de39e8c0a5d8e3a3cd20875794848e59` |
| Receipt | `compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-DOM.json` | `ff9b86058e17a425196d26c21593801d737549029fa954a9477080c066429af8` |

The metadata-only correction is recorded in `compiled-backends/ci/2026-10-31/lanes/dom/location-correction.md` (SHA-256 `aae609e65b17e3cbae1054492c53eff60666a87256de9f83e9da5092709229b9`). The original packet was not edited.

## Source SHA-256

| File | Before | After |
|---|---|---|
| `compiled-frontend/frontend/dom/renderer.test.mjs` | `8857f373a5d39c0f04b328021315867e6ffea34166ff18877f9dee3b44033efd` | `df7debccbb92954722b953f743e126e757ebe14b3a4e4eefa3014c59a098791e` |
| `compiled-frontend/frontend/react/renderer.browser.test.mjs` | `4e8cd936b0ebd0597f9011c5c9a448d07fc76a9b4919cdc74da3a73b420cb78c` | `75f9b3447ee804b92bbd47b324e210bc6a90df28525d0edfb2b7bd1d5461190e` |
| `compiled-frontend/conformance/browser.mjs` (unchanged helper) | `e5226c8156a27bb1da620556e71cc10daa49d5b7ec3b364c00aa806f2ac90bea` | `e5226c8156a27bb1da620556e71cc10daa49d5b7ec3b364c00aa806f2ac90bea` |

