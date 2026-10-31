# E-CI-DEMO

**Interim outcome: insufficient_evidence.** The published source and CI path were reviewed. The immutable fresh CI run evidence has not been supplied yet, so this is not an acceptance result.

## Source audit

- Reviewed commit: `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`.
- Workflow invokes `bash run-compiled-backends.sh` without `--backends-only`, after setting Go 1.24.x and Node 22, installing the three locked npm dependency sets, and installing Playwright-managed Chromium.
- The default runner calls `bash run-compiled-frontend.sh` before backend-specific checks. Its no-argument path runs the typed-composition gate and then the compiled-frontend runner.
- `run-compiled-backends.sh` selects `/tmp/chromium` only when `CHROMIUM_PATH` is unset and that executable exists. Otherwise the smoke's Playwright launch omits `executablePath`, allowing Playwright to select its managed browser. Which executable the CI run actually used is pending the fresh receipt and logs.
- The demo build checks each app's backend tag in the selected build manifest, imports the actual emitted `gobiCompiled` module and encoder, and bundles the demo. The HTTP smoke verifies state, supported focus/selection, retired callback fencing, pending manual effect completion, and no WASM. The effect host is in-memory.

## Pending fresh-run evidence

The final outcome depends on immutable artifacts from the new full CI run. I will verify the top-level command and default mode, uninterrupted inherited runner status, command and log digests, browser executable/version, HTTP smoke results, and source/output pins before and after execution. Build-output comparisons will account for different base directories by normalizing only the recorded root prefixes, then comparing the remaining relative paths and hashes.

The source file and lockfile SHA-256 pins reviewed for this report are recorded in `receipts/E-CI-DEMO.json`.
