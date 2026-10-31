# E-RESULT-NATIVE: full-run native and direct evidence audit

## Result

**Outcome: insufficient evidence for full capability acceptance.** The raw native and direct outputs from the current local full attempt match the frozen lifecycle fixture. The embedded full E-BUILD receipt is `failed`, so this packet closes the native evidence lane without accepting the integrated run.

## Source identity and full-run status

The local run used source commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c`. Root's publication binding identifies PR 15 head `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`, tree `d22b75e18c7bea70a743cc79d53461b287c7d045`, based on `00da54ad0f5a4006b13a5cded18ce291845978bc`; root verified the local/remote source binding.

The full command was:

```text
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 CHROMIUM_PATH=/tmp/chromium CHROMIUM_EXECUTABLE_PATH=/tmp/chromium bash run-compiled-capabilities.sh
```

Attempt `compiled-capabilities/builds/attempts/attempt-20261031T095356051Z` completed at `2026-10-31T10:16:59.067Z`. Its E-BUILD receipt records `mode: full`, `status: failed`, 161 matching source pins, 24/24 M0 rows, and exactly one failed stage:

```text
inherited-static-and-interaction-lifecycle:
fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain
```

All 16 recorded subprocess commands exited zero. Root observed the full runner process exit code was also zero even though the final log line and receipt say `compiled-capabilities: failed (full)`. The full run therefore failed its acceptance gate despite the zero process exit. The nested native/direct lifecycle conformance stage itself completed with `matched` run and check receipts.

The primary push workflow metadata records run `41190743932` as completed/success and artifact `13039351554` (`gobi-compiled-capabilities-artifacts`, 76,821,513 bytes, SHA-256 `40dd8c6fea08e9d7fec280e1a31b448ced0d56a2245834c074cb05bfba4353a8`). N4 owns that artifact's download and catalog. This lane reviewed the local full attempt's raw files and makes no claim about the downloaded artifact's internal contents.

## Toolchain, command, and seed

The full receipt records Node `v22.23.4`, root Go `go1.24.0 linux/amd64`, compiler Go `go1.27.3 linux/amd64`, npm `11.9.0`, and Chromium `153.0.8010.0`. The conformance runner independently records `/tmp/gondola-go/bin/go` as `go1.24.0 linux/amd64`.

Both backend builds ran the actual compiler CLI from `compiled-frontend` with `GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false`:

```text
go run ./cmd/gobi-build
```

The request JSON was passed on stdin and the raw stdout parsed as `gobi.build-result/v1`. React and DOM commands both exited 0, had no signal or command error, and their raw stdout hashes match the command ledger. Native replay used:

```text
/tmp/gondola-go/bin/go run ./cmd/compiled-lifecycle-native --script /workspace/scratch/39a56936f173/gondola-capabilities/fixtures/compiled/lifecycle/scenario.json
```

The full receipt declares `seed: null` and the frozen fixture/literal expectation policy; the lifecycle run uses no random seed.

## Native, direct, state, tree, and effect findings

An independent read-only auditor checked the raw `matrix/capabilities.lifecycle.native.json`, `matrix/capabilities.lifecycle.direct.json`, backend `result.json` files, BuildResult output trees, and conformance run/check JSON. Every native Go state and Gobi view tree matches the hand-authored lifecycle oracle. Every direct typed application state, Gobi tree/binding record, typed effect slice, requested/completed effect record, and trace tick matches the same literal fixture. The conformance run and check both report `matched`; the run records stable source and build-output pins through checking.

The fixture contains 26 scripted events, 16 physical clicks, and 26 Go ticks. The raw native trace has 26 steps and direct replay has 26 steps and 26 Gobi ticks. It emits exactly seven `fixture.request` effects for `parent:g1:r1`, `child:g1:r2`, `grandchild:g1:r3`, `sibling:g1:r4`, `parent:g2:r5`, `child:g2:r6`, and `grandchild:g2:r7`. It emits three `lifecycle.cancel` effects in child-first order: `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`. No state, tree, event, effect type, ordering, or tick mismatches were found.

Both actual GoScript builds returned one clean app with 67 physical output files, each individually rehashed against `BuildResult.outputs`. The AppIR capabilities are exactly `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. React and DOM AppIR bytes match (SHA-256 `ed93e9ae6f9be20c306669d63b676ed466e65fee8dc7fd0a1a4c8a6b38f0a68a`), and encoder bytes match (SHA-256 `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`). Generated module hashes are recorded separately: React `f2fa10211b86b94c340897631cffea7c65f8eba4938966bb0436b548d37c879b`; DOM `1989db8e823b466ee9355932909572feba477dd905095b0771ffa886b6c2dcda`. This lane makes no raw-module equality claim.

## Reproduction and hashes

The independent raw-data audit completed under Node `v22.23.4`:

```text
/tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/ci/2026-10-31/lanes/native/audit.mjs compiled-capabilities/builds/attempts/attempt-20261031T095356051Z
```

It exited 0 and wrote `compiled-capabilities/ci/2026-10-31/lanes/native/audit.json` (SHA-256 `cdff7c33b12d8578e5c038330ee4e81be3113a7e5c18a7c2e445ea5be4b79e43`). The checked raw files are pinned in `E-RESULT-NATIVE.json`; key values are native trace `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5`, direct trace `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71`, lifecycle run `c798e34c175e109322c38547986131aec86a6b70f4d1c37844b0d63d820672db`, and lifecycle check `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a`.

## Limits

This result accepts the raw native/direct and GoScript build facts for the named local full attempt only. The overall source-bound run is failed at the inherited lifecycle receipt wording gate and returned process exit 0; integrated capability acceptance remains insufficient. The hosted artifact's embedded files are reserved for N4's catalog and independent review. This lane does not re-run the full workflow, modify source or native state, or assert browser/demo/archive acceptance.
