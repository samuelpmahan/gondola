# O-TEST — causal tests for the composition oracle

## Outcome

The positive control passes `validateScenario` with zero issues. Six mutation tests then demonstrate the required oracle gates: focus replacement, bilateral observation channels, Go-derived invocation order, complete command execution, rejection outcome, and blocked disabled-input observations. The focused suite passed **12 tests, 0 failed**.

## Evidence and method

The self-contained positive scenario helper is `typed-composition/testdata/check-positive-scenario.mjs`. It derives native/model frames from the independent JavaScript composition reference and uses no ignored build output. Its 14 public `{method,args}` actions include two enabled edits, two pending saves and effects drains, a read-only transition, an LF disabled-input witness with a native-click observation and separately labeled direct manager guard, a wrong-parent rejection, and subtree disposal with two ordered cancels. Every candidate/reference frame carries managerEffects, managerCalls, transportCalls, and a `{before,after}` transport clock.

Every mutation test first calls `positiveScenario()`, which asserts the unmodified helper validates with `[]`. The cases then mutate one claim at a time, except the bilateral tests deliberately mutate both actors so parity alone cannot reject them:

- Removing the required candidate focus witness reports `focus.replacement.missing`.
- Removing all four channels from both actors reports missing channel/invalid clock issues for candidate and reference.
- Reversing both actors' final cancellation logs and renumbering the contiguous clock reports command-ID mismatches against each actor's Go disposal bundle.
- Omitting the final cancellation on both actors and adjusting the local clock still reports an expected-versus-actual command-count mismatch.
- Converting the candidate's wrong-parent result to success reports `operation.native-candidate`. Changing only error prose in native/model/candidate/reference and recorded manager-call results remains accepted, as required by the contract.
- Changing the blocked input's physical after-value, reporting a native dispatch, or changing the native post-action draft each produces the corresponding blocked-input failure.

**Red mutation outcomes:** all six causal test groups produced their asserted rejection fields (including both actors for bilateral-order and omitted-command mutations). The control with changed error wording stayed clean. **Green control outcome:** the untouched scenario returned zero issues in the standalone validation command and in every test that prepared a mutation.

Initial helper validation exposed fixture construction issues (missing focus tree witness, duplicate direct-guard dispatch record, and incomplete cancellation ownership payload); these were corrected in the testdata helper. A separate checker comparison defect for blocked-state invariance was fixed by N2 before the focused suite. The final positive helper reports zero issues.

## Verification

Command:

```sh
node --test typed-composition/check.test.mjs
```

Result: **12 tests passed, 0 failed, 0 skipped**. The six new causal tests all passed after their positive control was validated.

The positive scenario can be serialized without build artifacts using the exported `positiveScenarioJSON()` helper. No full replay, browser run, native build, seeded replay, or inherited runner result is claimed here; those belong to the integration owner and independent probes.

## Scope

Only `typed-composition/check.test.mjs` and the bounded helper `typed-composition/testdata/check-positive-scenario.mjs` were authored for O-TEST. No checker, fixture, model, script, production, or Git changes were made by this job.
