# R-CI-BUILD-FINAL (N4)

**Outcome: mixed_change.** The fresh completed full workflow on repaired head `195c9433179218348d4b9f2477ae1e0725337d15` confirms that the real Go CLI builds both React and DOM profiles. Each output tree contains four apps and 209 files. The 204 backend-neutral companion files match byte-for-byte; each profile has its own backend-tagged manifest and raw compiled-module hashes, which are recorded separately without a normalized-bundle equality claim.

## Primary CI artifact

- Workflow run `41155530877` / job `124401386239` completed successfully on event `push` for exact source head `195c9433179218348d4b9f2477ae1e0725337d15` (tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`, direct parent `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`).
- Provider artifact `13025112465`: **14931201 bytes**, digest `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. The digest and byte count are cross-checked from provider metadata and primary provenance; the raw ZIP is not separately retained for local rehashing.
- The extraction has **817 files**; every extracted path, byte count, and SHA-256 matches the retained index.
- This acceptance uses the first successful complete full push run on exact head `195c9433179218348d4b9f2477ae1e0725337d15`. The separate PR run `41155534356` remains a distinct gate; its status is not inferred here.

## Actual CLI output trees

The archived `compile-react` and `compile-dom` commands each ran `go run ./cmd/gobi-build` with a distinct request whose `backend` field selects the profile. Both command exits are zero; each result manifest and output inventory was checked against the actual extracted files, including every byte count and SHA-256.

| Profile | Apps | Output files | Manifest SHA-256 | Manifest bytes | Backend tags |
|---|---:|---:|---|---:|---|
| react | 4 | 209 | `a2fa18abeab82a9d752ed3ecdf2c2734593eb0a292718a6b7e533e13701dbc5c` | 14837 | react |
| dom | 4 | 209 | `5174d864a318fd7c7356d2158dc725ee2088d76aadc8c4f60c78ecb9447a9f11` | 14829 | dom |

Both manifests contain the same four package paths, AppIR/module/encoder role paths, five forwarder source entries, and 186 emitted TypeScript paths. Replacing only each manifest app's `backend` value with a common placeholder makes the manifest objects equal. The actual `BuildResult.apps` AppIR objects and all output paths are equal between builds.

The exact companion comparison excludes only `buildmanifest.json` and the four raw `gobi-compiled.mjs` files. The remaining **204** paths match byte-for-byte. This includes all four `app-ir.json` files, four `encoder.mjs` files, four `components.gen.mjs` files, forwarder sources/module file, `react-map.gen.mjs`, and 186 TypeScript outputs. Full computed file records for both output trees are in [`artifact-audit.json`](../../lanes/build/final/artifact-audit.json).

### Raw compiled-module hashes

Raw bundles are kept separate. No bundle normalization or byte-equality claim is made.

| App | Profile | Bytes | SHA-256 |
|---|---|---:|---|
| counter | react | 495289 | `c9f5a253fe0cb76edd858871348c65f3c70d8038b31f71c6d0612b56c5f051e5` |
| counter | dom | 495289 | `6bf80c1e10457a344bfed808f8cf71d999fe7a2ccd4f0bd2d70be9212600d1fb` |
| effect | react | 1220155 | `8715556421cf7cb77bf9a18947a1704c4f8f8ce01a894f558226a84ed7c6e16a` |
| effect | dom | 1220155 | `44c3ed0253ced8432343d2fdea76e1fe7d8b0be941c92732a5e58c162ad03dba` |
| form | react | 1220371 | `e306e070725eea65db54a0c01b91472df5376ed3daa9d4d80902d3225b50241c` |
| form | dom | 1220371 | `4d7ac8953d70278095bffe5885fd12432c8eb29f7464919737b5dc36dfc3cbec` |
| list | react | 1224187 | `925ca58e637d904997e8e2f52482ec4f17665af7ac4449c17c98cac142207965` |
| list | dom | 1224187 | `9be092c60cb03889025f22e34c2e47c1fdbb8f43fc9ae7d52f13d1a464c28e55` |

## Toolchains and Go gates

- Root contract/compiler-compatibility toolchain: `go version go1.24.13 linux/amd64`.
- Compiled-frontend GoScript/compiler toolchain: `go version go1.27.3 linux/amd64` with `GOTOOLCHAIN=go1.27.3`.
- GoScript module pin: `github.com/s4wave/goscript v0.6.2`; the `compiled-frontend/go.mod` and `go.sum` records, hashes, and checksum line are in the artifact audit.
- Node: `v22.23.4`; Playwright `1.64.1`; esbuild `0.28.2`.

| Go scope | Result | Command | Stdout SHA-256 | Stderr SHA-256 |
|---|---|---|---|---|
| Root Go 1.24 contract/tests | exit 0 | `GOTOOLCHAIN=local go test ./compilercontract ./fixtures/compiled/... ./cmd/compiled-native` | `663848b4cc0bba7c2aa376f0bb11cf2185f02d027d87e1373ac5f7a03902f663` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Root Go 1.24 race | exit 0 | `GOTOOLCHAIN=local go test -race ./compilercontract ./fixtures/compiled/... ./cmd/compiled-native` | `47d842194e63e2c409b8d91a927dd17dd9502baa81cf7a657d06f2c61723979f` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Root Go 1.24 vet | exit 0 | `GOTOOLCHAIN=local go vet ./compilercontract ./fixtures/compiled/... ./cmd/compiled-native` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Compiled frontend Go 1.27.3 tests | exit 0 | `GOTOOLCHAIN=go1.27.3 go test ./analyze ./build ./cmd/... ./emit` | `3049d2b7f68ae7f73adac6b3314757352c99b6682ec268bf1272d7fb0d0f5cea` | `46360a04d0812ee0127aa3e9c53ea8153f6172469d08621cc3af4f2286fafcf9` |
| Compiled frontend Go 1.27.3 race | exit 0 | `GOTOOLCHAIN=go1.27.3 go test -race ./analyze ./build ./cmd/... ./emit` | `b0f80f487227debd5afe6cd3224a19059facfc2f2796d8360e1dc3e1da5f1e82` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Compiled frontend Go 1.27.3 vet | exit 0 | `GOTOOLCHAIN=go1.27.3 go vet ./analyze ./build ./cmd/... ./emit` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The command logs' actual bytes hash to the values recorded by `execution.json`; test and race logs contain successful package results, and both vet commands exit zero. Root checks cover `./compilercontract ./fixtures/compiled/... ./cmd/compiled-native`; the compiled-frontend tests cover `./analyze ./build ./cmd/... ./emit`.

## Source pins and preserved interim correction

The CI execution pins **122** compiled-frontend inputs before and after the full run with zero mismatches. The backend runner pins **126** source files before and after; the E-DEMO receipt reports `sourcePinsMatch: true`, and every recorded source pin matches the current exact-head source tree. The nine build/emitter source hashes are computed from current files and recorded in `artifact-audit.json`. The runtime source pin is `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4` (45645 bytes).

The earlier interim packet remains preserved byte-for-byte at `compiled-backends/ci/2026-10-31/coordination/reports/E-CI-BUILD.md` (SHA-256 `7aede8f251b37c74382050c375f1c7921f5bb413137a90e1528a0112555a53b0`) and `compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-BUILD.json` (SHA-256 `d5c484d48b123508e39c373553cbad37b56efe0c41965199adb04d47b270d59f`). Their byte-identical history copies are also recorded in the audit. The interim Markdown's `emit/backend.go` pin and the actual file hash are `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed`. The consumed interim JSON receipt mistyped that value as `b2486fff69d106a4801e5a5400c9611d05fb27792e775bd2cd57ab17a5c79309`. This final packet records the corrected hash from the actual file, `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed`, without changing the old receipt bytes.

## Scope and limits

- The primary push artifact establishes the repaired-head build and Go gates for this lane. The separate PR run and overall PR-ready condition remain root-owned and are not inferred.
- No claim is made that the four raw compiled-module bundles are byte-identical or normalized-equivalent. Their raw hashes are preserved above and in the audit JSON.
- No physical prior-output preservation claim is inferred from `PreservedPreviousOutput`; the successful fresh builds' result field is recorded as emitted.
- Provider artifact ZIP digest/length come from the provider artifact record cross-checked against primary provenance; the archive is not available locally for independent rehash. The 817 extracted files are independently validated against the retained content index.

## Evidence files

- Computed audit: [`artifact-audit.json`](../../lanes/build/final/artifact-audit.json)
- Programmatic verifier: [`audit_primary_artifact.py`](../../lanes/build/final/audit_primary_artifact.py)
- Source preflight: [`source-preflight.md`](../../lanes/build/final/source-preflight.md)
