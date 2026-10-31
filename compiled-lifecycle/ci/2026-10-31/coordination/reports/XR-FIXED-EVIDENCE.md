# XR-FIXED-EVIDENCE — independent hosted evidence review

**Decision: accepted** (`confirmed_reuse`) for E-FIXED-EVIDENCE. The packet is bound to source `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`, and the final primary artifact for run `41181505234`. This review checked the retained terminal records and artifact; it did not rerun suites, compile Go/WASM, replay a browser, download the duplicate typed-composition ZIP, or modify source, Git, provider, or extraction state.

## Author packet and source identity

The E-FIXED-EVIDENCE report hash is `a3ed36d30edb7ee4366a8ce5bfbb8648ab83fabb3d19bde0c8bdb051696dc1bb`; its receipt hash is `28dad302407fc7362c7316d60be9dfa8c431377910f098f1ea410f1965e08b2e`. The review script checked both before evaluating the packet.

The source commit capture binds head `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`, and parent `49cc2b96c8817a47319d5b7bd484184a22fa984b`. The fresh strict PR #14 snapshot is valid JSON, 24,023 bytes, SHA-256 `934976bbdbb5005222c03924dff19d2d1b92e610736b3405e8223d3e97ba156d`; it binds PR base `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, head `00da54ad0f5a4006b13a5cded18ce291845978bc`, and synthetic merge `527cd2970435b913a7054f6ad796abfadf2bb56a`. The captured merge has the ordered parents `[6b49cc0bd4c9512a041f723c86b632ec506afd9d, 00da54ad0f5a4006b13a5cded18ce291845978bc]` and the same tree as the source. The fresh PR snapshot records the PR as unmerged. The source checkout independently resolves to the same head/tree with no tracked or staged changes.

## Terminal workflow and log custody

The final raw workflow response is 360,002 bytes, SHA-256 `d6a4fa32f68d50445fb1e388a81f211cde795e47ea548028dfaeaa59f3955d71`. It contains 28 completed successful workflows: 14 `push` and 14 `pull_request`, all on the expected head/branch, with no failures, cancellations, or active runs. Each PR workflow record binds PR #14 to the expected head and base. The parsed summary is pinned at SHA-256 `f416b9c448958743c6e489b2ca3afa535292096ed90ebad61f50787e7db2c6ed`; the final PR job snapshot is pinned at `cbddcf4de9c9778ffe244a908d14043975a09acc36ba62c46367299006517c1d`.

The byte-hash index is `compiled-lifecycle/ci/2026-10-31/fixed/lanes/evidence/logs/job-log-index-final.json`, SHA-256 `ffc463b2f0b1d7592627d838fbe7a6b7c81c87090b5e67915798368adac48d65`. I verified all 15 referenced log files against indexed byte counts and raw SHA-256, confirmed each starts with a UTF-8 BOM and strictly decodes as UTF-8, and matched each run ID in the text. All 14 PR job IDs match their final job records. The primary push job ID `124479683598` matches its captured job inventory; its final terminal success is established by the final workflow snapshot. The job ID is not asserted to appear inside that log's bytes.

## Primary artifact and lifecycle results

The provider artifact is ID `13035044166` from successful run `41181505234`. The original ZIP is 47,072,021 bytes, SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`, with 1,270 members and 413,394,195 uncompressed bytes. The separate XR-FIXED-GO review is pinned to the same ZIP and records CRC success and verification of all 1,270 extracted member hashes; its review audit SHA is `9de44746246e52c6ab4b0d543c1fce1f6ab650dc4f402bee45122b4a7270af1e`.

The primary E-BUILD attempt is `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z`: full mode, passed, 18/18 commands exit zero, all 13 stages passed, and 123 source pins identical before and after. Its recorded environment includes Node `v22.23.4`, npm `10.9.9`, root Go `1.24.13`, compiled Go `1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2`. The inherited compiled-methods child passed its 17-command run; inherited compiled-frontend records 131 stable pins.

The lifecycle matrix and checker both report `matched`: 26 events/ticks, 16 clicks, 17 renderer swaps, seven requests, three child-first cancellations (`grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`), and eight detected mutation controls. Native/direct/browser traces and React/DOM/swap literal-oracle profiles are recorded as checked, including physical DOM. The raw native, direct, browser, capture, and check files are individually pinned in the review audit and found in the authoritative ZIP. The managed HTTP demo passed 12 checks across 24 ticks and four swaps; `/`, `/demo.css`, and `/demo.bundle.mjs` each returned HTTP 200, with zero browser errors, console errors, failed requests, or WASM requests.

## Inherited suites and M0

The hosted inherited log is pinned by the review audit at SHA-256 `5d2e8dd9b96e8c82c9052c3d991f456376699c1373de13cfb9e397404de4387d`. It records `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok` for M0 with seed `20261030`. The source-pinned command is `go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json`. The unchanged source hashes are: `run.sh` `e2b3fe3101d50e509daae6d0feb630b7becbd01b286bef63cc53493f9e62f2f6`, `EXPECTED.json` `639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2`, `SHA256SUMS` `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`, and `gobi/rules_test.go` `dd1b8445ef29a3f2e507acca7a4e64c27fe8d4bb7ce446cc22a54e373b11d57a`. The Go file has 59 compatibility table rows; these are rows, not a test count. This review read the hosted log and pinned source; it did not rerun M0.

The inherited log also records these parity results: interaction 107 scripts / 4,473 ticks; backend replacement 103 / 5,249; controlled input 216 / 10,149 observations; async effects 76 / 1,552; HTTP effects 82 / 1,572; keyed collection 70 / 1,113; renderer contract 71 / 1,184; and multi-root 63 scripts / 1,896 actions / 1,959 ticks / 11,754 actor observations. The retained seeded traces include both `20261030` and `20261031` where applicable. Four Node suites are reported independently—lifecycle pre-build 71/71, lifecycle runtime 10/10, inherited frontend 99/99, compiled-methods owned 10/10—because they may overlap; no grand total is inferred.

## Exclusions and limits

The malformed early workflow snapshot remains unchanged and is excluded: 359,954 bytes, SHA-256 `3611879716d0d6dd04dceccddbf23482921739efb536933a61be20106fbd6ca0`, JSON error at character 7000. The ancillary `lineage/pull-14.json` is also preserved and excluded: 21,260 bytes, SHA-256 `56f7b1838c9d632174bd6172557a462510eb5020b0a473268a3c545a36fad9fd`, invalid control character at character 7000. The strict PR snapshot, source/merge captures, and all final PR workflow records independently corroborate its identity fields.

The extraction-only `.lifecycle.browser.json.yXKBO2` file is 48,496,640 bytes, SHA-256 `4888479ee2bcf9d514698b27677d027799b4cdbca02d9fbee8fda39d209120a2`; it is not a ZIP member, is an exact prefix of the authoritative browser trace, and its origin is not established. It was excluded from proof and not modified. The primary ZIP does not retain every older Go/WASM workflow raw directory; those older workflow outcomes are supported by final terminal API records and indexed logs where retained. Typed-composition PR artifact metadata is present, but its 120,564,491-byte ZIP was not downloaded. No PR merge or deployment is claimed.

## Review execution

The read-only audit command was `python3 compiled-lifecycle/ci/2026-10-31/fixed/reviews/evidence/audit_fixed_evidence.py` (Python 3.12.14). It exited 0 and emitted `status: verified`; stderr was empty. The output audit is `compiled-lifecycle/ci/2026-10-31/fixed/reviews/evidence/audit.json`, SHA-256 `6c7e0baf17e6540cfa36851b29aad7a561504dad11f3a5da1ec9959fc873603b`; the audit script is SHA-256 `d4190e528827ea78997b0fb962181dc924b6cd9c61d06a7f614dbc4b357bd4fd`. Output logs and exit code are retained in the same directory.

This acceptance covers only the 28 listed terminal workflows and the exact successful primary artifact bound above. It is not evidence of merge, deployment, broader historical artifact retention, or any run outside this source and provider snapshot.
