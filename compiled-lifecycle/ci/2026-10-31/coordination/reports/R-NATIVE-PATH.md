# R-NATIVE-PATH: portable Go executable resolution

**Outcome: mixed_change.** The conformance runner now preserves bare Go command names for `PATH` lookup and resolves explicit relative executable paths from the invoking process directory before it launches the child with the repository root as its working directory. `GOBI_GO_BIN` remains the configurable default; when unset, the portable fallback is `go`.

## Reproduction and change

The pre-fix reproduction ran `compiled-lifecycle/conformance/run.mjs --native-go go` with `GOBI_GO_BIN` unset and Go 1.24.0 available through `PATH`. The runner rewrote `go` to `/workspace/scratch/39a56936f173/gondola/go`; native replay failed at `spawnSync ... ENOENT`. The actual command, environment, failure, output pins, and stage results are retained in `compiled-lifecycle/ci/2026-10-31/lanes/repair-native-path/red/reproduction.json` and the adjacent raw logs. Direct-module and browser stages completed, but the cross-runtime checker was withheld.

The fix is limited to `compiled-lifecycle/conformance/run.mjs`: `resolveNativeExecutable` leaves bare names intact for `spawnSync` PATH search and resolves explicit paths against the invoking CWD. The default fallback changed from a checkout-specific executable path to bare `go`; an explicit `GOBI_GO_BIN` still takes precedence. `compiled-lifecycle/conformance/native-path.test.mjs` exercises real child processes for the bare Go replay, absolute and relative paths, a relative executable launched from a different CWD while the child uses repository-root CWD, and configured/unset `GOBI_GO_BIN` behavior.

## Verification

- Targeted command: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:/usr/bin:/bin node --test compiled-lifecycle/conformance/native-path.test.mjs` — 4/4 passed. Output is retained in `compiled-lifecycle/ci/2026-10-31/lanes/repair-native-path/green/final-native-path.test.stdout.log`.
- Lifecycle-only command: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin CHROMIUM_PATH=/tmp/chromium GOBI_GO_EXECUTABLE=go GOBI_LIFECYCLE_REPORT_PATH=compiled-lifecycle/ci/2026-10-31/lanes/repair-native-path/green/final-run-report.md GOBI_LIFECYCLE_RECEIPT_PATH=compiled-lifecycle/ci/2026-10-31/lanes/repair-native-path/green/final-run-receipt.json bash run-compiled-lifecycle.sh --lifecycle-only` — exit 0, status `passed`, no recorded failures. Toolchain: Node v22.23.4, npm 11.9.0, root Go 1.24.0, compiler Go 1.27.3, Chromium 153.0.8010.0.
- All 13 lifecycle stages passed, including Go and compiler tests, auto-discovered Node tests, both GoScript backend builds, the native/direct/browser matrix, HTTP demo smoke, and output stability. Conformance matched the 26-step native/direct/browser oracle (17 renderer swaps, all eight mutation controls detected). The `go` native command completed with no stderr. Source pins matched before and after.
- The attempt archive round-trip verified: `compiled-lifecycle/builds/attempts/attempt-20261031T073203120Z/lifecycle-artifacts.tar.gz`, 719 members / 168,200,217 uncompressed bytes, SHA-256 `f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf`; manifest SHA-256 `27e0ade2164813d3fba831cc44f19b9f9bf56ef862ee68d8f6942dd0e7064c46`.

The final run receipt is `compiled-lifecycle/ci/2026-10-31/lanes/repair-native-path/green/final-run-receipt.json`. It records source hashes: `run.mjs` SHA-256 `751d04d6aa73662d63295bc09cc74875011700c096c2749ae5196e3e116d753f`; `native-path.test.mjs` SHA-256 `1b1519883e9e9d7dbe7a2b4814af2f674477b413cf01df015dc778c3dd4c5623`.

## Claim boundary

This closes the hosted bare-command spawn defect under the forced-PATH lifecycle-only replay. The earlier primary hosted CI artifact remains a failed run and is not rewritten as a pass; this local lifecycle-only run does not claim a new hosted CI result or execute the inherited compiled-methods regression chain.
