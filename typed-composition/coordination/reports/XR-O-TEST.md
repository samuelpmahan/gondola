# XR-O-TEST — independent review of oracle tests

## Decision

**Accepted.** The positive scenario builder is self-contained for the checker tests, and each requested mutation has a causal clean baseline before it is altered. The tests exercise the intended checker invariants instead of relying on candidate/reference differences alone.

## Reviewed

- `typed-composition/coordination/reports/O-TEST.md`
- `typed-composition/check.test.mjs`
- `typed-composition/testdata/check-positive-scenario.mjs`
- Current checker and fixture interfaces for context

I did not rerun the author's 12-test command, consistent with the review assignment. This decision is based on source review; it does not add a replay or browser result.

## Findings

- `positiveScenario()` creates a fresh scenario and asserts `validateScenario(scenario)` returns no issues before every mutation test. The helper derives full native/model frames from the independent JavaScript reference, constructs both browser actors and their state/tree projections, and needs no built browser bundle or ignored build output.
- The baseline includes enabled input observations, a blocked LF witness with unchanged physical value and snapshots, a native click with zero click/input/manager dispatch counts, and a separately labeled direct Go guard. Its direct-guard manager call is distinct in the observation metadata from the native event count.
- The focus mutation removes the candidate witness at the derived required action and asserts the precise `focus.replacement.missing` issue.
- The bilateral channel mutation deletes all four required fields on both actors and asserts missing-channel/invalid-clock issues for each side.
- The bilateral cancellation reversal preserves a contiguous clock by resequencing both logs. It asserts per-actor cancel-ID mismatches against the manager's disposal command order, so candidate/reference parity alone cannot make the mutation pass.
- The omitted-command case removes the final cancel from both actor logs and adjusts the clock. It asserts a command-count mismatch for both sides.
- The rejection test changes the wrong-parent result to success and checks that the candidate operation outcome mismatch is reported. Its prose-only mutation changes error wording across native, model, both browser outcomes, and manager-call results, then asserts no issues, matching the explicit rejection-outcome contract.
- The disabled-input test starts from a passing scenario for each mutation and independently changes native-dispatch count, physical after-value, and native post-action draft. The assertions target the dispatch, physical-value, and unchanged-state failures respectively.

The helper's synthetic browser evidence is appropriate for checker mutation tests; it is not presented as actual-browser or native replay evidence. The O-TEST report also keeps those integration claims outside its scope.

## Reviewed hashes

- `typed-composition/check.mjs`: `fea6e333b301a010fab306475b2d9b5eae8c2b918b8defa4045c8384b8f1d422`
- `typed-composition/check.test.mjs`: `ea153f9dc5b2b6a9a70a9ffec13786434c6e48490e95c9b9349ed8c293a6dc76`
- `typed-composition/testdata/check-positive-scenario.mjs`: `9012ba366e959cecd8791c25c1f35267f9dd822394427cb219af8b094b163174`
- Current `typed-composition/fixture.mjs`: `854dfae39c9c0c32d3955e9158bd5656e33f29641b52d3544d04e9bd3302020c`

## Scope limits

This review accepts the causal focused test design and self-contained positive helper. It does not accept an integrated parity claim, validate the default seed population, or replace the separate actual-browser mutation and fixed/full replay gates.
