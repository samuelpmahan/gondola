# O-CHECK — oracle checker repair

## Outcome

Implemented and froze the bounded checker repair in `typed-composition/check.mjs`. The checker now requires the observation channels named by `ORACLE-REPAIR.md` and independently validates disabled input, focus replacement, and transport execution evidence. This is source and focused-test evidence only; no seeded replay or full inherited runner was run, so no integrated parity result is claimed.

## Changes

- Input observations are required for every declared `inputWitnesses` action. The expected enabled/disabled mode is derived from the preceding native frame's session snapshot and actual input node attributes. Enabled witnesses bind requested/effective values to the actual event Step and manager dispatch call. Disabled witnesses require unchanged physical value and Go snapshot, a real disabled `.click()`, zero native click/input events and manager dispatches during that click, empty dirty receipts, and a separately labeled direct manager guard when present.
- Focus replacement is required at the first eligible enabled input action per candidate session: the checker derives eligibility from the native tree/state, input event, and value length. It checks the intended key, noncollapsed backward selection before and immediately after renderer replacement, settled selection, physical reference focus in its own actor phase, and identical Go snapshot/tree immediately before and after replacement.
- Every actor frame must include `managerEffects`, `managerCalls`, `transportCalls`, and `transportClock: {before, after}`. The checker validates the global clock chain, event sequence, actor side, owning session and host generation. It derives start/cancel invocations in manager-call order from successful Go `effects` results and `disposeTree` bundles, then matches every invocation and order against actual transport events. It also tracks request state to validate ignored/once-only cancellation. Delivery is checked separately against `complete` actions while remaining part of the shared clock.
- Operation errors are compared by rejection outcome, not prose. The wrong-parent and stale-revision negative controls still require rejection and unchanged complete state/tree/messages/dirty receipts.

## Verification

Commands run from the repository root:

```text
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check typed-composition/check.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test typed-composition/check.test.mjs
```

Both commands passed. The focused suite passed 12/12 tests, including the positive scenario and negative controls for missing required focus, missing bilateral effect/transport channels, bilateral transport reversal, omitted disposal command execution, rejection-to-success mutation, error-prose-only changes, and blocked disabled input value/state/native-dispatch evidence.

The fixture author separately reported a focused actual-Chromium preflight for enabled LF, blocked LF, focus snapshots, and global clock deltas. The checker source was frozen only after the positive test scenario reported zero issues and the focused test suite passed.

## Evidence hashes

- `typed-composition/check.mjs`: `fea6e333b301a010fab306475b2d9b5eae8c2b918b8defa4045c8384b8f1d422`
- `typed-composition/check.test.mjs`: `ea153f9dc5b2b6a9a70a9ffec13786434c6e48490e95c9b9349ed8c293a6dc76`
- `typed-composition/fixture.mjs`: `fe196bcd50805e2f954786533a564b0328d5bce5300e3a92e3473038e855a278`

## Limits

The report does not include the default replay, full inherited suite, or independent XR-T5 mutation/browser probe outcomes. Those remain separate gates owned by root and the independent probe workers. Existing source evidence records the repaired baseline gaps: six disabled LF witnesses in the frozen full run, optional required-focus validation, bilateral transport log mutation blindness, and error-text normalization that did not distinguish an altered error from the documented rejection-outcome contract.
