# CI2-GO — PR #11 head 184ccda

**Outcome: `confirmed_reuse` for this compiled-frontend workflow run.** GitHub Actions run `41144116537`, job `124365059288`, completed successfully on PR #11 head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281` (base `42df6883337605d901a23e9fed874768c7ce1824`). The saved execution receipt records 33 commands, all exit code 0. This packet covers the compiled-frontend workflow only; it does not transfer the previous head’s other workflow results.

## Artifact provenance and toolchain

The completed-run metadata identifies artifact `13020568606`, named `gobi-compiled-frontend-artifacts`, with size 124,558,516 bytes and SHA-256 `c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e`. The downloaded archive hash matches both its provider digest and the final extraction manifest. Provider metadata binds the artifact to run `41144116537` and head `184ccda…`; the final manifest contains 309 compiler artifact records and 4 inherited report records. A recovery record documents an initial ENOSPC during extraction and a bounded retry; the original archive digest is unchanged.

Actual versions in `execution.json`:

- Root Go: `go1.24.13 linux/amd64`
- Compiled-frontend Go: `go1.27.3 linux/amd64` (`GOTOOLCHAIN=go1.27.3`)
- Node: `v22.23.4`
- React and React DOM: `19.3.1`
- esbuild: `0.28.2`
- Playwright: `1.64.1`

## Go and Node gates

All six recorded Go commands exited 0:

| Toolchain | Scope | Unit tests | Race | Vet |
|---|---|---:|---:|---:|
| Go 1.24.13 | `./compilercontract ./fixtures/compiled/... ./cmd/compiled-native` | pass (five packages; output marked cached) | pass | pass |
| Go 1.27.3 | `./analyze ./build ./cmd/... ./emit` | pass | pass | pass |

The Node suite reports **81 passed, 0 failed, 0 skipped**. `compile-four`, `build-native`, all native/direct/browser comparisons, demo build, and demo smoke commands also exited 0. The saved command stdout and stderr hashes all match the execution receipt.

## Compiler outputs and conformance profiles

The four-app compiler request returned `ok: true`, no diagnostics, and 209 outputs. The output inventory has 209 entries before and after the run; I checked every path’s existence, byte count, and SHA-256 against the saved pins. Every output matched.

The build manifest lists 186 unique emitted TypeScript files; all exist and are included in the verified output pins. Its five forwarding entries comprise four `forwarder.go` facade files and `forwarders/go.mod`; each exists and is pinned. The manifest maps each app’s `Init`, `Update`, and `View` symbols to the `GobiCompiledInit`, `GobiCompiledUpdate`, and `GobiCompiledView` facade exports.

All five conformance profiles matched across four app packages, totaling 43 ticks:

| Profile | Result | Ticks |
|---|---|---:|
| Counter add/reset/disabled | matched | 5 |
| Form text/checked/literal save/reset | matched | 10 |
| Keyed list identity/empty/detached | matched | 11 |
| Effect commit/reply | matched | 5 |
| List growth/spare-capacity edit/reorder/reset | matched | 12 |

Each profile records zero WebAssembly requests and zero WebAssembly API attempts. The browser version recorded in the profiles is `156.0.8078.4`.

## Source and output stability

The run records 116 source pins before and after execution, with identical arrays. I checked all 116 against this exact-head checkout; every hash matches. The 209 build output pin records are also unchanged before and after execution and match the extracted output files.

Detailed archive, command, source-pin, output-pin, and manifest checks are in [`execution-audit.json`](../../audits/CI2-GO/execution-audit.json). Source and workflow preflight hashes are in [`source-preflight.json`](../../audits/CI2-GO/source-preflight.json). This result is bounded to the four compiled apps and five scripts; it does not establish universal backend support or byte-identical output across toolchains.

