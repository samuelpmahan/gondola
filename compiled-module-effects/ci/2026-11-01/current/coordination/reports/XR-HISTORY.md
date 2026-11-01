# XR-HISTORY — independent history-copy review

**Worker:** N1  
**Job:** XR-HISTORY  
**Decision:** `accepted` for materialized byte durability only

## Packet and source-index integrity

The current E-HISTORY report, receipt, and 1,751-record index match their immutable E-HISTORY seal. I independently rehashed all 1,751 files indexed by E-HISTORY; every byte count and SHA-256 matched. The copied E-DELIVERYCONTRACT raw index also matches the current frozen source index byte for byte at SHA-256 `da9064ca142f4037bb57f3cdc629d88a9a8550d2c45382ce56d38912ea88aa7d`.

I verified the three copied local inventories against their original source-index pins. For all 1,740 mapped output/evidence files (406,211,460 bytes), the original source path is still a regular file matching its frozen size/hash, the source-before and source-after hashes match that pin, and the materialized destination is a regular file with the same bytes and SHA-256. Relative source/destination maps are complete and unique. This independently confirms the E-HISTORY copy manifest’s zero missing files and zero source/destination mismatches.

| Attempt | Frozen status | Output | Evidence | Runner source snapshot |
|---|---|---:|---:|---|
| `attempt-20261101T035129308Z-2-78bd7201` | `failed_demo_assertion` | 432 files / 133,457,259 bytes | 4 files / 60,144 bytes | Exact snapshot absent (`false`); no reconstruction claimed |
| `attempt-20261101T035317671Z-2-6e206183` | `failed_archive_inventory` | 642 files / 135,938,988 bytes | 4 files / 56,450 bytes | Exact snapshot present |
| `attempt-20261101T035413961Z-2-55fe7cd9` | `author_diagnostic_passed` | 642 files / 135,939,060 bytes | 16 files / 759,559 bytes | Exact snapshot present |

For attempt 01, both the source-pin map and failure trace remain in the copied inventory; the source index explicitly marks its exact runner snapshot unavailable. The first copier’s empty-destination guard failure is separately preserved. Its traceback shows it stopped at the pre-copy guard when its own redirected logs already existed; the subsequent successful copy is the only materialization run.

## Canonical archive copy

The canonical author archive and manifest match their original source-before/source-after hashes and copied destination hashes. The copied archive is 8,666,075 bytes with SHA-256 `eaedcc97d2bef10b16755400c9088a5cea7dd4f320d48b19356c3252b2bbce0d`; the copied manifest is 160,662 bytes with SHA-256 `364a9d86bf8d5e41fe4ea91581e27d077ac8c14090faf753ffad75fb7fef3f33`. The manifest lists 638 members. The frozen source index records an independent-consumer pass. I verified the archive and manifest copy pins, but did not rerun that consumer or inspect this as a new acceptance run.

## Decision boundary and reviewer process

I accept E-HISTORY’s durability result: the inventoried historical bytes and canonical archive have been copied and can be reverified from the frozen pins. This is not clean-source qualification, a clean E-RUN, or an acceptance of the author diagnostic attempt as release evidence. No suites or archive consumer were rerun.

Two early reviewer-only audit-helper invocations stopped on reviewer-script defects (a variable typo and an incorrect expected source-index path). Their output is preserved in the indexed `audit-first-pass.*` and `audit-second-pass.*` files. The corrected independent scan passed; no history/source/production files were modified by those probes. The final command, version, and result are recorded in `rawlogs/XR-HISTORY/commands.log` and `audit-result.json`.

No original E-DELIVERYCONTRACT inventory, output, evidence, or source index was written by this review. All reviewer output is confined to `rawlogs/XR-HISTORY/`, this report, and its receipt. Evidence is indexed by `rawlogs/XR-HISTORY/index.json`.
