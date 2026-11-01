# XR-ADMITFIX — Independent review of E-ADMITFIX

## Decision

**Accepted.** The sealed source closes the top-level build-index and role-specific build-record key sets. The real PR23 four-build/two-pair bundle still passes, and the prior aliases now reject at the envelope checks. Independent public-API probes also reject unknown and missing keys, preserve the source-omission gate, and leave the existing capability and ABI-pair rejection paths intact.

## Author packet and source binding

The E-ADMITFIX seal checks all four listed entries: E-ADMITFIX.md (`f4cc7e1651fba0611083f2b5ad7cbcbe3762a5c0b74872205918c54cf19c7c48`), E-ADMITFIX.json (`6396740e449d70cd18ac712daea50c1d027685325d29e4a1c98b2969208e149f`), author-rawlogs-index.json (`09d5d73ef59154fb64e0586ad3b161c4429987c93eab34b52517f93eea0f4928`), and rawlogs-index.json (`0e45c92f2127059d96b301c8ed2f6f51f89cd0bb71351dc98c985143a694cb5f`). The raw log audit independently checked byte counts and hashes for every entry in the canonical index.

The source-inventory file SHA-256 is `6e9ceb045e37a517539e2639e3b0452651e775711aef4bf6351d5b057d21af7c`. Its two records match both sealed snapshots and live owned files:

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| `effectqualification/admission.go` | 40,687 | `53e6458ccd41093e82016ce5cde56c213d8d7d92f6b4dfc1ac1f11d34cc52c50` |
| `effectqualification/admission_test.go` | 12,722 | `efb054c746dec49c0ddef1beb1e386f69a1f73883ce26f69bd3bb978ba7d67a0` |

The source-inventory object itself is not directly listed in seal.json; the report contains the same source hashes, and the indexed `source-freeze.stdout.log` confirms them. The review Go overlay uses these exact admission source snapshot paths, plus the pinned E-ADMISSION verifier, E-CAPTURE helpers, and E-ORDERFIX ordering source. Their verified hashes are recorded in `source-seal-check.stdout.log`.

This epoch-20 packet preserves both index forms: `rawlogs/E-ADMITFIX/index.json` matches the sealed original author index byte-for-byte, while `coordinator-index.json` matches the sealed canonical rawlogs-index. The canonical list contains the author-listed 29 files plus the preserved original index entry. The normalization note’s pre-epoch20 serialization caveat does not apply to this packet; all indexed streams, source snapshots, reports, and receipts were hash-checked.

## Reviewed key sets

The allowlists match the real fixture exactly:

- Build index: 15 keys — `actualBuildCount`, `adapterChecks`, `admission`, `buildContext`, `builds`, `childPackagePath`, `closedEffectDescriptors`, `commands`, `inventory`, `nativeMountBoundaries`, `outputRoot`, `parentPackagePath`, `schema`, `sourcePins`, `toolchain`.
- Build record common keys: 12 — `artifacts`, `backend`, `componentId`, `manifest`, `manifestPath`, `outputCount`, `outputDir`, `outputs`, `packagePath`, `result`, `resultPath`, `role`.
- Parent record: those 12 plus `keyedHelper` (13 total). Child record: the 12 common keys only.

`checkExactAdmissionJSONKeys` checks missing fields before extras and sorts each set before reporting the first diagnostic, so a combined malformed object fails deterministically. `effectBuildRecordKeySet` adds `keyedHelper` only for parent records. The sealed regression test asserts the actual key counts for all four backend/role records and tests aliases, unknown keys, missing required fields, and the parent-only key.

## Independent verification

The real PR23 attempt passed `VerifyDirectory` with source commit `e0933465725e470dc610e3f81b4bbee95538c1d0`, 4 scenarios, 20 profiles, 4 builds, and 2 ABI pairs. My focused run against the sealed source overlay passed in 4.745 seconds. The independent hard-link overlays refreshed build-index integrity and summary digest claims before each mutated-directory call, so malformed envelopes reached `VerifyDirectory`’s ABI key checks rather than unrelated input or capture failures.

| Control | Rejection observed |
| --- | --- |
| `ClosedEffectDescriptors` beside canonical `closedEffectDescriptors` | `build index has unknown or incorrectly-cased field "ClosedEffectDescriptors"` |
| Unknown top-level `unrecognizedField` | `build index has unknown or incorrectly-cased field "unrecognizedField"` |
| Missing top-level `actualBuildCount` | `build index is missing required field "actualBuildCount"` |
| `OutputDir` beside canonical `outputDir` in a child record | `react-child build record has unknown or incorrectly-cased field "OutputDir"` |
| Unknown child record `unrecognizedField` | `react-child build record has unknown or incorrectly-cased field "unrecognizedField"` |
| Missing child `outputDir` | `react-child build record is missing required field "outputDir"` |
| Child record given parent-only `keyedHelper` | `react-child build record has unknown or incorrectly-cased field "keyedHelper"` |
| Missing parent `keyedHelper` | `react-parent build record is missing required field "keyedHelper"` |
| Coherently remove the essential `effectmodulechild/app.go` pin and source file across source-pins-before/after, execution snapshot, test-source list, build source-pin manifest, build-index pins, and build-summary pins; refresh build-index hashes and source identity metadata | `source closure: required source pin "fixtures/compiled/effectmodulechild/app.go" is absent` |
| Remove child `effect.cancel`, refresh output inventory | `AppIR capabilities: got [effect.request-reply numeric.float64 numeric.safe-integer view.node], want exact capability set [effect.cancel effect.request-reply numeric.float64 numeric.safe-integer view.node]` |
| Rebuild parent AppIR and ABI with child bridge roles and refreshed output pins | `react parent/child ABI pair: parent must expose exactly Init, Update, View, Output, and Receive` |
| Duplicate the parent identity in a digest-valid child descriptor | `parent and child must be independently identified modules` |

The source omission still rejects at the same required-source gate as XR-ADMISSION. The new envelope checks do not mask the pre-existing semantic capability and pair controls.

The E-ADMITFIX focused author command and full-package output were also independently checked in the sealed log index. The author full-package log reports `ok github.com/samuelpmahan/gondola/effectqualification 37.139s`; I did not rerun the full package as part of this review. The broader root `go test ./...` and vet run are separately owned by root.

## Scope

This review accepts the key-set repair only. As the prior XR-ADMISSION review documented, internally consistent, fully rehashed generated artifacts and ABI sidecars remain accepted because the verifier does not authenticate or execute the compiler. E-ADMITFIX preserves that scope; it adds no compiler-authenticity claim. The `keyedHelper` value is required as a parent-only envelope key here; this review is limited to key membership and does not claim independent validation of that metadata payload.

## Evidence

- `rawlogs/XR-ADMITFIX/source-seal-check.stdout.log` — seal, source pin, author-index, coordinator-index, and rawlog checks.
- `rawlogs/XR-ADMITFIX/focused-controls.stdout.log` — sealed author regression tests against the real fixture.
- `rawlogs/XR-ADMITFIX/source-omission.stdout.log` — real positive and coherent source-omission control.
- `rawlogs/XR-ADMITFIX/adversarial-controls.stdout.log` — aliases, unknown/missing fields, capability, and pair controls.
- `rawlogs/XR-ADMITFIX/child-parent-key-rejection.stdout.log` — parent-only key rejected on a child record.
- `rawlogs/XR-ADMITFIX/go-overlay.json` and `commands.txt` — exact source snapshots and reproduction commands.
