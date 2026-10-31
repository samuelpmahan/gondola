# E-NATIVECLI: publications Go CLI adapter

**Outcome: mixed_change.** Added `cmd/compiled-publications-native/**` as a PR16-style native trace adapter for the typed publications fixture. It invokes the Go `publications.Init`, `publications.Update`, and `publications.View` functions directly; it contains no publication reducer or queue.

## Trace and validation

The CLI defaults to `fixtures/compiled/publications/scenario.json`, validates schema/package/component identity, and emits `gobi.compiled-publications-native/v1`. It retains the PR16 event/step envelope while adapting to `Publications.State`, including the typed `Input` and publication queue. `snapshotState` copies both `Children` and `Publications` so later updates cannot rewrite earlier trace states.

For `click`, `disabled-action`, and `stale-callback` records, the CLI validates nested `action` metadata against flattened path/event/value and resolves the Go View handler at the recorded path. Disabled actions, stale callbacks, and renderer swaps create no Go step. Event rows preserve nested actions, flattened fields (including explicit empty values), source-event and renderer metadata, and effect tokens. A row's `message` is the resolved dispatched message; no-tick rows serialize `message:null`. Effect replies must consume a live pending request token, and Go-emitted request/cancel effects retain the PR16 closed profile.

The final capture was regenerated after N1's explicit empty `Reply` initialization. It pins `fixtures/compiled/publications/app.go` SHA-256 `c9865a8d2c6e4da3568f1e288d3506144d94c5f987006f9128878acd479fa0bb`. Its bytes match the prior capture because the explicit empty value does not alter serialized runtime output; the pre-regeneration file is preserved as a rawlog.

The trace contains **50 events and 45 Go dispatches**. A capture of value 4 remains queued after the `oak` counter reaches 7; the old input revision is rejected, stale child and parent generations are rejected, and the remounted publication is accepted. Duplicate and noncanonical delivery IDs are no-ops. Parent removal records cancellation in this order: `child:elm:g4:r1`, `child:oak:g2:r2`, then `parent:g1:r2`.

## Verification

Focused Go 1.24 tests passed uncached (`-count=1`), with four top-level tests and two reply-correlation subtests. Coverage includes canonical event/step counts, nested/flattened action agreement, null messages for no-tick events, typed capture snapshots, queued publication retention across reuse/remount, request-reply correlation, cancellation order, malformed action rejection, and independent snapshot slices.

The final native CLI capture and a read-only trace audit pass are pinned in `coordination/rawlogs/E-NATIVECLI-native-capture.json` and `E-NATIVECLI-trace-audit.log`. The capture is 1,148,369 bytes, SHA-256 `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d`.

## Compiler integration evidence

An earlier build omitted `effect.cancel` from AppIR while cancellation was present in the Go fixture. N2's analyzer fix is reflected in the current proof builds: React and DOM AppIR now have identical SHA-256 `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f`, and both declare `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. Their captured CLI results report `ok=true`, zero diagnostics, and 67 outputs each. This packet only independently inspected those existing compiler artifacts; it did not run compiler builds or browser tests and makes no full mounted-runtime acceptance claim.

## Scope limits

No full inherited pipeline, compiler build, browser run, npm installation, Git operation, or native state write was performed. Earlier CLI assertion corrections and superseded captures remain in rawlogs.
