# Deterministic multi-root replay trace

`check.mjs` is both the browser replay driver and a fail-closed report checker.
It mounts three Go/WASM sessions beside an independent React reference model,
executes each scripted action against the named root, captures a full tick after
the action settles, builds native Go comparison segments, and exits nonzero if
any observation or native segment differs.

## Run

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  /tmp/gondola-node22/node_modules/node/bin/node multi-root/check.mjs \
  --output multi-root/build/replay-default-final.json
```

The defaults are seeds `20261030` and `20261031`, 30 generated scripts per
seed, and a maximum of 40 actions per generated script. `--cases 0` runs the
three fixed witnesses only. `--seeds`, `--cases`, and `--max-actions` choose a
reproducible smaller or larger run. Required build assets and the loopback HTTP
lab must exist before the CLI starts.

The report contains the exact top-level fields:
`status`, `seeds`, `scripts`, `fixed_scripts`, `generated_cases_per_seed`,
`max_actions_per_generated_case`, `actions`, `observations`,
`native_comparisons`, `native_matched`, `mismatches`, `mismatch_count`,
`required_channels`, `negative_controls`, `browser`, `toolchain`, `scenarios`,
`native_inputs`, `native_comparison`, `commands`, and `limits`.

Each mismatch has the shape
`{seed, script, tick, actor, channel, expected, actual, action}`. The process
returns a failure status if a scenario fails, a required actor or channel is
missing, any session or event-order invariant fails, or a native comparison
does not match.

## Observations and invariants

Every initial/action tick captures candidate and reference observations for
all roots. Channels include state, Gobi tree, bindings, ordered messages,
completion audit, ordered transport events, server request records and pending
work, reported and live DOM, input properties, focus/selection, session IDs and
generations, and lifecycle events. The validator rejects missing actors or
channels, active session aliasing, synchronized no-op dispatches, missing
dispatch receipts, unordered event receipts, disposed-session revival, and
empty native frames.

Lifecycle events are checked against the replay, not accepted as caller data.
For each tick, the checker derives the expected ordered event records from the
action and before/after observations. It requires contiguous global sequence
numbers, exact root/participant/session ownership, mount/dispose generations,
and action-specific event details. Each actor's `lifecycleEvents` array must
equal the cumulative projection of those validated tick events. Candidate and
reference histories are also parity-compared after excluding candidate-only
renderer replacement/failure events and normalizing independent session IDs,
backend labels, and interleaved sequence numbers. The remaining kinds,
generations, request details, and relative order must match.

Seeded schedules treat `maxActions` as a hard ceiling. A two-action focus pair
is emitted only when both actions fit the sampled schedule limit; forced held
request releases are then appended only while the same global cap has room.

Focus is compared per root after explicit focus and through later renderer
replacements. Non-collapsed selection direction is checked exactly. Direction
is normalized to `none` only for collapsed selections (`selectionStart ===
selectionEnd`), where browsers may report different direction values for the
same caret position.

The reference uses one independent `createMultiRootReference()` application
model per session and mounts React into separate frame documents so each
reference root has its own active input. Candidate replacement is given its
existing focused input immediately before the host swap, allowing the real
host to capture and restore selection. This is observation setup; the replay
does not patch or synthesize host focus state.

The HTTP lab exposes cancellation asynchronously. When a repeated save is
expected to cancel a previous held request, the driver waits up to 10 seconds
for the new request to be held and the previous held request to reach the
server's `cancelled` state before capturing that tick. It still compares the
ordered candidate/reference transport logs, so the wait cannot hide a missing
or out-of-order cancellation event. A timeout fails the scenario.

## Native comparison envelope

For each root session generation, `nativeSegments` contains a non-empty array
of `{tickIndex, reference, candidate}` frame pairs. Each frame has
`{Index, Step, State, Tree, DOM, Pixels, Mutations}`. `Step` is the action
path/event/value from the preceding tick; reference and candidate envelopes
are passed to `cmd/compare-interaction` as `golden.Ticks` and
`candidate.Ticks`. Native input JSON files are retained beside the report.
Segments are keyed by root, session ID, reference session ID, and generation,
so remounts cannot silently merge with earlier traces.

The compact verification record is
[`evidence/replay-final.json`](evidence/replay-final.json). It records the
full-run report hash and counts without duplicating the multi-megabyte raw
trace. Earlier failed runs are kept as compact summaries under `evidence/`;
their original raw reports remain in ignored `build/` artifacts.
