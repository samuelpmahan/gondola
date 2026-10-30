# O-PINS — refreshed inherited pin and historical restoration audit

## Result

**Outcome: mixed change.** This read-only audit refreshed the prior inherited-pin record after R-T3. The original M0 checksum manifest and all 24 files listed by it match. All eight predecessor delivery-manifest files remain byte-identical to PR9. Across 796 predecessor pin entries, 788 current files match; four intentional host/test changes account for two keyed-editor pins and two session-tree pins, and four historical PR8 exceptions account for the remaining mismatches.

## M0 checksum proof

The source manifest was read directly from M0 commit `ed3fd43b24a58375032a6bc8f9ef0411bcb0ad46`. The file bytes are identical to current `SHA256SUMS` and the PR9 version. Each of its 24 entries was independently hashed against the current worktree.

```sh
sha256sum -c --quiet <(git show ed3fd43b24a58375032a6bc8f9ef0411bcb0ad46:SHA256SUMS)
# passed: all 24 original M0 entries
```

The preflight's six `baselineSourcePins` are PR9 samples, not a complete set of M0 source pins. Five match both M0 and PR9. README already differed from M0 at PR9 (`d902638d…` at M0; `55a3521d…` at PR9). Current README (`8f2d142a…`) also adds the typed-composition index section. The refreshed evidence retains all six three-way comparisons and all 24 M0 entry results.

## Predecessor delivery manifests and pin results

For each manifest below, the current file bytes were compared with `git show d6d425765ee9d48eae22342a3cb75fab2e2871ba:<manifest>`. All eight comparisons are byte-equal. Each manifest's pin map was then checked against current file hashes.

| Predecessor manifest | Pins | Match current | Mismatches |
|---|---:|---:|---:|
| `async-effects/evidence/delivery-manifest.json` | 72 | 72 | 0 |
| `backend-replacement/evidence/delivery-manifest.json` | 53 | 53 | 0 |
| `controlled-input/evidence/delivery-manifest.json` | 92 | 92 | 0 |
| `http-effects/evidence/delivery-manifest.json` | 100 | 100 | 0 |
| `interaction/evidence/delivery-manifest.json` | 56 | 56 | 0 |
| `keyed-editor/evidence/delivery-manifest.json` | 136 | 134 | 2 intentional T3 host/test changes |
| `renderer-conformance/evidence/delivery-manifest.json` | 141 | 137 | 4 historical PR8 exceptions |
| `session-tree/evidence/delivery-manifest.json` | 146 | 144 | 2 intentional T3/R-T3 host/test changes |
| **Total** | **796** | **788** | **8** |

The four intentional host/test pin changes are `keyed-editor/host.mjs`, `keyed-editor/host.test.mjs`, `session-tree/host.mjs`, and `session-tree/host.test.mjs`. The keyed-editor files contain the earlier refresh support. The session-tree files include T3 refresh support plus R-T3's operation reservation around refresh. Current session-tree hashes are `f5ce451235ec2506d80d9ac3ebc364a9e43ba774cd56a66e25e3f8f7bd8a0c5a` and `d72cf12edb851bc2c01a35426a0d2585c266fce1a15ba12d0e51271268b8f5c0` respectively.

The four historical PR8 exceptions are `cmd/godom-wasm/main_wasm.go`, `cmd/godom-wasm/smoke.html`, `renderer-conformance/adapter.mjs`, and `renderer-conformance/adapter.test.mjs`. For each file, its actual PR8 blob, PR9 blob, and current worktree bytes have the same hash. The recorded mismatch is between the older renderer-conformance manifest pin and the PR8-through-current file, not a new change in this worktree.

The four multi-root host/runtime refresh files remain intentional but unpinned by predecessor delivery manifests. Their absence from those maps is not treated as an unchanged-byte claim. The full current hashes, pin-by-pin results, and manifest file hashes are in [`inherited-pins.json`](../../evidence/inherited-pins.json).

## Historical report/receipt restoration

The final historical files at the mistaken N6 output paths were compared byte-for-byte against PR9 d6:

| Historical path | Current SHA-256 | PR9 d6 SHA-256 | Result |
|---|---|---|---|
| `session-tree/coordination/reports/XR-R-T3.md` | `92ed6e2ed6d04d9b0530da0f2a837227779dbf17d83ddd76c5f2eb13cedd0ada` | same | exact match |
| `session-tree/coordination/receipts/XR-R-T3.json` | `17f90f68683d86aa4ffb3dec6dd1bf135e4bdf65f15857a252719b14dc31225d` | same | exact match |

This verifies that the original historical report and receipt are restored. Per the lead's correction in `coordination/PROTOCOL.md`, the copied historical-path sample already held restored/original bytes when captured; it is not evidence of the transient accidental contents. This audit makes no claim to reconstruct those transient contents.

## Previous audit history

Before refreshing the current evidence, I archived the prior A-PRESERVATION JSON, report, and receipt byte-for-byte under [`evidence/history/A-PRESERVATION-pre-R-T3`](../../evidence/history/A-PRESERVATION-pre-R-T3/). The archived hashes match the saved pre-refresh hashes:

| Archived file | SHA-256 |
|---|---|
| `inherited-pins.json` | `8176d76866e4ccb60a056e0c2e905743b42f9c6fe675bac83af042fdd8bfbd0c` |
| `A-PRESERVATION.md` | `dbf3163f43280dfb7c0f0cbfe89050e54197497886c8c64be1aea88a51d5f73d` |
| `A-PRESERVATION.json` | `6e7ea504712e50d7d9ce46df9afea0133c5adb74e0c81720958cf4a50712885e` |

The earlier A-PRESERVATION report and receipt were also restored byte-for-byte after the collision: their live pre-refresh bytes match those archived SHA-256 values. The new current machine record carries the R-T3 hashes, per-manifest pin results, and restoration comparison.

## Commands and scope limits

I used `git show` on M0, PR8, and PR9 objects and compared those bytes to the current working tree with SHA-256 and byte equality. The focused checksum command above passed 24/24. No tests, seeded replay, inherited runner, source code, predecessor manifest, or Git operation was run or changed. This is a pin preservation audit only, not a runtime or integration claim.
