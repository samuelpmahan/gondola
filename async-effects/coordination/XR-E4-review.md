# XR-E4 independent review

## Verdict

The current E4 harness and tests satisfy the frozen comparison and failure-detection contract. I found no blocking source issue and made no changes to E4 files.

## Evidence reviewed

Reviewed `check.mjs`, `check.test.mjs`, `adversarial.mjs`, `adversarial.test.mjs`, `scripts.mjs`, and the independent oracle in `reference.mjs`.

- The reference owns its own JavaScript state, request counter, outbox, messages, and audit. `createAsyncReference()` never imports Go state or reads candidate snapshots. Its own React tree is mounted in a separate root and receives the same fills, clicks, and replies as the two Go candidates.
- Each scenario creates isolated DOM and React Go WASM runtimes. Call-count assertions require one `init()` per host and check dispatch, completion, effect-drain, and audit calls at every recorded tick.
- Every tick compares state, tree, bindings, ordered messages, audit receipts, ordered transport log, and pending requests against the independent reference and across both Go renderers. DOM checks cover live container HTML and root `outerHTML`, renderer-reported HTML/disabled paths, the input path/value/disabled property, disabled-control paths, and all captured input/button properties.
- Fixed scenarios cover canceled/reset late replies, duplicate and out-of-order replies, error/retry, edits while pending, and renderer swaps around replies. Generated scripts use deterministic xorshift seeds, bound actions to 40, and only construct reply actions from request IDs the script model has allocated; repeated replies remain possible for duplicate checks.
- Native comparison is part of the pass condition. Each nonempty scenario writes native tick inputs and runs `CompareInteraction` for both renderers. A missing comparator produces an `unavailable` result that is converted to a mismatch; an invalid executable or nonzero comparison also fails the run. The existing native comparator covers its established fields, while the browser comparator independently checks audit, transport, input properties, and the other async-specific fields.
- E6 validation freezes an exact 11-probe inventory, rejects missing, duplicate, unknown, and mislabelled probes, and records any probe with `pass !== true` as a mismatch. Real-Go lifecycle cases are distinguished from the explicitly synthetic transport/facade fault cases.

## Fixed-run result

`async-effects/build/e4-fixed-diagnostic-recheck.json` records seeds `20261030,20261031`, zero generated cases, 16 fixed scenarios, 122 initial/action observations, zero mismatches, 32/32 native comparisons matched, and all 11 adversarial probes passing. The earlier `e4-fixed-diagnostic.json` is retained as pre-fix evidence; it contains a failed reset probe from before the E6 correction. The recheck confirms that the current probe now sees the late ID 1 completion classified stale while ID 2 remains pending.

The generated two-seed run remains a separate gate and is being run by E5. No claim about its result is made here.
