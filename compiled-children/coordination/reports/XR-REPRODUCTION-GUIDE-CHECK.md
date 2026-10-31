# XR-REPRODUCTION-GUIDE-CHECK (N3)

**Decision: accepted.** N5's reproduction and restore-path facts match the frozen source 462 and the preserved 978 evidence. The review does not establish current full acceptance.

## Review findings

- The pinned source commit recorded in E-REPRODUCTION-GUIDE-CHECK is `462a9827bfe1980600456b00d0a67843eaa9756d`. All five source file pins in N5's receipt match the corresponding frozen source files, including the source-pinned README, full runner, wrapper, capability runner, and seeded generator.
- The README's dependency setup and `bash run-compiled-children.sh` command agree with the wrapper and full runner. The wrapper checks Go 1.24 and Node 22; the full runner uses Go 1.24 with `GOTOOLCHAIN=local` for native execution and Go 1.27.3 with `GOTOOLCHAIN=go1.27.3` for the compiler. The three lockfiles contain React/ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2 where applicable.
- The runner makes a fresh native oracle capture at `attempt/oracle/native.json`, records its Go invocation and environment, and includes the trace in the attempt's archived inputs. The three seeded schedules all run native and direct React/DOM replay; only seed 20261031 (the first seed) receives the mounted browser swap replay. The fixed browser pass separately covers React, DOM, and swap profiles.
- The actual 978 archive is 16,625,595 bytes, SHA-256 `a11817d20da1a167a016dba08cedd4ea2baf2aa75232d8fe0110e9193fde5c9f`. Its external manifest is 44,510 bytes, SHA-256 `ddecfc97e4f2cf21684a6d0148333883e4a155a3ebd31e0fe7fda21dc7fb1738`. A read-only tar listing matched all 239 manifest paths. The archive has several top-level roots; the five site members are under `demo/site/`. Extracting to `restore_root` therefore yields `restore_root/demo/site`, matching N5's Python HTTP server root. The supplied archive verifier accepts the recorded archive and manifest hashes before extraction.
- Historical source 978 E-DELIVERY is failed. The inherited startup test reports five passing tests where its old gate required exactly three; the inherited receipt also records the chain as failed. The HTTP smoke evidence reports 32 checks with no failures, and the independent archive consumer reports all 239 members verified. Those successes do not change the failed full-run status.
- The README distinguishes historical evidence from exact-source acceptance and directs readers to match the published evidence source commit to their checkout. N5 correctly treats the 978 archive as layout evidence only and points any final demo/archive instructions to the root-owned acceptance receipt and dedicated E-ACCEPTANCE packet from the designated third worktree. The current source-462 attempt was active at assignment; it was not inspected, so its final status remains outside this review.

## Evidence and limits

The source and evidence hashes, lockfile versions, route checks, archive member comparison, and historical status fields are recorded in `coordination/rawlogs/XR-REPRODUCTION-GUIDE-CHECK-audit.json`. Commands and the review boundary are in `coordination/rawlogs/XR-REPRODUCTION-GUIDE-CHECK-review.log`.

No tests, npm installation, Go execution, full pipeline, Git operation, native state write, archive extraction, or source/document edit was performed. The only review-script error was a preliminary parser treating manifest entry objects as strings; it failed before recording results and was corrected to compare each entry's `path`. The corrected audit matched the full 239-member manifest.
