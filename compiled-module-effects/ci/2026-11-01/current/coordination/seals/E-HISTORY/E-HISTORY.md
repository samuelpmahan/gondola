# E-HISTORY evidence materialization

**Outcome:** `confirmed_reuse`  
**Status:** `passed`  
**Worker / job:** N4 / E-HISTORY

## What was preserved

Materialized the regular files listed by all three frozen E-DELIVERYCONTRACT attempt inventories into `rawlogs/E-HISTORY/<attempt-id>/output/` and `evidence/`. Before copying, each local inventory’s byte count and SHA-256 matched the frozen `E-DELIVERYCONTRACT/index.json` pin. Every listed source file was present, regular, and matched its inventory size and hash. The copy procedure rehashed each source before and after copying and verified the destination bytes against the same pin.

| Attempt | Frozen result | Output files / bytes | Evidence files / bytes | Inventory SHA-256 |
|---|---|---:|---:|---|
| `attempt-20261101T035129308Z-2-78bd7201` | `failed_demo_assertion` | 432 / 133,457,259 | 4 / 60,144 | `bd0548494bc8610bb5d2869a2d5feefec3dab07a138f8e46eb55ea18fce65a92` |
| `attempt-20261101T035317671Z-2-6e206183` | `failed_archive_inventory` | 642 / 135,938,988 | 4 / 56,450 | `29eccfe481632ad614a7bce6968f37aef21531e8a027936754b54422b561abc3` |
| `attempt-20261101T035413961Z-2-55fe7cd9` | `author_diagnostic_passed` | 642 / 135,939,060 | 16 / 759,559 | `20bc988ab29ef4beef35c6d03d44b3dac4528ac594b05130e4fa778c71de3420` |
| **Total** |  | **1,716 / 405,335,307** | **24 / 876,153** | **1,740 files / 406,211,460 bytes** |

The canonical author archive and its manifest were copied separately under `rawlogs/E-HISTORY/canonical-archive/`. The archive is 8,666,075 bytes with SHA-256 `eaedcc97d2bef10b16755400c9088a5cea7dd4f320d48b19356c3252b2bbce0d`; its 160,662-byte manifest has SHA-256 `364a9d86bf8d5e41fe4ea91581e27d077ac8c14090faf753ffad75fb7fef3f33`. The frozen source index records an independent-consumer pass for all 638 archive members. This task copied and hash-checked the pinned archive and manifest; it did not rerun that consumer or any suite.

## Provenance and limits

The frozen source index is preserved byte-for-byte at `rawlogs/E-HISTORY/source-deliverycontract-index.json`; SHA-256 `da9064ca142f4037bb57f3cdc629d88a9a8550d2c45382ce56d38912ea88aa7d`. Each exact local inventory is also copied beside its attempt’s `output/` and `evidence/` directories. `rawlogs/E-HISTORY/copy-manifest.json` records every inventory entry’s source path, destination, size, source-before hash, source-after hash, and destination hash. `rawlogs/E-HISTORY/index.json` indexes the materialized files and metadata; it contains 1,751 file records and has SHA-256 `77e91146c0f15207f06b853374d99f5cb625db0744dedccab0be910bb28fe7e7`.

The first failed attempt’s frozen row says `exactRunnerSourceSnapshot: false`. Its inventoried output and evidence files are preserved, but the exact runner body is absent; I did not recreate it or claim exact-runner preservation. The second failed attempt and the author diagnostic pass are likewise retained under their original attempt IDs and statuses.

No original inventory, source, output, evidence, or scheduler file was changed. The only writes were the new `rawlogs/E-HISTORY/` subtree and this report and receipt. The first copier launch stopped at its empty-destination guard because its own redirected logs were already present; it performed no payload copies. The guard failure is preserved in `rawlogs/E-HISTORY/materialize-preflight-failure.stderr.log`; the adjusted copier then completed successfully.

This is a durability/materialization operation, not a new test run or clean-source qualification.
