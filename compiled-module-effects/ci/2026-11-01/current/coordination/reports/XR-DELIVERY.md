# XR-DELIVERY — independent review

**Worker:** N1  
**Decision:** `amend`  
**Status:** `amend_required`

## Finding

The clean E-RUN reached a producer result marked `matched` for four scenarios across five profiles, including 16 capture-mutation controls and seven build-admission controls. The outer E-DELIVERY runner then failed before its own capture loop, independent outer oracle, browser timer demo, or archive step.

At `compiled-module-effects/run.mjs:542`, the outer runner resolves `record.native.stdoutPath` (and `stderrPath` on the next line). The conformance producer’s public `captures.*.native` record in `compiled-module-effects/conformance/run.mjs:210` contains only `path`, `bytes`, `sha256`, `command`, `commandCwd`, and `commandEnvironment`. The clean-run summary confirms both expected path fields are absent. This produced `TypeError: The "paths[0]" argument must be of type string. Received undefined` at the outer consumer boundary.

The native log paths exist in the producer’s per-scenario result but are not copied into the public summary record. Align the producer and consumer schemas, then rerun the complete clean pipeline. This review does not accept the source or claim the timer demo, archive, independent archive consumer, or final source-stability check passed.

## Packet and source review

The sealed E-DELIVERY report and receipt still match their seal pins. All eight files in the sealed source inventory match their recorded byte counts and SHA-256 hashes. The author-local source map remains intact at 199 source pins and 56 derived test-source pins; the failed clean run’s source snapshot is exactly the same map.

I reviewed the source-closure walk, Git-head and clean-tree checks, final source-stability checks, four-build admission checks, selected Go/Node test inventory, demo sequence, and archive inventory/consumer path. The final source map covers all 199 pinned paths with the workflow’s identical push and pull-request filters. No separate static blocker was found in those paths. The archive-helper tests passed in the author packet, but the clean run did not reach an archive.

## Clean E-RUN evidence

The preserved run `attempt-20261101T033637716Z-2-0d46ba94` used commit `88e7937e66fd1c8f36e5b5dd3224209b07c6eb33`. Its Git tree was clean, and all 199 source pins matched that commit. It completed four React/DOM parent/child builds, the targeted Go and Node tests (13 fixture Go tests, one module ABI regression, four compiler analyzer regressions, one compiler build-stage regression, and 32 Node tests), and the N4 conformance producer.

The producer reported four scenarios, five profiles per scenario, 178 native events, 58 native effects, 116 transport events, and 890 profile events. It reported 16/16 required capture controls and 7/7 build controls. The source and test commands, build index, producer summary, captures, failure, and source snapshots are retained in the E-RUN evidence index. The outer consumer error stopped the aggregate before the timer demo and archive stages.

## Diagnostic-index provenance

The E-DELIVERY seal pins the author report and receipt, but not the original rawlogs index. Before the clean attempt, I observed 134 entries in that index; its exact bytes and hash were not captured separately. The current `rawlogs/E-DELIVERY/index.json` is a later append-only logical superset: it contains those 134 non-E-RUN entries plus 77 clean-run entries, for 211 total. All 211 current entries verify, and all filesystem members are indexed. Its current hash is `e213cbfae088cd133ab0203f86dde9e640d9dae6999772b30a00129982dc27fe`; this is the hash of the extended index only, not the original frozen index.

The review audit and commands are indexed at `rawlogs/XR-DELIVERY/index.json`. Its `audit.json` records the seal checks, source-map equality, clean-run producer/consumer mismatch, and current-index verification. It explicitly records that the old raw-index byte version is unavailable and makes no hash claim for it.
