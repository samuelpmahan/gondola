# XR-O-FIXTURE — independent review of fixture observations

## Decision

**Accepted.** I reviewed the final fixture source, O-FIXTURE report/receipt, oracle repair contract, fixed replay report, and retained raw shards. The final fixture SHA-256 matches the assigned `854dfae3…` hash. The disabled-input, input-observation, focus-order, transport-clock, and mount/disposal generation evidence is present and agrees across the checked raw data.

## Fixed replay and source identity

Current `fixture.mjs` SHA-256 is `854dfae39c9c0c32d3955e9158bd5656e33f29641b52d3544d04e9bd3302020c`, matching both the O-FIXTURE report and `generation-fixed-report.json` source pin. All 49 report source pins match current files. The report itself is `status: matched`, with three fixed scripts, 63 native frames, 126 candidate/reference frame comparisons, zero mismatches, and one browser-only lifecycle probe. I checked the sizes and SHA-256 values of all six raw shards against the retained manifest; each matches.

This is the fixed-only report described by O-FIXTURE. It is not the root-owned default seeded replay or full inherited runner.

## Disabled attempts and input observations

The fixture resolves a dispatch step to the actual rendered element and checks its current `.disabled` property. For a disabled input, it records the physical value and full manager snapshot, drains and records the dirty IDs, calls the element's native `.click()`, settles, then captures the physical value, full snapshot, and dirty IDs again. It counts actual manager `dispatch` calls only across that native click phase. It separately invokes the manager's Go/reference guard and stores that result and its before/after snapshots, dirty IDs, and call count under `mode: "direct-manager-guard"`.

Across the three fixed scripts there are six input actions. Two carry witness metadata; four do not. All six produce observations for both actors (12 total). The no-metadata case still derives `requested` and `expectedEffective` from the action step, and records the actual dispatched event step. Ten actor observations are `dispatched`; two are `blocked-disabled`.

The disabled case is `readonly-pending-reply`, action 8, with no input witness. Candidate and reference observations both show `nativeClick: true`, zero click/input events, zero native manager dispatches, identical full snapshots and physical values before/after, and empty dirty IDs. Each separately labeled direct guard is counted once, with identical snapshots and empty dirty IDs. The candidate side is the real Go manager; the reference side is the independent model.

For enabled input actions, the fixture retains requested/effective values, key, before/after physical values, the actual manager-call Step, event value, and native dispatch count. The two witness cases preserve the requested multiline strings and their effective browser values. The four actions without metadata still have complete observations instead of null/missing records.

## Focus timing

The fixture prepares a noncollapsed backward selection on the candidate input after its first enabled input. `replaceForFocusWitness` calls `host.replace()` and reads the live DOM focus, key, value, and selection synchronously in the same browser task, before awaiting `host.settled()`. `runScript` executes and captures the candidate before starting the reference actor, which is also recorded as `captureOrder: ["candidate", "reference"]`.

Four candidate focus witnesses are present. Each identifies `row-1-input` at path `2/0/0`; the immediate and settled samples retain selection `[0, 2, "backward"]`. The before/after snapshots and trees around replacement are equal, and the focus/range remain unchanged after settling. The replacements observed were React→GoDOM three times and GoDOM→DOM once.

## Shared transport clock and generation binding

`makeTransport` increments `side.transportClock.sequence` in the shared `append` helper and adds the same event to both the per-transport log and the side-wide log. `start` appends before duplicate checking or request mutation. `cancel` appends before changing request state or returning for an ignored call. `deliver` appends before invoking the saved callback. Thus each call is recorded before its externally visible follow-up effects; the `ignored` flag and prior state are included in the cancellation record.

I checked the retained per-action clocks for the fixed scripts. Per-side `before` values continue from the previous action's `after`; each action's transport events have exactly the contiguous sequence range `before+1` through `after`. The fixed scripts contain 16 transport invocations total. The retained-callback control separately records start, cancel, and delivery at sequences 1, 2, and 3 on each actor. No ignored cancel was exercised in these retained traces; the ignored-cancel branch is verified from the producer source, where it appends before returning.

The generation value originates in `multi-root/host.mjs`: mount allocates the root generation, passes it as the third argument to `transportFactory`, and stores it on the host record. The fixture captures that factory argument as `transport.hostGeneration`, then binds it to mounted-session metadata. Disposal history copies `transport.hostGeneration` before deleting the transport. In the raw frames, all 350 active/disposed lifecycle observations have a non-null generation, and each transport event's `(sessionID, hostGeneration)` matches its active or disposed lifecycle record. The observed value is 1 for these uniquely allocated root elements; this replay does not exercise remounting the same physical root to observe a later generation value.

## Limits

This review independently checked retained source, report, and raw evidence; it did not rerun the browser/native replay, the final default replay, seeded cases, tests, or inherited runner. The root-owned default replay remains separate. No production files were changed.
