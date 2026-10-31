# E-DELIVERY: compiled keyed child collection delivery

**Outcome: `mixed_change`. Status: `insufficient_evidence`.** The GoScript-backed HTTP demo, full-only delivery runner, CI workflow, documentation, and immutable attempt/archive checks are implemented. Local author validation passed for the demo. The root-owned source-bound acceptance run is pending, so this report does not claim integrated acceptance.

## Toolchain and dependencies

- Node `v22.23.4`; root Go `go1.24.0 linux/amd64`; compiler Go `go1.27.3 linux/amd64`; Chromium `153.0.8010.0`.
- React and ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`.
- Locked dependency installation commands: `npm ci --no-audit --no-fund`; `npm ci --prefix interaction --no-audit --no-fund`; `npm ci --prefix compiled-frontend --no-audit --no-fund`. All three lockfiles were verified unchanged.
- Lockfile SHA-256: root `package-lock.json` `e35def24ea8e20847d1ea58a59bc3b233b6c0d1d9fa697e44e735812617ef53b`; `interaction/package-lock.json` `b1dc4681b030322933246c2b4622a4cbb9ebcb8ac7f69f0f4021459c9d603ed0`; `compiled-frontend/package-lock.json` `245318fce8e9760b07f8c465240d85b1449d4b75110c510aa5f362be3c600079`.

## Author HTTP demo run

The demo was built from N2's existing complete React GoScript output at `compiled-children/compiler-evidence/build/react-repeat`. Its 27,651-byte BuildResult has SHA-256 `5953b0f6f49bbc9249bc674de57f8faf4efb2547667a195125bdaad7814ad6d8`; the manifest hash is `2266dbb1d21072e0d829fb6695615471b30ba37b75fb4e93aac5d9412b59797c`. All 67 listed output size/hash entries matched before and after the smoke. N1 source pins remained stable: `app.go` `d265bbac54017ab366bdf86aa646fdad808f464c5d35cd106259c6943fc32c99`, `view.go` `6d0ecf88dfc521ed197213e8922ec12f553505a37f88f5e8e63a1ec8cfda8185`.

Exact commands:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node compiled-children/demo/build.mjs --compiled compiled-children/compiler-evidence/build/react-repeat --output compiled-children/demo/output/author-smoke-20261031-rerun1/site --backend react
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_PATH=/tmp/chromium node compiled-children/demo/smoke.mjs --demo compiled-children/demo/output/author-smoke-20261031-rerun1/site --output compiled-children/demo/output/author-smoke-20261031-rerun1/smoke.json --screenshot compiled-children/demo/output/author-smoke-20261031-rerun1/screenshot.png --chromium /tmp/chromium --port 0
```

The build passed with a 1,853,920-byte bundle, SHA-256 `c2d5723c7c15a3bba3a59687a4f610682fe5d8cb387ed465118df79471a84ac9`. Chromium 153.0.8010.0 served the app on ephemeral port 40899. The smoke passed **31/31** checks, including initial Go state and view, parent/child requests and disabled controls, counter update, reorder with pending work, compatible React/DOM swaps, rejected incompatible swap with state preservation and recovery, child cancellation and key reuse with a fresh generation, stale reply rejection, child-first clear, parent reply/removal/remount, and zero browser/console/failed-request/WebAssembly activity. The three endpoints `/`, `/demo.css`, and `/demo.bundle.mjs` returned HTTP 200.

Smoke JSON SHA-256 is `6d5170a5fccbdd8210218fcc3b366f36b84ccdbd16c37348b5e2fcf25385f3cd`; screenshot SHA-256 is `c9ee6fd06a30f5a353d9e1d46aeceda40149e3148040bffe4bc6bd1e0b8614b9`; demo build record SHA-256 is `d3d0cb74be56cb06e035b65f410df47d0654e5aa7b501c84e39a637224428d0e`.

An earlier local smoke attempt failed its `go-init-state` assertion (`false !== true`) because the canonical runtime snapshot stores typed `AppValue` fields rather than direct Go struct properties. The smoke was corrected to decode those fields and the fresh rerun above passed. The failed JSON remains at `compiled-children/demo/output/author-smoke-20261031/smoke.json`, SHA-256 `593d4676bbb2beeb146e5f2a9cbacc549641dabd8e444100c668632ae80d984e`. It recorded HTTP 200 for all three endpoints and no browser, console, failed-request, or WebAssembly errors.

## Runner and delivery boundaries

`run-compiled-children.sh` accepts full mode only. `compiled-children/run.mjs` starts a fresh full `run-compiled-capabilities.sh` chain, then runs new host/conformance tests, fresh React and DOM GoScript CLI builds, the N5 literal oracle, N4 native/direct/React/DOM seeded harness, and HTTP smoke. It records nonzero failures and mismatches, source and build pins, tool/dependency versions, logs, and unique attempt outputs. CI installs only the existing locked dependencies and Playwright Chromium. In CI, the runner resolves Chromium through the installed Playwright package when no explicit executable path is supplied.

The runner writes a read-only pre-archive snapshot, an external member manifest, and a tar archive, then verifies the tar round trip and invokes a separate archive consumer that checks archive/manifest bytes and extracts and hashes every member. It rechecks archive, manifest, and source pins at post-command boundaries. A failed stage produces a failed receipt and nonzero exit.

Static author checks passed: Node `--check` for the five owned JavaScript entry points, `bash -n run-compiled-children.sh`, `git diff --check`, and a Playwright executable-path resolution probe. Node emits an environment `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning; the checks exit successfully.

## Pending acceptance and limitations

The full source-bound runner has not been started. Its inherited full regression, new host/checker/seeded tests, fresh React and DOM outputs, native/direct/browser parity, literal oracle, integrated HTTP smoke, and complete delivery archive remain unverified here. The author smoke above used N2's peer build and is not a substitute for those gates. The new full runner is responsible for preserving exact stage failures, seeds, mismatches, logs, and post-command hashes.

The prior local-container archive corruption remains excluded from acceptance and was not rewritten or reconstructed. The earlier accepted evidence identifier is `978eaea98831154f8152baa1a64f1d1356916596`. No Git commit, merge, deployment, or scheduler edit was performed by this worker.
