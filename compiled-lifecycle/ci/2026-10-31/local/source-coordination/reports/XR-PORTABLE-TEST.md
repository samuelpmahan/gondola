# XR-PORTABLE-TEST independent review

**Decision: accepted for the bounded lifecycle test loader.** The repaired loader has no implicit build-cache search. It requires `GOBI_LIFECYCLE_APP_DIR`, resolves that exact path, verifies the generated AppIR package identity, and imports the compiled module and encoder from that directory. The pre-fix behavior and the repaired behavior both reproduced under independent tests.

## Source review

The current `compiled-lifecycle/runtime/runtime.test.mjs` hash is `a07ec74fe85995e7ac18fd0d03a789e3d722f3507b6a24b5d03f410bef58e59d`. The preserved pre-fix test snapshot at `coordination/reviews/r-portable-test/before/runtime.test.mjs` hashes to `71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29`. The production lifecycle runtime is unchanged at `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed`.

I confirmed the active loader reads only `process.env.GOBI_LIFECYCLE_APP_DIR`; it has no `readdir` scan or feasibility-cache path. It resolves the configured path, reads `app-ir.json`, requires package path `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`, then imports `gobi-compiled.mjs` and `encoder.mjs` from that same directory. The load errors identify the required variable/files. No relative or environment fallback is present.

The actual generated app directory was `/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/portability/attempt-00/react/output/apps/lifecycle-7e6575d90707`. Its AppIR and build manifest both identify the full package path above. The independently checked hashes are:

| Generated artifact | SHA-256 |
| --- | --- |
| Build record | `94e70c541f3bc0c478dc0a3191b5dbeca02bb864a1a588277594968a4616a93d` |
| Build manifest | `bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603` |
| AppIR | `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` |
| Compiled module | `172c04df5a13b6963f27647fdce075a3e4df9f8cf65f3b9c8ca77d029bac975f` |
| Encoder | `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` |

The fresh real CLI build record reports 67 outputs and zero diagnostics. `source-audit.json` records the package identity, matching manifest paths, generated file hashes, current/pre-fix source hashes, and no-fallback checks.

## Independent verification

Toolchain: Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`. The old-loader probe uses the exact preserved before-snapshot source and a review-only mirror. It injects the missing-env regression into a copy of that source and places a byte copy of the actual generated app at the old loader's relative feasibility-cache path. No product/test source was changed to run the probe.

| Check | Command | Result |
| --- | --- | --- |
| Old-loader missing-env regression | `env -u GOBI_LIFECYCLE_APP_DIR PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test --test-name-pattern='compiled lifecycle fixture loader requires an explicit app directory' compiled-lifecycle/coordination/reviews/xr-portable-test/legacy-probe/compiled-lifecycle/runtime/runtime.test.mjs` | Expected exit 1: `Missing expected rejection.` The old loader found the mirrored generated fixture without the env variable. Log: `coordination/reviews/xr-portable-test/legacy-probe/red-regression.log`. |
| Repaired missing-env regression | `env -u GOBI_LIFECYCLE_APP_DIR PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test --test-name-pattern='compiled lifecycle fixture loader requires an explicit app directory' compiled-lifecycle/runtime/runtime.test.mjs` | Exit 0; 1 passed, 0 failed. The loader reports the required env variable. Log: `coordination/reviews/xr-portable-test/green-missing-env.log`. |
| Full lifecycle suite with actual generated appDir | `GOBI_LIFECYCLE_APP_DIR=/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/portability/attempt-00/react/output/apps/lifecycle-7e6575d90707 PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/runtime/runtime.test.mjs` | Exit 0; 10 passed, 0 failed. Log: `coordination/reviews/xr-portable-test/fresh-app-full-suite.log`. |
| Isolated lifecycle suite | `GOBI_LIFECYCLE_APP_DIR=/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/portability/attempt-00/react/output/apps/lifecycle-7e6575d90707 PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/coordination/reviews/xr-portable-test/isolated/compiled-lifecycle/runtime/runtime.test.mjs` | Exit 0; 10 passed, 0 failed. Test/runtime source copies match the reviewed files; `isolated/compiled-lifecycle/builds/feasibility/final/react/output/apps` does not exist. Log: `coordination/reviews/xr-portable-test/isolated-full-suite.log`. |
| Source and generated-app audit | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/reviews/xr-portable-test/audit-portability.mjs` | Passed source hash, explicit env, package identity, generated-file, and isolated no-fallback assertions. Output: `coordination/reviews/xr-portable-test/source-audit.json`. |

The old-loader failure is the intentional red result; all repaired-source commands passed. Node printed the existing experimental `EnvHttpProxyAgent` warning.

Evidence hashes:

- Before-snapshot source: `71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29`
- Current source: `a07ec74fe85995e7ac18fd0d03a789e3d722f3507b6a24b5d03f410bef58e59d`
- Reviewer audit script: `48419d960f9ee9c560241b3eaaec46ce2efac35e3420a3f2ad730ba7ebdb084e`
- Reviewer audit result: `856dbea1ddf5fbeedcd5c454d5a5c7a24e92029c33a80969841f424462dac965`
- Old-loader red log: `0ff6c5920f113a9642b90f25b55a76fb2283ff247e6630a5be056f499e8fb156`
- Repaired missing-env log: `dfc6c0c2259b2eaa3fc69c0c07407c4d57ac537655d9acdce344a1b95f3b10d2`
- Fresh appDir full-suite log: `403e7372f9c899cf1010d79de27efc0a8722bb0d2123773b3149a1e6e16f4658`
- Isolated full-suite log: `299c6a41651ab684051ac362c618dea1146a8b649c8f1d9f6f032b513e38d020`

## Limits

This review accepts the test loader's explicit app-directory contract and no-cache behavior. Default full-runner wiring is a separate N5/N6 change and is not accepted here; the parent reported a missing call site under active repair. No product/test/docs/Git/state files were edited by this reviewer, and no merge, deployment, or publication was performed.
