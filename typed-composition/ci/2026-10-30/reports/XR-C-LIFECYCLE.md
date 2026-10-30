# XR-C-LIFECYCLE — independent bounded-sample review

**Decision: accepted.** I checked the fresh report, manifest, receipt, and five cited raw shards. All shard hashes and sizes match. The report covers 63 scripts; this review covers three fixed scenarios and two controls.

The fixed shards contain 23, 14, and 26 actions/native frames, with zero mismatches and browser errors. They show four candidate renderer replacements and none in the reference. Each preserves active `row-1-input` focus and selection `[0,2,"backward"]` before, immediately after, and after settling; snapshots and trees are unchanged.

For the read-only input, both actors record a physically disabled input, attempted `.click()`, zero events/dispatches, unchanged value and full snapshot, and empty changes. Each separately records one direct guard dispatch with unchanged snapshot/changes. The disabled-attribute control enables candidate `add` and produces four mismatch fields.

Transport order matches across actors: 2 events in each of the first two fixed shards, 4 in the third (8 per actor). In the retained-callback control, IDs 1/2 are disposed and 3/4 recreated; start, effective cancel (`ignored:false`), then late delivery (`previousState:cancelled`) are recorded. Candidate and reference each show zero Complete calls, identical before/after manager+DOM records, and empty changes.

Limits: only these five shards were reviewed, not all 63 scripts. Only host generation 1 is observed; new session IDs do not prove a later generation. No keyboard events or physical HTTP timing are covered. The cancel was not ignored; the delivery has no `ignored` field, so ignored-cancel semantics are unproven.
