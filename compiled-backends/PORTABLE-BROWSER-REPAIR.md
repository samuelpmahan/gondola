# Portable browser-test follow-up

The initial milestone at `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb` passed the recorded local runs with an explicit `/tmp/chromium` executable. A later source audit found that the two new focused DOM/React browser tests independently hardcoded that fallback when CHROMIUM_PATH was absent. The CI workflow instead installs Playwright-managed Chromium. This is a test portability defect; a configured local browser pass does not establish the managed-browser CI path.

The follow-up uses the existing `chromiumLaunchOptions` export in `compiled-frontend/conformance/browser.mjs`, exactly as the prior no-WASM guard tests do. An explicitly configured CHROMIUM_PATH is passed through; when absent, executablePath is omitted and Playwright selects its installed browser. Test assertions, renderer code, application Go sources, runtime, harness and DOM oracle remain unchanged.

The initial local archive, 26 source review packets and `DELIVERY.json` remain historical evidence for source832. Their stored hashes are not rewritten to imply current-source execution. The changed RESULTS heading identifies that history; `PORTABLE-BROWSER-REPAIR.json` pins the follow-up delta. Dated CI coordination retains the source finding, old attempted runs, repair author receipt, independent review, packet-location corrections and fresh repaired-head execution separately.

Fresh published-head CI is required for final managed-browser acceptance. Initial832 CI, whether pending or failed, cannot satisfy that gate. Source-specific run/checkout metadata, commands, versions, traces and final acceptance are linked from PR12 and the dated CI evidence branch after execution. No main merge or production deployment.
