# XR-ADMISSION — Independent review of E-ADMISSION

## Decision

**Amend.** The real PR23 directory is admitted, the probed omissions and semantic mismatches reach the intended source or ABI checks, and the four-build/two-pair controls work. The build index and build records still accept extra casing-alias keys while retaining the canonical fields. N4 is assigned to close the canonical key sets with regression coverage.

## Source and seal basis

The review used the sealed E-ADMISSION source snapshot through a Go overlay, not moving live admission files. The E-ADMISSION source inventory SHA-256 is `c7949049f3749d3fa7b0c998c7fac6208727a9515d50673769b647164a94ebc1`. Its three pins match both `seals/E-ADMISSION/source/` and the current owned source:

| E-ADMISSION source | Bytes | SHA-256 |
| --- | ---: | --- |
| `effectqualification/verify.go` | 5,835 | `3b013dee973832de0a720de3e9385a79f8c91ae6ae06c9e295cacf89f71891f4` |
| `effectqualification/admission.go` | 38,477 | `724cad47901440766299d1f3002d4ee1e9754a4beb9ab585f885df8b0a2d1d02` |
| `effectqualification/admission_test.go` | 6,901 | `96bac46919fa72321da2bf273f46d06f572ed7869942cca82a98a57ab2dfa5ac` |

The author `seal.json` verifies its three entries: E-ADMISSION.md (`a87cc3cec9f1a273b5f3160b04113fdfcfe40fecd45e87f5abff653e9076a971`), E-ADMISSION.json (`2a7ea5e08ff257d4ece9e5fe081bab3009edf9b1bd5f47bd92aed8dc1a394cfb`), and rawlogs-index (`c8145b58eee5b2840590c62ac666d0cf8e28dd001be0bcdca1fc278c694266cf`). The source inventory itself is not included in that seal map. I therefore recorded its digest above and independently verified every archived and live source byte against its listed pin. The source and log checks are reproducible in `rawlogs/XR-ADMISSION/source-seal-check.py` and `.stdout.log`.

The runtime overlay pins E-ADMISSION `verify.go` and `admission.go`, E-CAPTURE `capture.go` and `json.go`, and E-ORDER `ordering.go` to the checked source snapshots. E-CAPTURE's two live files still match its inventory. The current live `ordering.go` changed after its E-ORDER snapshot (65,613 bytes, SHA-256 `010be4d08d8c2905c81d3306cc86ce97789099321c6c7209012c579a0e0fedfe`); the overlay instead uses the E-ORDER-pinned 51,953-byte source (`327f00f49a79cfeaf4d4eb0954c62510421e2c6d91a4b2ee7dfabd30f51af98d`). This isolates admission review from later ordering work.

## Positive control and probes

The pinned-overlay positive control passed on the real attempt directory. `VerifyDirectory` reported source commit `e0933465725e470dc610e3f81b4bbee95538c1d0`, 4 scenarios, 20 profiles, 4 builds, and 2 ABI pairs. Each pinned-overlay probe reruns that positive control before its controls. The source-omission probe and the remaining mutation matrix produced these exact intended results:

| Control | Rejection observed |
| --- | --- |
| Remove `fixtures/compiled/effectmodulechild/app.go`; remove every source-pin entry from source-pins-before/after, snapshot source pins, `testSourceFilesPinned`, `builds/metadata/source-pins.json`, `build-index.sourcePins`, and `metadata/build-summary.sourcePins`; refresh build-index digests and use canonical head `0123456789abcdef0123456789abcdef01234567` in closure, runner, and snapshot metadata | `source closure: required source pin "fixtures/compiled/effectmodulechild/app.go" is absent` |
| Replace that source file with a symlink | `hash inputs before validation: walk effects qualification inputs: input source/fixtures/compiled/effectmodulechild/app.go is a symbolic link` |
| Append to React child `components.gen.mjs`, refresh build manifest/output records and build-index digest claims, but leave ABI sidecar stale | `validate sidecar against exact generated artifact bytes: artifact bytes mismatch for "apps/effectmodulechild-c9fffa44f17d/components.gen.mjs"` |
| Change AppIR schema and refresh output inventory | `AppIR schema or component identity does not match the build profile` |
| Remove `effect.cancel` and refresh output inventory | `AppIR capabilities: got [effect.request-reply numeric.float64 numeric.safe-integer view.node], want exact capability set [effect.cancel effect.request-reply numeric.float64 numeric.safe-integer view.node]` |
| Add `ForwarderModule` to typed build manifest and refresh its pins | `decode build manifest: $: unknown or incorrectly-cased JSON field "ForwarderModule"` |
| Remove top-level `closedEffectDescriptors` | `build index is missing closed effect descriptors` |
| Remove the closed descriptor's `reply` field | `closed effect descriptors differ from the supported request/cancel ABI` |
| Add `Bytes` alias beside `bytes` in a typed source pin | `unknown or incorrectly-cased JSON field "Bytes"` |
| Rebuild React parent AppIR/ABI with child bridge roles and refreshed output pins | `react parent/child ABI pair: parent must expose exactly Init, Update, View, Output, and Receive` |
| Derive a digest-valid child ABI descriptor with the parent's component identity | `parent and child must be independently identified modules` |

No integrated mutation produced a capture error. The source omissions and symlink reject at their intended source/inventory checks before capture validation; their diagnostics name the exact missing pin or path. The omitted source case leaves the four build-result AppIR source-span strings intact; those are not source-pin manifests and are not used as source authority by this verifier.

## Amendment: casing aliases in generic maps

Two independently rehashed controls were accepted while retaining their canonical fields:

- Add `ClosedEffectDescriptors` beside `closedEffectDescriptors` in `builds/build-index.json`; refresh `metadata/build-integrity.json` for the changed index. `VerifyDirectory` accepted it.
- Add `OutputDir` beside canonical `outputDir` in the React child build record; refresh index integrity. `VerifyDirectory` accepted it.

`checkEffectBuilds` decodes the top-level index and build record into `map[string]json.RawMessage`; `DecodeStrict` rejects unknown and incorrectly-cased fields only when decoding structs. Required canonical map keys are checked, but extra keys are not enumerated. The existing controls also confirm that typed manifest and source-pin structs reject casing aliases. The amendment should close exactly the top-level build-index and 4 build-record key sets and add regression tests; it need not claim compiler provenance.

## Bounded fully rehashed artifact acceptance

A separate control appended a comment to the React child generated component, rederived the module ABI from the updated AppIR and exact four artifact bytes, rewrote the sidecar, and refreshed output inventory, build record artifact metadata, manifest pin, build-integrity index, and summary index digest. `VerifyDirectory` accepted the result with the expected 4 builds and 2 pairs.

This is consistent with E-ADMISSION's stated limit: the verifier validates byte and ABI consistency but does not execute or authenticate the compiler toolchain. It does not establish that the changed artifact was actually emitted from the pinned source. Treat this as a scope limit, not as compiler-output authenticity.

## Evidence

- `rawlogs/XR-ADMISSION/positive-control-pinned-overlay.stdout.log` — pinned source positive control, passed.
- `rawlogs/XR-ADMISSION/source-omission-pinned-overlay.stdout.log` — positive control and the fully rehashed source omission.
- `rawlogs/XR-ADMISSION/probe-pinned-overlay.stdout.log` — positive control and remaining independent rejection/acceptance controls.
- `rawlogs/XR-ADMISSION/go-overlay.json` — exact source snapshots used by Go.
- `rawlogs/XR-ADMISSION/source-seal-check.stdout.log` — author report/log seal checks and exact source-pin comparisons.
- `rawlogs/XR-ADMISSION/commands.txt` — commands to reproduce the review.

The earlier unoverlaid probe logs are retained for chronology; the decision above relies on the pinned-overlay outputs.
