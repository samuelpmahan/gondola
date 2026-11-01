# E-ADMITFIX — closed admission envelope keys

## Result

Closed the JSON key sets for the generic-map build index and its build records in `gondola/effectqualification/admission.go`. `DecodeStrict` remains responsible for duplicate/canonical JSON decoding; the new allowlist rejects keys that a generic map would otherwise retain, including casing aliases beside the canonical spelling.

The index allowlist has the exact 15 keys from the real PR23 `builds/build-index.json`. Build record keys are role-specific, matching the actual fixture: both parent records have 13 keys including `keyedHelper`; both child records have the common 12 keys and no `keyedHelper`. The parser reports a deterministic first missing or unknown/incorrectly-cased key.

## Regression coverage

`admission_test.go` now covers:

- Actual PR23 `VerifyDirectory` positive control with ABI status `passed`, four builds, and two parent/child pairs. The test also asserts the 15-key index and the actual 13-key parent / 12-key child record shapes.
- Top-level case alias `ClosedEffectDescriptors` beside canonical `closedEffectDescriptors`, an unknown top-level field, and missing required `actualBuildCount`.
- Build-record case alias `OutputDir` beside canonical `outputDir`, an unknown record field, missing required `outputDir`, and missing parent-only `keyedHelper`.

The negative controls invoke `checkEffectBuilds` or `checkOneEffectBuild` directly after reading the actual PR23 JSON. That reaches the envelope validator itself instead of being rejected earlier by a stale outer integrity pin. The positive control uses the real public `VerifyDirectory` path.

## Verification

The focused command passed all positive and negative controls:

```sh
GOBI_EFFECTS_QUALIFICATION_INPUT=/workspace/scratch/39a56936f173/gondola/compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a /tmp/gondola-go/go/bin/go test ./effectqualification -run '^TestBuild(IndexEnvelope|RecordEnvelope)' -count=1 -v
```

It passed with exit status 0 on Go 1.24.0. The full output is in `rawlogs/E-ADMITFIX/admission-controls.stdout.log`. The full `effectqualification` package then passed with the same fixture and `-count=1`, reporting `ok github.com/samuelpmahan/gondola/effectqualification 37.139s`; see `rawlogs/E-ADMITFIX/full-package.stdout.log`.

The prior E-ADMISSION report, receipt, rawlog index, author rawlogs, and sealed source snapshot remain unchanged; `preservation-check.stdout.log` verifies their stored hashes. The initial `gofmt` lookup failed because the system PATH has no `gofmt`; the bundled formatter succeeded. One early test capture also used paths relative to the wrong working directory and failed before starting Go. Both corrections are documented in the rawlogs; the final saved test command passed.

## Scope

This change closes key sets only. It does not authenticate the compiler or claim that internally consistent, fully rehashed artifacts were produced by the pinned compiler. That remains the stated E-ADMISSION limitation in `reports/XR-ADMISSION.md`. The separate source-omission mutation from XR-ADMISSION was not rerun as part of this envelope fix. The full-package run passed against the current shared tree.

## Frozen source pins

| File | Bytes | SHA-256 |
|---|---:|---|
| `gondola/effectqualification/admission.go` | 40,687 | `53e6458ccd41093e82016ce5cde56c213d8d7d92f6b4dfc1ac1f11d34cc52c50` |
| `gondola/effectqualification/admission_test.go` | 12,722 | `efb054c746dec49c0ddef1beb1e386f69a1f73883ce26f69bd3bb978ba7d67a0` |
