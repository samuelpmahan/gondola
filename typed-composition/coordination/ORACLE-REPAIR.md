# Final oracle repair contract

This closes XR-T5 and the frozen F-RUN's 12 disabled-input findings. Go application semantics are unchanged. No accepted parity claim is made until the repaired checker, independent controls and fresh replay pass.

## Disjoint ownership

- O-FIXTURE/N5: fixture.mjs only; define the observation producer and coordinate names with checker/tests. No checker edits.
- O-CHECK/N2: check.mjs only. No test/fixture edits.
- O-TEST/N4: check.test.mjs and bounded checked-in testdata if needed. Positive fixtures must pass before mutation assertions. No checker/fixture edits.
- O-PROBE/N3: independent offline mutation probe/results in coordination/reviews only. Preserve original XR-T5 probe and compare repaired behavior.
- O-BROWSER/N6: independent actual-browser disabled/focus probe/results in coordination/reviews only. Do not edit the demo or harness.
- O-PINS/N1: refresh inherited-pins evidence/report after R-T3, verify historical receipt restoration and original manifests; no production edits.

All six jobs can author their own artifacts concurrently. O-CHECK consumes the fixture schema below. O-TEST can write failing causal tests first. O-PROBE/O-BROWSER may prepare code immediately; their final execution gates on O-FIXTURE/O-CHECK/O-TEST freeze. Root alone runs the final default replay and controls Git. Each job has its own report/receipt; native independent reviews exclude authors.

Gate refinement: O-BROWSER's selected independent probe consumes the existing demo and frozen Go/core host assets, not the edited fixture or checker. It may execute against those hash-pinned inputs before oracle freeze, without shared asset rebuilds. O-PROBE still requires the repaired checker and stable positive fixture. This refinement changes no source ownership or acceptance criterion.

## Disabled admission observation

For enabled input sanitation witnesses, preserve requested/effective value, actual event Step, key and expected effective value. Use `mode: dispatched` if adding a discriminator.

For a disabled control, observe a real native `.click()` first. Sample the physical value and full manager snapshot before/after that attempt and count actual manager dispatch calls; there must be zero native handler calls and no change. Do not assign input.value programmatically and call that a disabled user action. A direct Go guard invocation may follow, but must be separately labeled and cannot be counted as a browser-delivered event. Its returned snapshot/messages/dirty state must remain unchanged.

Every requested input witness gets an explicit observation. A disabled LF input has `mode: blocked-disabled`, requested/key, beforeValue/afterValue, nativeDispatches:0, eventValue:null, and a separately identified direct-guard probe if performed. The checker derives expected enabled/disabled mode from the native Go state/tree, requires the channel, and verifies unchanged physical value and Go state for the blocked mode. Missing observations never mean success.

## Required focus evidence

The fixture swaps a candidate session after its first enabled input with a prepared noncollapsed selection. The checker derives which action must produce this witness and requires focusReplacement plus immediate physical key/selection observations. Missing/null witnesses at required actions fail. The positive witness must bind the intended input key and noncollapsed range before/after a real renderer replacement, and unchanged state. Reference physical focus is sampled in its own action phase; do not restore focus before post-action observation.

## Actual effect and transport ordering

managerEffects, transportCalls, managerCalls and transportClock are required actor channels, including empty arrays/zero clocks. The current fixture's local append counter is NOT a global clock: it pushed per-transport sequence numbers without incrementing side.transportClock.sequence. Correct this with an actual shared per-side monotonic invocation clock. Every actual transport invocation, including an ignored cancel, is recorded at entry; local per-transport logs may keep separate counters.

The checker validates each actor's own side/session provenance, ascending contiguous global sequence and clock deltas, not just candidate/reference equality. It derives expected start/cancel invocations and order from recorded Go Effects command drains and Go disposal bundles, accounting for declared once-only cancellation ownership. Flattened commands must agree with actual transport invocations. Reordering both actors' logs, deleting both channels, or omitting a command execution must fail independently of bilateral parity. Delivery events are observed separately from command starts/cancels.

## Error result scope

The existing reference has independently worded errors. Rejection outcome plus complete unchanged state/tree/messages/dirty receipts are compared. Exact human-readable error text is explicitly untested; do not claim verbatim error equivalence. Preserve original error strings in raw evidence. Wrong-parent/stale-revision controls still require all implementations to reject without mutation. A changed rejection into success must fail. Add structured error codes only in a future application-contract change, not as incidental checker repair.

## Proof gates

Tests must reject missing focusReplacement at its required action, missing effect/transport channels on both actors, bilateral transport reversal, omitted command execution, a changed rejection outcome, and inconsistent disabled observations. The independent offline probe must report the formerly missed cases as failures under the new contract; changing only error text may remain accepted under the explicit error scope. The independent browser probe must demonstrate disabled native suppression and physical focus without relying solely on fixture claims.

Record exact commands, source hashes, positive controls and original failures. Reports must distinguish source implementation, negative controls, default replay and full inherited runner outcomes. No worker reruns the full inherited suite; root owns that running process.
