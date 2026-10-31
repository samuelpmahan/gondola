# E-FIXED-BUILD — successful hosted build artifact audit

**Decision: accepted** (`confirmed_reuse`) for the primary hosted lifecycle build artifact from run `41181505234`, artifact `13035044166`. This is a bounded acceptance of source `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`, and the preserved outputs below. It does not claim a new run, deployment, merge, or coverage of every inherited Go/WASM suite.

## Provider archive and source binding

The original provider ZIP `/tmp/gobi-compiled-lifecycle-41181505234.zip` is 47,072,021 bytes, SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`. Its 1,270-member inventory totals 413,394,195 uncompressed bytes. The independent audit recomputed the ZIP hash, checked all CRCs, matched every member size and SHA-256 to the retained provider inventory, and verified all provider members byte for byte in the extraction. The hosted workflow snapshot records the run completed successfully at the stated source.

There is one extraction-only file absent from the provider member inventory: `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/.lifecycle.browser.json.yXKBO2` (48,496,640 bytes, SHA-256 `4888479ee2bcf9d514698b27677d027799b4cdbca02d9fbee8fda39d209120a2`). It is recorded as unbound extraction content, not part of the original ZIP. The original ZIP and extraction were left unchanged.

The first retained workflow snapshot, `workflows-20261031074228T.json`, is invalid JSON: `Invalid control character at: line 1 column 7001 (char 7000)`; the offending bytes contain an unescaped newline after `"https:`. Its SHA-256 is `3611879716d0d6dd04dceccddbf23482921739efb536933a61be20106fbd6ca0`. Four later valid completed snapshots report success for the same 00da source; the latest used by the audit is `workflows-20261031T081127Z.json`.

The provider ZIP contains these compiled artifact trees: `compiled-frontend/` (309 files), `compiled-backends/` (508), `compiled-methods/` (193), and `compiled-lifecycle/` (260). It contains zero artifact paths for `session-tree` or `typed-composition`. A retained separate PR workflow log records the session-tree HTTP smoke and replay as passed/matched, typed-composition replay as matched with zero mismatches and 47/47 tests, and a separate `gobi-compiled-frontend-artifacts` upload path including both suite build directories. That log corroborates separate workflow evidence only; those artifact contents are not included in or audited through this primary ZIP. Therefore this report does not describe the ZIP as a complete archive of every inherited Go/WASM suite.

## Recorded workflow and toolchain

The uploaded full `E-BUILD` receipt is byte-identical to the attempt's `execution.json`. It reports 18 commands, 13 passed stages, no failures, and 123 source pins identical before and after execution. The raw primary workflow log confirms the full inherited runner command `bash run-compiled-methods.sh` exited successfully, then the lifecycle portion completed with the fresh builds and conformance checks. Source pin stability is verified against the current tree. The earlier failed 49cc native-path attempt is not reclassified by this audit.

Recorded versions were Node `v22.23.4`, npm `10.9.9`, root Go `go1.24.13 linux/amd64`, compiled Go `go1.27.3 linux/amd64`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, and browser Chromium `156.0.8078.4` for the managed demo. The package lock hashes are recorded in the audit JSON.

Key recorded commands and order:

1. `bash run-compiled-methods.sh` from repository root (17-command inherited run; passed).
2. Root Go package tests: `go test ./compilercontract ./gobi ./fixtures/compiled/lifecycle ./cmd/compiled-lifecycle-native`; compiled-frontend tests from that module: `go test ./analyze ./build ./cmd/... ./emit`; both passed.
3. Eight prebuild Node test files, including `compiled-lifecycle/conformance/native-path.test.mjs`, ran before the build and passed 71/71. The two fresh build commands were `go run ./cmd/gobi-build` from `compiled-frontend`, with `GOFLAGS=-buildvcs=false` and `GOTOOLCHAIN=go1.27.3`; React and DOM used separate recorded input hashes (`c9e48b80f1f78c211fd2ea23e97cb0cd1b093ffb9f8aa4869cf34eb81b8fb1dd` and `962f87543c564883598f1d9fbe19d44a305374c95a409448ef0ac3ddac2aa401`).
4. After those builds, `node --test compiled-lifecycle/runtime/runtime.test.mjs` ran with `GOBI_LIFECYCLE_APP_DIR` set to the fresh React app directory `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/react/output/apps/lifecycle-7e6575d90707`; 10/10 passed.
5. The conformance runner used `--native-go go`, invoking native `go run ./cmd/compiled-lifecycle-native --script fixtures/compiled/lifecycle/scenario.json` through PATH. It completed with empty native stderr. The full runner arguments and output paths are retained in `execution.json` and `lifecycle.run.json`.
6. The captured managed HTTP demo passed 12 checks over `/`, `/demo.css`, and `/demo.bundle.mjs` (all HTTP 200), with 4 renderer swaps, zero browser/console/request errors, and no WASM requests or API attempts.

## Fresh GoScript outputs and ABI

Both fresh GoScript profiles returned `ok:true`, zero diagnostics, 67 outputs, and complete matching output pins. Their AppIR and encoder bytes match each other; the raw React and DOM modules are separately hashed and are not byte-identical. The component ID is the full package path `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`, with `effect.request-reply` capability. AppIR `Update` returns lifecycle `State` plus `[]github.com/samuelpmahan/gondola/gobi.Effect`. The Effect slice TypeID is `slice`, element type is `gobi.Effect`, and its JS representation is `array-or-goscript-slice`; the generated encoder contains that typed metadata.

| Artifact | React | DOM |
| --- | --- | --- |
| Build manifest SHA-256 | `bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603` | `220ce759d04093c95185088a91ae8a6556be44a3aeebb6f327dc7281a473e4e4` |
| AppIR SHA-256 | `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` | same |
| Encoder SHA-256 | `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` | same |
| GoScript module bytes / SHA-256 | 521,163 / `70e1d1171ab71b84e906ef2819faed10902a1cc893afb568e99e077d0f10b260` | 521,191 / `dabb20e55c86b1821ee12254e10ca4a9a25ec4e12573ad27e6650024f9f69d9c` |

## Runtime, matrix, and archive custody

The source-pinned conformance records report `matched`: 26 ticks, 17 renderer swaps, eight detected mutation controls, and successful literal-oracle checks for native, direct, browser traces, and physical DOM. The fresh compiled-runtime test passed 10/10 after building both profiles. The demo smoke completed 12 HTTP checks and 4 renderer swaps with no WASM requests.

The full provider ZIP is distinct from the inner lifecycle archive. The latter is a 12,072,699-byte tarball, SHA-256 `152809097b8ce3e5d541646d667635117bd6936193e24775c33a5692a389ee04`, with a 45,283-byte manifest SHA-256 `71f078d044a6e90bf92c6636ab9ae9867349dbfbc5171e69ae37971292be089a`. All 240 members, totaling 159,309,482 uncompressed bytes, were compared against the manifest and materialized attempt files.

The inherited compiled-methods run reports full/passed with 17 commands. Its raw provider prefix has 193 files / 13,719,428 bytes. The attempt carries a distinct 53-file / 10,268,453-byte copy subset; every copied file matches its corresponding raw member, and those 53 are included in the 240-member inner lifecycle archive. These are three separately verified inventories. This clean hosted archive has 240 inner members; it must not be conflated with an earlier local 719-member archive.

## Audit limits and execution

This was a read-only audit of retained output: no compilation, test suite, browser run, or source change was made. The audit script reads the raw provider ZIP and all archive members, member inventory, extraction, attempt receipts, build outputs, traces, logs, and workflow snapshots; it writes only `fixed/lanes/build/audit.json`.

One identity command was run before root clarified the no-Git-write constraint: `git rev-parse HEAD && git write-tree`. It returned the same 00da commit and 51b64 tree. Root confirmed that the tree object already existed locally and HEAD, index, and worktree remained unchanged. The command could have had only the limited object-store side effect of writing an already-existing tree object; the final audit script contains no Git operations.

- Audit JSON: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/build/audit.json` (SHA-256 `93caad22bee5efc4720831e71dad5e7255909b335461d73c131ea341b8424c72`)
- Audit script: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/build/audit_fixed_primary.py` (SHA-256 `da423db4f1628961ed7c6185c0014ffed5e40eb26a1c36e9332b6f8a898efca3`)
- Primary workflow log: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/evidence/logs/push-41181505234-job-124479683598.log` (SHA-256 `77996bcf53e202f4cf9fcfb943eea1ce74c42d64e6d209648ac4c8afb2c6c9c1`)
- Separate inherited PR workflow log: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/evidence/logs/pr-41181508907-job-124479693814.log` (SHA-256 `8d38525e620f180db5f9aa30d4da7f6cdf7e2220d445a33179203e5a71e57c2d`)

The accepted conclusion is limited to the pinned successful provider run and its recorded lifecycle build and conformance evidence. It does not imply that suite outputs omitted from this provider archive were retained in it.
