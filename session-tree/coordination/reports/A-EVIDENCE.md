# A-EVIDENCE — composed evidence provenance audit

## Outcome: confirmed reuse of bounded historical evidence

This was a read-only audit of the saved M0 pins, inherited delivery manifests, session-tree archives, source snapshots, and Rebalancer allocation/dispatch records. I did not rerun the full suite or change production files, documentation, Git state, or any historical manifest. The outcome confirms that the cited archived runs and predecessor pins are internally consistent and preserved; it does not accept the current in-progress R-T5 source snapshot.

## Archive integrity and run lineage

Read-only archive checks opened each `.tar.xz`, read every regular member, parsed every JSON member, checked for duplicate member paths, and recorded archive SHA-256 values:

| Archive | Members | Content check | SHA-256 |
| --- | ---: | --- | --- |
| `preflight-traces.tar.xz` | 6 files | all 6 JSON files parsed | `e1034287c4c10e94fc49c38919fcf376bf6cc92d29a70ac00c2ba5e44e9c17c4` |
| `integration-failure-native.tar.xz` | 547 entries | 546 JSON files parsed; one directory | `bcf6b8d216cb6a31a2e0577d0e9f20e360c7fd0eac8b4fecb01b624df7211e06` |
| `replay-before-cancel-review.tar.xz` | 617 entries | 614 JSON files parsed; three directories; all 63 scenario shard hashes verified | `f849903f84729c0a31e82238884404f59a1df4c3c49ed576fc5ab13053761e3c` |
| `checker-before-cancel-order-review.tar.xz` | 4 files | four checker/fixture hashes match the original T5 receipt | `58deb053b424e599508f5aa08eae8293ac8cedfaee8f71a09717911a51c6b3cd` |

The early `replay-fixed.json` in the preflight archive reports `status: mismatched`, `mismatchCount: 451`, and only 250 retained entries in its `mismatches` array. T5's report explicitly records that this early diagnostic preview was capped at 250 and was not a clean result; later checker output writes full mismatch artifacts. I preserve that failed preflight as evidence and do not use it as acceptance.

The older serialization-failure archive contains **544** `replay-default-final-native/*.json` input frames plus `root-focus-negative-pre.json` and its repro. It contains no acceptance summary, no source snapshot, and no `.log` file. T5's report says the unsharded attempt failed during final JSON serialization and that its exact source snapshot and separate terminal log were not retained. The 544 archived inputs establish that comparator inputs survived; they do not reconstruct a successful aggregate result or the exact source that generated them.

Separately, the pre-cancel-review run has a successful recorded full-run exit (`full_runner_exit: 0`). The archived `replay-default.json` SHA-256 is `33a7dc92211bfd0fc551bd5f894b1a658d5ee59026a7bb70d7e1f070c404add8`, matching `full-run-before-review.json`, the full-run log, and the report metadata. It records 63 scripts, 1,587 actions, 1,650 global ticks, 5,150 candidate and 5,150 reference session observations, and 544/544 ordinary native comparisons. The archive holds 63 scenario shards whose individual hashes all match that summary, 544 ordinary native inputs plus the one negative-control native input, and one negative-control scenario with three findings. This was the pre-XR-T5-amendment run: `XR-T5` decided **amend** because it did not verify global cancellation invocation order, full disabled-state expectations, or stale delivery after same-name recreation. The passing old run therefore must not be represented as satisfying those review requirements or as the final repaired-source replay.

The four-file checker archive hashes are the original T5 frozen files in `receipts/T5.json`. The current source snapshot differs because subsequent bounded repair work changed five files. `source-assets.json` contains 22 source pins: 17 still match and five differ (`check.mjs`, `check.test.mjs`, `fixture.mjs`, `scripts.mjs`, and `scripts.test.mjs`). All seven recorded executed build-asset hashes still match. These source mismatches are consistent with the later witness/oracle repair work and make `source-assets.json` a **pre-repair snapshot awaiting refresh**, not evidence of unexplained corruption.

`oracle-repair-state.json` shows R-T4B completed and independently reviewed. R-T5 is actually dispatched to N5 and remains `running`; XR-R-T5 is `pending`, with no R-T5 or XR-R-T5 receipt. Thus current R-T5 changes are not accepted by this audit. Refresh the source/assets checkpoint and obtain the separate replay/review after R-T5 has a completed receipt.

## Preserved predecessor evidence

The root `SHA256SUMS` file has 24 M0 entries; `sha256sum -c SHA256SUMS` returned `OK` for all 24. `keyed-editor/evidence/final-m0-sha.log` and `renderer-conformance/evidence/final-m0-sha.log` each retain 24 `OK` lines and are byte-identical. The prior project coordination manifests and delivery manifests are tracked and have no working-tree changes, so this audit found no historical manifest rewrite.

I independently aggregated all seven predecessor `*/evidence/delivery-manifest.json` pin sets: 650 distinct paths, 646 exact current matches, no missing files, and four mismatches. They are exactly the entries documented in `inherited-pins.json` as pre-existing PR8 exceptions:

| Path | Older pin | Current hash |
| --- | --- | --- |
| `cmd/godom-wasm/main_wasm.go` | `44ba6a4deef747c0b89e221e2949cb97d948c4113083a0bd521be3ddf98c38d2` | `0088ad98470707502e8b84b5afeea7e85ea28ff3d6e892a1c3f5d22beaab49e7` |
| `cmd/godom-wasm/smoke.html` | `8d1b7af296af3d404b42d668619a08d3210efffa0ad1f8dc70a60c656cf28c1c` | `f0600bb6d260348d8db4fd17641179881980aafed830a488243379da0bb43a03` |
| `renderer-conformance/adapter.mjs` | `eb05f483296a9038aa597b5db46897a386c2a26ae5e5ff0dbc987a4546f79bf1` | `6e6a8c48c32866ad45c40a726a8422950928578745e83503e5dcc8c5e7462e51` |
| `renderer-conformance/adapter.test.mjs` | `520485785614a210c47187ba472edaabde5eb5d4a71585854b0ad3d1b1a57e05` | `2b3ae69e9f7bc3aa6a18a4e1d70b069370c09a1862aa17e8909003d741b68fdf` |

`inherited-pins.json` labels all four `unchanged_from_PR8: true`; the older renderer-conformance manifest contains the listed expected hashes. The PR8 commit object `6f3bc3057bc67f99580b086e00e34a2dfe7dda22` is unavailable in this local object database, so I could not independently recompute those four files directly from that commit. I report the historical-exception status as preserved provenance in the saved records, not as an independent local Git-tree verification.

## Allocation, actual dispatch, and repair receipts

The initial native author solve records 600/600, zero broken constraints, and six assigned author workers (`N1`–`N6`); the seventh platform slot is the lead, as stated in `coordination/PROTOCOL.md`. The native allocation and actual collaboration dispatch are separate records: the author `state.json` has six actual dispatch events with matching job, worker, and named agent. The later author review jobs also have separate cross-worker dispatch and receipts.

The repair graphs likewise contain actual dispatch and completion events plus receipts for completed work: R-T3/XR-R-T3, R-T4/XR-R-T4, and R-T4B/XR-R-T4B. The current oracle graph records R-T5 dispatched to N5 but still running and XR-R-T5 pending. Allocation records alone are not treated as executed work, and an active assignment is not treated as accepted work.

## Commands and limits

Executed only read-only integrity/provenance checks:

```sh
tar -tf <archive>                         # inventory each archive
python3 <read-only tarfile/hash/JSON audit>
sha256sum -c SHA256SUMS
python3 <read-only aggregate of seven delivery manifests>
git status --short -- <historical manifest/M0 paths>
python3 <read-only coordination dispatch/receipt summary>
```

No full runner, new replay, Go/Node test suite, publication, or production mutation was performed. Material limits are the missing exact source/log for the old serialization failure, the unavailable local PR8 Git object for direct historical-exception recomputation, and the pre-repair `source-assets.json`/unfinished R-T5 acceptance path. Prior 544/544 replay evidence is reusable only as a historical pre-amendment result with the explicit limitations above.
