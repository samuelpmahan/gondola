# F-DATA — accepted full trace data audit

## Outcome

**confirmed_reuse** (`validationStatus: supported`). The accepted full-run artifacts bind consistently: the 63 positive replay scripts, 66 raw shards, mismatch artifact, 49 source pins, execution/log records, and compressed evidence archive all verify. This was a read-only data audit; I did not rerun the checker or native replay.

## Run scope and counts

The captured command ran seeds `20261030,20261031`, 30 cases per seed, and `--max-actions 40` under Go `1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`, React/React DOM `19.3.1`. The execution record reports exit code 0; the full report says `matched` with zero mismatches.

| Measure | Verified value |
| --- | ---: |
| Positive scripts | 63 (3 fixed + 60 seeded) |
| Actions / native frames | 2,463 / 2,463 |
| Native replay executions | 63 |
| Candidate/reference actor-to-native frame comparisons | 4,926 |
| Browser-only lifecycle probes | 1 |
| Raw manifest shards | 66 (63 positive + 3 control artifacts) |
| Raw shard bytes | 990,909,545 |
| Mismatch records | 0 |

The fixed scripts contain 23, 14, and 26 actions (63 total); each of the 60 seeded scripts has 40 actions (2,400 total). For every positive shard, `nativeInput` has exactly one root field, `actions`; it equals the scenario action array, and every action has exactly `{method,args}` with an argument array. Every action has one corresponding nonempty native frame with tree, sessions, and changes arrays; model and browser frame counts also equal the action count.

The 66-shard manifest includes three diagnostic controls, not three extra native replay executions. The inbox-order control contains a mutation clone of `inputs-publication-races`; its copied `nativeInput` and `nativeFrames` equal the positive shard and represent no second Go execution. The physical-disabled mutation and retained-callback control are separate control observations. Their top-level records are not native action/frame shards. The report's `nativeExecutions: 63` agrees with the 63 positive scripts.

## Controls

All five report controls have their expected outcomes:

- Wrong-parent and stale-revision operations are rejected without mutation, at actions 7 and 18.
- Inbox ordering and physical disabled-state mutations are detected.
- The retained callback after disposal/recreation is fenced.

The three control shards independently record inbox-order `detected` / `reordered`, physical-disabled `detected`, and retained-callback `fenced`. The parent/revision controls are reported within the replay's control summary and preserve empty dirty receipts.

## Hash and result bindings

Every one of the 66 files in `accepted-full-report-scenarios/` matches its manifest byte count and SHA-256. The report's `rawScenarioShards` entries match the manifest entries. The mismatch file is the three-byte empty array, and its digest/count/size agree in both the report and manifest.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `accepted-full-report.json` | 260,265 | `6944e09e7ef7af2ea492799d701f0ee7fa830a3702bfbcdb7bf743c7537dbd01` |
| `accepted-full-report-manifest.json` | 21,127 | `9a5c32826424963794fc9cf62075607972af95c287fa4474b45cddc930bcac93` |
| `accepted-full-report-mismatches.json` | 3 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `accepted-full-before.json` | 5,197 | `6b8f2624f749bf3598ebd53e23e17ad1dbd28983825331ab0c2a07454d6b4cbd` |
| `accepted-full-after.json` | 221,922 | `7ce59a8e27ef386e2e2ad503e27e1b4770bf19839537d34c7b661861a9027b88` |
| `accepted-full-execution.json` | 775 | `20f9f8eab697797b5675977ef17fcb18f5fdbd4d4b75156b7d95b1769a3e77fd` |
| `accepted-full.log` | 766 | `a737e35a019b7d2db9c6f2014984a87e64a50dee7ccae9db9e313ac27c17e6c3` |
| `evidence/accepted-full-traces.tar.xz` | 2,139,424 | `c3e9c557799feefdb0b310e8d805af987145254b443ee91e27898456fc21625a` |

The `before.pins`, `after.before.pins`, `after.afterPins`, full report `sourcePins`, and current hashes for all 49 pinned files are equal. The sorted before-pin digest recomputes to `eabf5436702bac38735e85cf486cb125d32a57e52c79ef8195d6bf926cfe0acb`; the report-order source-set digest recomputes to `ad5ddea05a4b5eecc3089f2b5cd297106e6f12b271593ec373334f55f0bde057`. The after record confirms unchanged pins and report-pin equality; its report SHA-256 matches the report bytes. The execution record in the after capture equals `accepted-full-execution.json`, and its log digest matches `accepted-full.log`.

The archive contains 74 tar entries: 73 regular files (the report, manifest, mismatch artifact, before/after/execution/log records, and all 66 shards) plus the scenario-directory entry. Each regular archive member was streamed and hash/size-compared with its current source artifact.

## Verification limits

This packet verifies captured data integrity and internal count/binding relationships only. It does not assert source-level correctness independently of the checker, reproduce browser/native actions, rerun any mutation control, or rerun the accepted full replay. Earlier `F-RUN` artifacts with 12 findings remain historical and separate; this review concerns only the later `accepted-full-*` package.
