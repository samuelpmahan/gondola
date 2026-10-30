# XR-O-PROBE — independent review of offline oracle mutation evidence

## Decision

**Accepted.** The saved probe result is internally consistent and bound to the executed checker, scenario helper, and positive JSON hashes. It records a clean 14-action baseline, detects each declared mutation through relevant checker fields, and accepts error-text-only changes as specified by the contract.

## Evidence reviewed

- `typed-composition/coordination/reports/O-PROBE.md` and `receipts/O-PROBE.json`.
- `typed-composition/coordination/reviews/O-PROBE.mjs`, `O-PROBE-positive.json`, and `O-PROBE-results.json`.
- Current `check.mjs`, `testdata/check-positive-scenario.mjs`, `check.test.mjs`, and final producer receipt/report for `fixture.mjs`.

The probe source validates the positive input before creating any cloned mutations and aborts immediately if the baseline is not clean. The saved result binds that baseline to the 14-action JSON hash `b29e07a478aac020504b22ce9e6b1b4aedfbbacaf592b1051be3e01f5344861c`, with zero issues. The report's executed checker/helper hashes match the current files: checker `fea6e333b301a010fab306475b2d9b5eae8c2b918b8defa4045c8384b8f1d422`, helper `9012ba366e959cecd8791c25c1f35267f9dd822394427cb219af8b094b163174`. The probe and result files also match their reported hashes.

## Mutation review

All seven saved controls passed. The six rejection controls report the expected causal fields: missing focus produces only `focus.replacement.missing`; missing bilateral effects/transport arrays includes each actor's missing-channel and expected-command evidence; bilateral reversal reports both event-sequence and cancel-ID order mismatches; omitting a start invocation on both sides reports both clock-delta and command-count mismatches; converting the candidate rejection to success reports `operation.native-candidate`; and inconsistent blocked-input evidence reports the physical after-value and native-dispatch count. The separate error-text-only control reports zero issues.

The bilateral channel-removal and omission controls also create downstream request-state mismatches because the later cancellation no longer has its observed start. The result JSON includes those fields, but each control also has direct missing-channel/clock/command-count evidence, so rejection does not depend solely on the downstream mismatch. Reversal includes direct cancel-ID mismatches, not only sequence metadata.

The current fixture hash is `854dfae39c9c0c32d3955e9158bd5656e33f29641b52d3544d04e9bd3302020c`, while O-PROBE recorded `21604cc888b704b2d36b2683d27e301b5b0bfe9994577872af63cf73e7134c60` as a contextual source hash captured during its run. The later producer update adds host-generation observations; the report explicitly states that fixture was contextual and not executed by the offline probe. The unchanged checker/helper/input hashes bind the offline evidence. The final fixed browser/native replay is reported separately against the final fixture.

## Verification boundary

This review checked the saved evidence and source/hash relationships; it did not rerun O-PROBE, the browser/native replay, the default seeded replay, or the inherited runner. No source files were changed.
