# E3 author report

## Delivered

- Added an independent asynchronous save reference in `reference.mjs`. It owns its flattened editor/request state, monotonically increasing request IDs, ordered message history, start/cancel outbox, and copied completion audit. It does not import Go snapshots or Go transition functions.
- Added an independent React and ReactDOM 19.3.1 mount API (`mountReference`) alongside the pure model API (`createAsyncReference`). The tree projection retains the existing editor children and input binding, then adds Cancel, Status, and Pending at paths 5–7.
- Added fixed schedules for cancellation/reset late replies, duplicate replies, out-of-order success, error/retry, edits during pending work, and backend swaps. Added seeded schedule generation for seeds 20261030 and 20261031, 30 cases each, with no more than 40 actions per case. Reply actions carry explicit IDs already allocated in that script.
- Added pure Node tests for state transitions, command order, ID monotonicity across reset, exact completion messages/audit, errors and duplicates, invalid-input atomicity, copy isolation, projection, and deterministic script bounds.

## Verification performed

Command (after E5 built `async-effects/build/reference.bundle.mjs`):

```text
/tmp/gondola-node22/node_modules/node/bin/node --test async-effects/reference.test.mjs
```

Runtime: Node v22.23.4. Result: 7 tests passed, 0 failed. Ran Node 22 `--check` on `reference.mjs` and `scripts.mjs`; both parsed successfully.

Browser bundling and the end-to-end comparison were not run in this lane; E5 owns browser assets/build execution and E4 owns the browser harness.

## E3 author amendment: strict wire validation

After E1 tightened the WASM bridge, aligned the reference model with its exact JSON wire contract. Dispatch steps now require exactly `Path`, `Event`, and `Value`, all strings. Replies require exactly `ID`, `Value`, and `Error`; IDs must be positive safe integers and the two payload fields must be strings. Missing, null, wrong-type, and extra fields are rejected before transitions, messages, outbox, or audit can change. Updated all valid completion fixtures to pass all three fields and added atomicity and maximum-safe-ID checks.

E5 rebuilt `async-effects/build/reference.bundle.mjs` from the amended source. On Node v22.23.4, `node --test async-effects/reference.test.mjs` passed 8 tests, 0 failed; Node 22 syntax checks passed for `reference.mjs` and `reference.test.mjs`.
