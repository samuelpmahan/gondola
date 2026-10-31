# CI2-TRACE

**Outcome: confirmed_reuse.** The fresh repaired-head workflow artifact passes the bounded four-app/five-script trace gate. The native and direct JavaScript traces match exactly; browser trace cores match those traces and browser DOM snapshots match the hand-authored oracle. The previous failed run remains closed in its separate CI-TRACE packet.

## Workflow and artifact provenance

The completed `compiled-frontend` job is run `41144116537`, job `124365059288`, artifact `13020568606`. The workflow conclusion is `success` on PR11 head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`, tree `ca99e9432dca87a6bf6718c20186b1223b870126`, direct parent `408e330517b1dd5e5f865e2ff1914465f98bcf66`, PR base `42df6883337605d901a23e9fed874768c7ce1824`. The ZIP is 124,558,516 bytes with SHA-256 `c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e`; that digest agrees across the downloaded archive, completed-run metadata, and extraction manifest. N2 verified the manifest's exact compiler-artifact file set: all 309 files, including file sizes and SHA-256 values.

The first extraction attempt hit ENOSPC while copying unrelated large inherited JSON reports. Its staging was removed and the original ZIP preserved. The completed extraction contains every compiler artifact file and four selected inherited summaries under 1 MB; the recovery note and selected-file hashes are recorded in the audit data.

The run receipt records 116 source pins before and after execution, equal to each other and to the canonical repaired-head checkout. All 33 command entries exited zero, and N2 verified all 66 stdout/stderr log hashes. The runner's 209 compiled-output path/hash/byte pins match the saved outputs before and after the run.

Tool versions: root Go 1.24.13, nested Go 1.27.3, Node v22.23.4, React and React DOM 19.3.1, esbuild 0.28.2, Playwright 1.64.1, and Chromium 156.0.8078.4. `CHROMIUM_PATH` is unset in the CI execution, so the browser tests exercised Playwright's managed Chromium path. All 81 Node tests passed.

## Trace results

| Profile | App | Ticks | Action ticks | Effect requests/completions | Mutation controls |
|---|---|---:|---:|---:|---:|
| counter | counter | 5 | 4 | 0 / 0 | 17 |
| form | form | 10 | 9 | 0 / 0 | 18 |
| list | list | 11 | 10 | 0 / 0 | 19 |
| effect | effect | 5 | 3 | 1 / 1 | 18 |
| list-growth | list | 12 | 11 | 0 / 0 | 17 |
| **Total** | **4 apps / 5 profiles** | **43** | **37** | **1 / 1** | **89** |

All five reports are `matched`; the independent raw-data check found zero mismatches. Closed typed values, ordered view trees and bindings, actions, messages, dispatch IDs, and effect records were compared across native, direct JavaScript, and browser traces. Browser action observations were also tied to fixture intent and delivered messages, while DOM snapshots were checked against the separate oracle.

The form literal-click case preserves the distinction between requested `Action{path:"2", event:"click", value:"must not replace literal"}` and delivered `Message{name:"literal", arg:"target.value"}` at `dispatch-0003`. In the effect profile, `dispatch-0002` commits pending state and requests effect index 0; its completion arrives afterward as `dispatch-0003`. The `Rows` value is typed as nil at list initialization and as a non-nil empty slice after removal. The effect state retains IEEE-754 negative-zero bits `8000000000000000` on every tick.

The observed numeric metadata includes Number-backed `int64` state reaching `9007199254740991`, and BigInt-backed `uint64` list IDs encoded exactly as decimal strings for values 0 through 5. The typed validator checks the declared widths and Number safe-integer bounds. The audit JSON contains the exact SHA-256 and byte count for every native, direct, browser, and comparison file, plus the per-profile type/value records.

## Limits

This confirms the five recorded fixtures on the repaired PR11 head. It does not establish a general Go compiler/backend guarantee. The BigInt values in these traces are small list IDs; full-width BigInt boundary values are not exercised here. Float64Array-backed GoSlice wrappers are also outside these fixtures. The separate managed-Chromium repair was exercised in this workflow with `CHROMIUM_PATH` unset.

The full immutable artifact, execution record, recovery note, source/output pin checks, and raw trace hashes are summarized in [raw-evidence.json](../../audits/CI2-TRACE/raw-evidence.json). The audit implementation is [audit-traces.mjs](../../audits/CI2-TRACE/audit-traces.mjs).
