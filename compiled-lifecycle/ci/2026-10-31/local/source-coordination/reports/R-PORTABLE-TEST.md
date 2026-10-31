# R-PORTABLE-TEST

**Outcome: mixed change.** Updated only `compiled-lifecycle/runtime/runtime.test.mjs` so actual compiled-fixture tests require `GOBI_LIFECYCLE_APP_DIR`. The loader reads AppIR and imports the compiled module and encoder from that exact generated app directory. It no longer searches the ignored feasibility cache. Missing configuration, unreadable AppIR, wrong package identity, or missing generated modules now fail with an error naming the variable and required files.

## Change and regression

Before editing, the complete original runtime test file was retained at `coordination/reviews/r-portable-test/before/runtime.test.mjs`, SHA-256 `71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29`. The loader derived `../builds/feasibility/final/react/output/apps` from the test file location, scanned it, and silently depended on a cached build.

I added a regression test that temporarily unsets `GOBI_LIFECYCLE_APP_DIR` and requires the descriptive missing-variable error. Before changing the loader, that test failed with `Missing expected rejection` because the old fallback found the existing cached fixture. After the loader change the regression passes. Its environment is restored in `finally`, so a runner-supplied app directory remains available to subsequent tests.

The implementation resolves the supplied directory, reads `app-ir.json`, verifies the full package path `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`, and imports `gobi-compiled.mjs` and `encoder.mjs` from the same directory. No fallback is attempted. The exact env name and directory contract were coordinated with N6, whose runner supplies `GOBI_LIFECYCLE_APP_DIR` to this suite after the fresh React build.

## Fresh-build and no-preflight verification

N6's independent real CLI build at `compiled-lifecycle/builds/portability/attempt-00/react` exited 0, produced 67 outputs, and recorded `ok: true` with zero diagnostics. It used Go `1.27.3`; the build record SHA-256 is `94e70c541f3bc0c478dc0a3191b5dbeca02bb864a1a588277594968a4616a93d`. Its generated app directory is:

`/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/portability/attempt-00/react/output/apps/lifecycle-7e6575d90707`

With that path supplied explicitly, the complete lifecycle runtime suite passed **10/10**. I then copied the final test and unchanged lifecycle runtime into an isolated mirror at `coordination/reviews/r-portable-test/preflight-isolation/`, outside the application build tree. The mirror has no `compiled-lifecycle/builds/feasibility/final/react/output/apps` directory. The same 10/10 suite passed there using the fresh app directory solely through `GOBI_LIFECYCLE_APP_DIR`. This confirms the tests no longer rely on the local preflight cache.

## Verification

Toolchain: Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`; fresh CLI compiler Go `1.27.3`.

| Check | Command | Result |
| --- | --- | --- |
| Before-change regression (RED) | `/tmp/gondola-node22/node_modules/node/bin/node --test --test-name-pattern='compiled lifecycle fixture loader requires an explicit app directory' compiled-lifecycle/runtime/runtime.test.mjs` | Exit 1, 0 passed, 1 failed with `Missing expected rejection`; old loader found the cached app despite the missing env var. stdout/stderr/command/exit code retained in `coordination/reviews/r-portable-test/captures/red/`. |
| Missing-env regression (GREEN) | `/tmp/gondola-node22/node_modules/node/bin/node --test --test-name-pattern='compiled lifecycle fixture loader requires an explicit app directory' compiled-lifecycle/runtime/runtime.test.mjs` | Exit 0, 1 passed; the exact descriptive error is matched. Captured under `captures/green-missing-env/`. |
| Full lifecycle suite with fresh CLI app directory | `GOBI_LIFECYCLE_APP_DIR=<fresh appDir> /tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/runtime/runtime.test.mjs` | Exit 0, 10 passed, 0 failed. Captured under `captures/fresh-cli-app/`. |
| Isolated no-preflight lifecycle suite | `GOBI_LIFECYCLE_APP_DIR=<fresh appDir> /tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/coordination/reviews/r-portable-test/preflight-isolation/compiled-lifecycle/runtime/runtime.test.mjs` | Exit 0, 10 passed, 0 failed, with the old relative feasibility-cache path absent in the isolated mirror. Captured under `captures/isolated-fresh-cli/`. |

Node emits its existing experimental `EnvHttpProxyAgent` warning on stderr. All captured exit codes are recorded independently from the wrapper command.

## Source and artifact pins

| Artifact | SHA-256 |
| --- | --- |
| Pre-fix `compiled-lifecycle/runtime/runtime.test.mjs` snapshot | `71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29` |
| Final `compiled-lifecycle/runtime/runtime.test.mjs` | `a07ec74fe85995e7ac18fd0d03a789e3d722f3507b6a24b5d03f410bef58e59d` |
| `compiled-lifecycle/runtime/runtime.mjs` (unchanged) | `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed` |
| Fresh build manifest | `bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603` |
| Fresh AppIR | `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` |
| Fresh encoder | `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` |
| Fresh compiled module | `172c04df5a13b6963f27647fdce075a3e4df9f8cf65f3b9c8ca77d029bac975f` |

The complete before snapshot, generated appDir, output hashes, commands, stdout/stderr, and exit codes are retained under `coordination/reviews/r-portable-test/`. No production runtime, build output, Go, Git, or shared-state files were changed by this worker. No merge, deployment, or publication was performed.
