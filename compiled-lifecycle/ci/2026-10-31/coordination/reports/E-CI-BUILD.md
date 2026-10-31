# E-CI-BUILD — primary hosted artifact audit

**Outcome: mixed.** The current-primary artifact contains valid, source-pinned React and DOM GoScript builds and a passing fresh-app runtime suite. The full hosted lifecycle run is **failed**, so this is not full CI acceptance.

## Provider artifact and source identity

The retained primary push artifact is ID `13034915662` for run `41178420647`, head `49cc2b96c8817a47319d5b7bd484184a22fa984b`, tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. Provider metadata records conclusion `failure`. The original ZIP at `/tmp/gobi-compiled-lifecycle-41178420647.zip` is 47,035,803 bytes, SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`.

I verified the retained 12 chunks reassemble byte-for-byte to that ZIP, then checked all 1,272 ZIP file entries against the retained hash/CRC inventory and the extracted tree. All 412,381,547 uncompressed bytes matched; there were no duplicate or unsafe paths. The extraction is `compiled-lifecycle/ci/2026-10-31/extracted/`.

The uploaded lifecycle execution records 122 unchanged source pins. Every pin matches both the current worktree and commit `49cc`; the current tree is the expected `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. The uploaded E-BUILD receipt is byte-identical to the attempt's `execution.json`, and its report hash matches the retained report.

## React and DOM GoScript builds

The full command was `bash run-compiled-lifecycle.sh`. It ran 18 commands between `2026-10-31T06:54:20.569Z` and `2026-10-31T07:18:50.268Z`. Tool versions recorded by the runner are Node `v22.23.4`, npm `10.9.9`, root Go `1.24.13`, compiled Go `1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, and Chromium `156.0.8078.4`.

Both profiles ran `go run ./cmd/gobi-build` with `GOFLAGS=-buildvcs=false` and `GOTOOLCHAIN=go1.27.3`. Each BuildResult is `ok: true`, has one app, 67 outputs, and zero diagnostics. I matched the BuildResult output records, the separately retained build records, and every extracted output file by path, byte count, and SHA-256.

| Output | React | DOM |
|---|---|---|
| BuildResult SHA-256 | `cab680832f851676fe0e7e39c692b591fe8fd40e6f64d3a6e07643b8f90df945` | `432c4657b719fe08ea486ba43882c1c55e1b666cdfaa90ee3242ef0c289e1d6e` |
| Build manifest SHA-256 | `bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603` | `220ce759d04093c95185088a91ae8a6556be44a3aeebb6f327dc7281a473e4e4` |
| AppIR SHA-256 | `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` | same |
| Encoder SHA-256 | `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` | same |
| Raw GoScript module SHA-256 | `23c9e2d09877eba8ace78cdf352596860463bdc3857961c5ba3274b146b5cb0e` | `04ca83c08229035dd856ea94abcd7603ec1d333eca0e2aa9f6e64f4f2f86f1fb` |

Both manifests bind the full component/package ID `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle` and generated Init/Update/View roles. AppIR declares `effect.request-reply`; Update's result signature includes `[]github.com/samuelpmahan/gondola/gobi.Effect`. Both generated encoders describe that Go slice as `array-or-goscript-slice`, with the Effect struct fields `Kind`, `Name`, `Arg`, and `Reply`. The compiled modules register the same `gobi.Effect` type. React and DOM AppIR/encoder bytes and all 65 non-manifest, non-module outputs are identical; the raw modules are pinned separately and no bundle equality is claimed.

The 67 output pins per backend are identical before and after the matrix/demo stages. Source pins also stayed stable. The compiled lifecycle runtime command ran after both fresh builds with `GOBI_LIFECYCLE_APP_DIR=/home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/react/output/apps/lifecycle-7e6575d90707`; Node's TAP log reports 10 passed, zero failed. Its stdout SHA-256 is `423cb059cc96073a10f6d57271c0c8b6c07af7bbf11631cbe7ce3f2e7c8173ca`.

## Failure boundary

The lifecycle conformance command failed while resolving its native replay executable. The runner passed `--native-go go`; the conformance driver resolved that value to `/home/runner/work/gondola/gondola/go`, which does not exist (`spawnSync .../go ENOENT`). The direct-module and browser-profile stages completed and their traces are retained, but the final oracle check was withheld; there is no `lifecycle.check.json` and no accepted native/direct/browser equivalence result. The E-BUILD execution therefore remains `full` / `failed`, despite the successful compiler and runtime-test subchecks.

After that failure, the HTTP demo smoke still passed: `/`, `/demo.css`, and `/demo.bundle.mjs` returned HTTP 200, with no browser, console, request, or WASM errors. Screenshot SHA-256: `d1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648`.

The attempt's inner lifecycle archive SHA-256 is `eb9c9678f224be7cedb2e95be845343320bf8fdf319481c6a6d568a8136a944d`; I independently matched all 241 regular-file members and 158,843,470 uncompressed bytes to its manifest. This validates artifact custody, not the withheld conformance result.

The exact command records, versions, hashes, ZIP/member checks, and structured limitations are retained in `lanes/build/audit.json`; `lanes/build/audit_primary_artifact.py` reproduces the read-only checks. This report does not accept the failed hosted run as full CI success and does not assert a repaired rerun.
