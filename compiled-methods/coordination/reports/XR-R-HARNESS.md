# XR-R-HARNESS

**Decision: accepted.** N2 repaired the wrong-message mutation control so it preserves the trace's lowercase message shape and changes only the message value. The new test rejects the semantic `message.name` difference, rather than passing because of malformed object shape. The repaired checker rejects all four explicit mutation controls, and the fresh fixed-fixture matrix matches its retained native, direct-module, browser, and swap evidence.

## Review findings

- The native and direct trace records both use `gobi.trace/v1`; at tick 1 the actual message is `{ "name": "childAdd", "arg": "" }`. The repaired vector changes that message to `{ "name": "parentAdd", "arg": "" }`, preserving the same lowercase fields and empty arg. The observed rejection is `$.mutation.message.ticks[1].message.name: value differs; expected "childAdd", got "parentAdd"`. `check.test.mjs` asserts this reason and rejects a reason containing `object field set differs`.
- The other mutation controls are also explicitly detected: wrong method state, wrong callee provenance, and wrong DOM. Raw `methods.check.json` lists all four as rejected.
- N2 corrected the symbol-count wording accurately. The frozen method contract and AppIR contain 10 receiver methods, 13 symbols in the methods package including its three roles, two counter dependency functions, and 15 symbols total.
- I compared raw native/direct traces and each browser profile's normalized application trace. All match. The matrix has 19 ticks, 18 actions, 14 enabled dispatches, suppressed ticks `[7, 10, 11, 18]`, 19 oracle and physical snapshots for each browser profile, and 18 renderer swaps.
- The N2 run manifest's 188 source pins, 149 compiler/native pins, and seven run-evidence pins were recomputed with SHA-256 and byte counts. All match, and the source/output pin snapshots are identical before and after checking. I also rehashed all 11 entries in `preserved-before.sha256`; the earlier E-HARNESS report/receipt, XR--HARNESS report/receipt, and original attempt-04 artifacts are byte-identical to their recorded hashes.
- N2's report hash matches its receipt, and the repaired `check.mjs`/`check.test.mjs` hashes match the receipt. The retained Node log reports 10/10 tests. The full run used Node 22.23.4, Go 1.24.0, and local Chromium 153.0.8010.0; this is not managed-CI evidence.

The independent recomputation is recorded in `evidence/reviews/xr-r-harness/audit.json`, with its read-only audit script beside it. R-HARNESS and its outputs were not modified by this review.

## Limits

Acceptance covers the repaired mutation control and its pinned fixed-fixture run. It does not extend the fixture's runtime claims or establish managed CI, generalized composition, Manager semantics, session ownership, or cancellation. N3 did not rerun tests, builds, the matrix, or the N4 analyzer lane.
