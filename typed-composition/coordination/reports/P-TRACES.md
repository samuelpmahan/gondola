# P-TRACES — historical replay evidence packaging

## Result

Packaged the preserved pre-acceptance typed-composition replay histories into five independently hashed `tar.xz` archives. Each archive passed `xz -t`; I extracted each archive and verified every manifest-listed raw shard's size and SHA-256. Replay script shards have nonempty native frames matching both action and native-input counts. Browser-only mutation controls are checked as their own evidence types. No archived member refers to `accepted-full-*`; the root-owned live accepted output was excluded.

These files preserve historical diagnostics and preflights. They do not replace the root-owned final run or claim acceptance.

## Inventory

| Archive | Contents | Result and verified evidence | Size | SHA-256 |
|---|---|---|---:|---|
| `evidence/history-t5-exploratory-full.tar.xz` | T5 exploratory full report, mismatch artifact, manifest, and 65 raw shards | 369 findings; 63 replay scripts, 2,463 actions/native frames; two mutation-control shards | 3,403,972 bytes | `f81b217657e1ceed402b88ef26aba3f1a62001985e0b634060b499506284d373` |
| `evidence/history-clean-fixed-preflights.tar.xz` | Three fixed-only reports (`t5-fixed`, `t5-clean-fixed`, `t5-final-fixed`), manifests, mismatch artifacts, and 17 raw shards | Each report matched with zero findings; each ran all three fixed scripts and 63 native frames. Earlier reports have different source pins and do not establish the default replay. | 412,572 bytes | `c3d76a03130fbb5b702ac38fce0cc0f6137037739d89d5880dd09e02e579880d` |
| `evidence/history-frozen-full.tar.xz` | Frozen full report, mismatch artifact, manifest, 66 raw shards, before/after hash captures, and the exact preserved source archive with its provenance record | 12 findings; 63 scripts, 2,463 native frames, and three controls. The included 49-file source archive was independently checked against the frozen before-capture pins; zero pin mismatches. | 6,073,764 bytes | `4ae949d639c323c2c2620c3b5dd331c7233a3250828a6206150755a85b3397bc` |
| `evidence/history-closure-fixed-generation.tar.xz` | Closure fixed-only report, mismatch artifact, manifest, six raw shards, execution/test logs | 16 findings, all eight per side for expected null versus observed host generation 1; 63 native frames. | 151,452 bytes | `a301ecd937c173166259b00c8f77cc8b3450317f25db5764ac8ebb6fc71063df` |
| `evidence/history-mixed-observer-full-run-second.tar.xz` | The separate 248-finding `report.json`, mismatch artifact, manifest, 66 raw shards, second-run execution record and log | Exit 1; 63 scripts and 2,463 native frames. Findings: 182 missing input-observation channels, 54 reference physical-focus findings, and 12 blocked-state findings. Execution record log digest matches the archived log. | 3,296,656 bytes | `fd65100e3589e5f24a94bc276f218c19104026ef3300a642939538f0f285a9f7` |

The full machine-readable inventory, including report, manifest, mismatch-artifact, and archive hashes, source-set pins, commands, toolchains, and limitations, is [history-index.json](../../evidence/history-index.json). Its SHA-256 is `2f7bf31029bfbf9625e7a2dd159120a1a2feb9a3a8c43f3ee7d2daed31e90c66`.

## Source provenance and limits

Only `frozen-full` has a preserved exact historical source tree. Its archive contains the 49 files recorded in the before-capture; all 49 SHA-256 values match. Its before/after captures also report unchanged pins and the same report digest.

The exploratory T5 run and each fixed preflight retain their own source-pin hashes in their reports, but no exact corresponding source tree was preserved. The closure-fixed and 248-finding mixed-observer runs also have report pin hashes but no exact historical source archive. These snapshots are therefore marked unavailable in the index. Current files are not presented as substitutes for mixed historical source versions.

All five historical bundles are diagnostic or preflight evidence, not accepted proof. The live root-owned accepted-full report and its raw output were not included or modified.

## Verification method

For each archive I ran `xz -t`, listed and extracted its members to a temporary directory, checked every raw shard's manifest byte count and SHA-256, and inspected action/native-input/native-frame counts. The three full reports each contain 63 script shards with 2,463 nonempty native frames. Mutation-control shards retain their native or browser evidence separately; retained-callback controls report zero Go completion calls. I also checked the frozen nested source archive's 49 pins and the full-run-second execution log digest.
