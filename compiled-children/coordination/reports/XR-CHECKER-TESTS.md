# XR-CHECKER-TESTS: independent review of N5 conformance tests

**Decision: `amend`.** The fixed native positive control and all five capture mutations behave as described, and the seeded tests remain input-only. One test-coverage gap remains: seeded batches check argument order and a declared child cap but do not verify each batch's operation names or derive the schedule's maximum live-child count from its inputs.

## Review and fresh verification

Reviewed `compiled-children/conformance/check.test.mjs`, `seeded.test.mjs`, the N4-owned `check.mjs` and `seeded.mjs`, and N5's E-CHECKER-TESTS report, receipt, and rawlogs. The N5 report/receipt hashes match the current files. The source pins for both tests, the checker/generator, the 42-event fixture, actual native trace, and literal expectations match the E-CHECKER-TESTS receipt.

Fresh command under Node `v22.23.4`:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/conformance/check.test.mjs compiled-children/conformance/seeded.test.mjs
```

Result: **9 passed, 0 failed**, including the pinned native positive check and five rejection cases. Both test files also pass `node --check`. Raw output is in `coordination/rawlogs/XR-CHECKER-TESTS-20261031-01/`.

N5's preserved initial seeded-test failure confirms the N4 physical-click change was exercised: the prior event-kind allowlist omitted `click`, so one of nine tests failed. The current test accepts and checks that real keyed counter click, and this fresh run passes. The original failure log was left untouched.

An independent review script started from the actual 653,879-byte native capture with SHA-256 `8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb`, verified its positive comparison against the frozen fixture and literal expectations, then structured-cloned and changed one capture field per case. All five mutations raised `TraceMismatchError` at the expected field:

| Mutation | Native event | Observed mismatch |
| --- | ---: | --- |
| Child counter count | 0 | `steps[0].state.Children[0].Counter.Count` expected `1`, got `2` |
| Reused child generation | 15 | `steps[11].state.Children[2].Generation` expected `5`, got `2` |
| Child request sequence | 4 | `steps[4].state.Children[0].RequestSeq` expected `1`, got `2` |
| Clear cancellation order | 24 | `steps[20].effects[0].arg` expected `child:oak:g5:r2`, got `child:elm:g3:r2` |
| Reordered Gobi node key | 8 | `steps[8].view.kids[1].kids[1].key` expected `child-oak`, got `child-ash` |

The seed test imports only Node assertion/test helpers and `generateSeededChildrenScenario`. For seeds `20261031`, `20261032`, and `20261033`, the generator returned deterministic 60-event input schedules with distinct six-key orders and `scenario`/`metadata` only. Each schedule starts with the N4 physical child counter click, stays under the 64-event cap, and reports `maximumChildren: 6`. Boundary seeds `0` and `4294967295` pass; negative, fractional, non-finite, string, null, BigInt, Symbol, and out-of-range seeds are rejected. The unit code does not import a browser runner, construct browser captures, assert browser output, or synthesize Go/direct state. The exact seeded observations are in `seed-audit.json`.

## Finding: seeded schedule assertions are looser than their declared coverage

`seeded.test.mjs` lines 69–76 compares only `event.message.arg` for the six-child add, counter, and request batches, and for the duplicate add. It does not require the corresponding messages to be `child.add`, `counter.add`, or `child.request`. Lines 42–44 check the event-count cap and `metadata.bounds.maximumChildren === 6`, but do not derive the maximum active child count from the emitted operations. The current generator emits the expected operations and the fixed schedules visibly remain within six children; this is a regression-detection gap in the test, not a discovered reducer or generator failure.

Recommended amendment: assert the complete `{ kind, message: { name, arg } }` entries for those message batches and validate the six-child input bound from the schedule without inventing native/direct/browser results. Keep seeded tests input-only.

## Custody and boundaries

The previously recorded E-ORACLE audit-file custody annotation is unchanged. It states that the receipt-pinned original audit bytes were unavailable and that the current observed candidate is not claimed as an exact restoration. The current audit script still hashes to `f814c0ae…d8853`, while E-ORACLE's expected hash in the annotation is `7b124f1f…a2466e`; this review neither repaired nor rewrote either annotation or the closed E-ORACLE receipt/report. The preexisting E-CHECKER-TESTS initial failure, native trace, report, receipt, and custody files remained byte-identical across this review.

The native read-only `probe.validate_receipt` accepted this XR receipt against the in-flight `XR-CHECKER-TESTS` state entry, and `coordination/state.json` had the same SHA-256 before and after validation. The first lookup attempted to obtain the review job from `coordination/spec.json` and failed with `StopIteration`. This is expected: the native probe's `make_state()` generates review jobs from `review_policy` rather than listing them in the extraction-only spec. That failed lookup did not write state and is not a scheduler defect.

Authored E-DELIVERY report, receipt, runner, README/RESULTS, wrapper, workflow, and demo source hashes were captured before and after this review; all 31 custody entries remained unchanged. The full source-bound delivery acceptance remains root-owned and pending. No production files, N4 implementation, N5 test sources, fixture/oracle/native evidence, E-ORACLE files, scheduler/Git state, or publication artifacts were changed by this review.
