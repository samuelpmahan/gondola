# C-LIFECYCLE — fresh PR10 lifecycle evidence

## Result

**Outcome: confirmed_reuse (bounded sample).** Primary run `41123116952` / job `124294552127`; all ten workflows succeeded. Global report matched 63 scripts, not lifecycle coverage.

Five-shard sample: fixed scenarios 0000–0002 plus disabled/callback controls 0064–0065. Extracted shard sizes and hashes match the manifest; exact hashes and counts are in the receipt.

## Bounded observations and limits

- **Focus:** 4 candidate replacements, 0 reference; each samples before, immediately after, and after settling (12 candidate samples total). All keep `row-1-input` active with selection `[0,2,"backward"]`.
- **Disabled input:** 1 blocked input per actor (2): zero native dispatch/click/input events, unchanged value/snapshot, empty changes. A separate direct guard call per actor (2) also leaves snapshot/changes unchanged. No keyboard-event count; the disabled-attribute control is detected with 4 mismatches.
- **Transport:** 8 start/delivery events per actor (16 total). The pending reply arrives after read-only policy and saves its value. These are recorded transport calls, not HTTP timing.
- **Retired callback:** One control has candidate/reference records. Candidate Go disposes root 1/child 2, creates IDs 3/4, then receives a retained reply after an effective cancel (`ignored:false`). Go Complete calls stay at zero and fresh state/changes are unchanged; delivery has no `ignored` field.

All explicit generation values are `1`: fresh session IDs do not establish a later host generation. This bounded sample does not establish ignored-cancel semantics or later-host-generation coverage and is not exhaustive across 63 scripts. No tests, browser flows, builds, or checkers were rerun.
