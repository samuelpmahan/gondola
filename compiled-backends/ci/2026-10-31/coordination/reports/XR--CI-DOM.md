# XR--CI-DOM (N4 review of E-CI-DOM)

**Decision: amend.** E-CI-DOM's `not_reuse` portability finding is valid: both browser test launchers force `executablePath` to `CHROMIUM_PATH || "/tmp/chromium"`, while the compiled-backends workflow installs Playwright-managed Chromium and does not set `CHROMIUM_PATH`. The repository already has `chromiumLaunchOptions`, which omits `executablePath` when no explicit override is configured. If `/tmp/chromium` is absent in the managed runner, these tests fail during browser launch, before the renderer assertions. This is a source/workflow-based portability finding; I did not observe or claim a CI failure.

The repair should route both launchers through the shared helper, then validate on the fresh managed-browser CI run. The current evidence correctly says the fresh CI run is pending; no actual CI outcome is inferred here.

## Finding XR-CI-DOM-01 — test launchers bypass Playwright-managed browser resolution

At line 17 of both [`frontend/dom/renderer.test.mjs`](../../../../../compiled-frontend/frontend/dom/renderer.test.mjs) and [`frontend/react/renderer.browser.test.mjs`](../../../../../compiled-frontend/frontend/react/renderer.browser.test.mjs), the test setup always passes an executable path. With `CHROMIUM_PATH` unset, that path is `/tmp/chromium`. The workflow installs Chromium through `interaction/node_modules/.bin/playwright install --with-deps chromium`, and its compiled frontend step does not configure `CHROMIUM_PATH`. Playwright uses its managed browser when the caller does not force an explicit executable path; the shared `chromiumLaunchOptions(process.env.CHROMIUM_PATH)` helper provides that behavior. E-CI-DOM's local commands explicitly set `CHROMIUM_PATH=/tmp/chromium`, so their passing results do not resolve the managed-runner portability gap.

## Finding XR-CI-DOM-02 — receipt scope retains stale undated packet paths

The dated E-CI-DOM receipt's `source_scope` still lists `compiled-backends/coordination/reports/E-CI-DOM.md` and `compiled-backends/coordination/receipts/E-CI-DOM.json`. Those paths are absent in this worktree. The author's [`location-correction.md`](../../lanes/dom/location-correction.md) records that the dated report and receipt were relocated byte-for-byte and pins their current hashes; I independently confirmed those hashes match. This is a receipt-path metadata issue, not a change to the consumed E-CI-DOM text. The repair packet should record canonical dated packet paths and the historical path correction without rewriting the E-CI-DOM bytes.

## Verified evidence

- E-CI-DOM's source hashes for all seven renderer/validator files and the hashes of its two local test logs match the current files.
- The preserved DOM focused log records **4 passed, 0 failed**; the React focused log records **26 passed, 0 failed**. The E-CI-DOM receipt shows both commands explicitly set `CHROMIUM_PATH=/tmp/chromium`.
- The shared helper conditionally includes `executablePath` only for a truthy explicit path.
- The workflow installs managed Chromium and sets only the inherited gate skip variables for `run-compiled-backends.sh`; no `/tmp/chromium` provisioning or `CHROMIUM_PATH` override appears in the workflow.
- The dated report and receipt match the relocation note's SHA-256 values. Their relocation did not update the receipt's `source_scope` strings.

Supporting hashes and source observations are in [`audit.json`](../../lanes/reviews/xr-ci-dom/audit.json). The review did not run tests, modify production/test code, or claim any CI result.

## Limits

- This review confirms a concrete launcher portability gap from source and workflow configuration. It does not report an observed managed-CI launch error.
- The fresh full CI artifact audit and integrated four-app/five-fixture matrix remain pending.
- This review asks for the browser-launch repair and a corrected path account in the repair packet; it does not change the original E-CI-DOM evidence.
