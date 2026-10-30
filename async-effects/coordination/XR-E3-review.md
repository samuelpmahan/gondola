# XR-E3 independent review

**Decision: accept after the recorded amendments.** I reviewed `reference.mjs`, `scripts.mjs`, `reference.test.mjs`, the Go `asyncsave` session and view, and the WASM bridge. I also checked the freshly rebuilt browser bundle and compared the reference directly with the current-source Go WASM binary.

## Independence and projection

`createAsyncReference()` owns its own state, ordered messages, effects outbox, and audit receipts. The pure model has no imports from the Go app or host. Its only imports are React/ReactDOM for the separate browser mount. The reference renderer dispatches to that local model and accepts completions into it; it does not read Go snapshots.

The flattened state, view tree, bindings, message history, effect commands, and audit records match `asyncsave.Session` and `asyncsave.View`. A Node 22 comparison against `/tmp/async-save-wasm-bridge-review.wasm` matched the complete `{state, tree, bindings, messages}` snapshot and audit at **14 checkpoints** across edits, replacement saves, ordered cancel/start commands, active and stale replies, a duplicate, reset, and a new post-reset save. The next request ID after reset was `4`, confirming IDs are not reused.

The earlier review caught a boundary mismatch: the pre-amendment WASM decoder accepted `Value: null` for a string field while the reference rejected it. E1 amended the bridge to require exact canonical Step and Reply fields and string types; its fresh WASM smoke verified null, missing, and wrong-type rejection without state, message, outbox, or audit mutation. E3 then made its validators require exactly `{Path, Event, Value}` and `{ID, Value, Error}`, rejecting missing, null, wrong-type, and extra fields atomically. The final source and valid wire contract now agree.

## IDs, commands, replies, and atomicity

The model allocates monotonically increasing safe IDs, retains `NextID` through reset, emits cancellation before the replacement start, and records each valid completion as a reply message and typed audit outcome. Only the currently pending ID changes state. Stale, canceled, reset, duplicate, and out-of-order replies remain in history without overwriting accepted state.

The reference tests verify the projected initial state/tree, exact message and audit order, command order, reset ID non-reuse, copied snapshots/outbox/audit, disabled-action behavior, maximum safe reply IDs, and atomic errors. The focused invalid-input checks now cover required and extra Step/Reply fields, nulls, wrong types, invalid IDs, and invalid paths; state, messages, effects, and audit remain unchanged after rejection.

I replayed both default generated seed sets (60 scripts, maximum 40 actions each). Their 145 reply actions all refer to allocated IDs; 92 target IDs retired by cancellation, reset, or replacement (32, 19, and 41 respectively). The fixed schedules separately include canceled/reset late replies, duplicate completion, and out-of-order successful replies.

## Bundle and focused verification

The repository runner builds `reference.mjs` with the pinned esbuild from `interaction/node_modules` as a browser ESM bundle. A fresh source bundle to `/tmp` passed Node 22 syntax checking. The committed/current `reference.bundle.mjs` also passes `node --check` and contains no external React imports.

Command:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test async-effects/reference.test.mjs
```

Result: **8 tests passed, 0 failed** on Node 22.23.4. Node 22 syntax checks passed for `reference.mjs`, `scripts.mjs`, and the built bundle.

## Adjacent host finding

Review also exposed that two live hosts could share the global WASM API object: the second `init()` replaced the session and let the older host's ID 1 callback target the new session's ID 1 request. E2 addressed this with a runtime-object lease, rejection before the second init, and release on unmount and failed construction/cleanup. The independent E2 recheck passed 19/19 focused tests and reproduced ownership transfer and late-callback fencing against actual Go WASM. The host also documents that separate wrappers around the same underlying singleton cannot be distinguished by object identity. This finding is recorded here because it arose during the independence check; it is resolved outside E3's source scope.
