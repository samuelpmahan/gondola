# XR-R-CI-BROWSER (N4 review of R-CI-BROWSER)

**Decision: accept the scoped repair.** The two changed test launchers now use the existing `chromiumLaunchOptions` helper. This removes the hardcoded `/tmp/chromium` default and leaves Playwright to resolve its managed browser when `CHROMIUM_PATH` is unset. The patch changes only browser startup in the DOM and React browser test files; I found no assertion, oracle, fixture, renderer, or harness changes.

Fresh managed-browser CI is still required. Local browser runs, including my independent reruns, explicitly set `CHROMIUM_PATH=/tmp/chromium`. The Playwright-managed executable is absent in this environment, so I did not claim the unset-path browser launch was tested.

## Patch review

At base `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`, the implementation diff is limited to:

- `compiled-frontend/frontend/dom/renderer.test.mjs`
- `compiled-frontend/frontend/react/renderer.browser.test.mjs`

Each file imports `chromiumLaunchOptions` from `../../conformance/browser.mjs` and changes the call to `chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH))`. The existing helper omits `executablePath` when no explicit path is provided and retains the path override when configured. The unchanged helper hash is `e5226c8156a27bb1da620556e71cc10daa49d5b7ec3b364c00aa806f2ac90bea`.

The author report and receipt hashes match the files at the dated canonical paths. The repair packet also closes the E-CI-DOM path metadata issue: it records the canonical dated report/receipt locations and hashes, retains the historical `source_scope` values in the consumed receipt, and references the location-correction note. I verified the E-CI-DOM report, receipt, and correction-note hashes; the original E-CI-DOM bytes remain unchanged.

## Independent verification

Toolchain: Node `v22.23.4`, Playwright `1.64.1`, Chromium `153.0.8010.0` at `/tmp/chromium`.

- DOM focused browser suite: **4 passed, 0 failed** with explicit `CHROMIUM_PATH=/tmp/chromium`.
- React browser suite: **1 passed, 0 failed** with explicit `CHROMIUM_PATH=/tmp/chromium` and `GOBI_CAPTURE_PHYSICAL_OUTERHTML=1`.
- Browser-options suite: **2 passed, 0 failed**. This verifies helper option selection, including omission of `executablePath` when no path is supplied, but does not launch the managed browser.
- `node --check` for both changed files and scoped `git diff --check` passed.
- Managed browser probe resolved `/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`; that executable is absent here.

Raw logs and hashes are recorded in [`audit.json`](../../lanes/reviews/xr-r-ci-browser/audit.json). The review made no production or test-file edits.

## Limits

- This accepts the bounded launcher repair and its focused local verification only.
- A browser launch with unset `CHROMIUM_PATH`, fresh CI results, and the integrated four-app/five-fixture matrix remain unverified here.
