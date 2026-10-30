# F-MODEL — final composed trace closure

## Outcome: confirmed reuse

The fresh accepted replay closes the evidence gap recorded by the historical `A-MODEL` review. Its summary SHA-256 is `b01f01ccb5ede1a98e20fe5f74fa617cd191ca0a2851931a3744e1b6d59497d7`; the current checker, fixture, scripts, and other 10 source/build pins match the replay manifest. All 63 scenario shards and the one negative-control shard match their recorded hashes. The replay is `matched`: 63 scripts, 1,591 actions, 1,654 ticks, 5,176 observations per actor, 546/546 ordinary native comparisons, one matched negative-control native comparison, and zero ordinary mismatches.

## Closed lifecycle witnesses

- In the 29-action nested disposal witness, oak reaches four rows with saved requests 1 and 2 still pending; the two additional rows create no requests. Its Add control is disabled at the cap. Across 212 disposal actions, the 424 candidate/reference disposal results' returned Go command bundles match the actual global transport cancellation invocation order; no mismatch was found. The fixed case emits cancellation in postorder for session IDs 3, 2, 4, then 1 (request IDs 1 and 2), while the sibling root remains active.
- The 21-action replacement witness retains focused input selection through the first three targeted renderer swaps; the final replay also detects the injected blur control.
- In the 18-action stale-delivery witness, old seed session 13/generation 1/request 1 is released only after orchard/fruit/seed are recreated as sessions 14/15/16, generation 2. The recreated seed has no request 1. The recorded before/after active snapshots, audits, and manager tree are unchanged by delivery to the retired callback.
- The replay detects the cross-session cancellation-order mutation and bilateral mutations of Add-at-cap, Reset-empty, and Up-first-row disabled state.

The final execution record binds the same summary hash and reports exit code 0, all 64 shard hashes verified, 547 nonempty native envelopes, 34 Node tests passed, and the external blur control detected. No tests were rerun for this closure review.

## Scope

The JavaScript collection reference maintains its own collection state and tree projection, independent of Go/WASM and the candidate renderer. Both actors use the same session-tree host adapter, however, so candidate/reference parity alone does not establish independent host-lifecycle correctness. The finite direct tree, disposal, transport, control-state, and stale-callback expectations in the repaired checker provide the lifecycle evidence described above; this review does not claim universal equivalence or exhaustive lifecycle coverage. The unchanged inherited runtime gates were reused from the earlier zero-exit full run; the affected final Node/browser/native gates were rerun. Fresh CI full-entrypoint validation remains pending.
