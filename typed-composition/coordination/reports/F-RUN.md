# F-RUN — frozen typed-composition full replay

## Outcome

**Outcome: insufficient_evidence.** The frozen default replay completed, but the oracle reported 12 findings, so the run is not a pass. All findings are the same uncovered case: a seeded LF input witness targets a ReadOnly input that is physically disabled, so the browser correctly emits no input event and the fixture's live sanitation observation is `null`. The checker currently expects an input event observation in that blocked branch. The findings do not show a candidate/reference/native state divergence. Source was not edited during this execution packet.

## Command and terminal result

Executed from the repository root:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
GOTOOLCHAIN=local \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
COMPOSITION_REPLAY_BIN=typed-composition/build/composition-replay \
  node typed-composition/check.mjs \
  --seeds 20261030,20261031 --cases 30 --max-actions 40 \
  --output typed-composition/build/frozen-full-report.json
```

Terminal exit code: **1**. The checker completed all scripts and wrote the report, raw scenario shards, manifest, and full mismatch artifact.

| Measure | Result |
|---|---:|
| Scripts | 63 |
| Actions / native frames | 2,463 |
| Native replay executions | 63 |
| Candidate/reference actor-native frame comparisons | 4,926 |
| Findings | 12 |
| Mutation controls | 5 passed |

All five controls produced their expected result: wrong parent and stale revision were rejected without mutation; inbox order and physical DOM disabled mutations were detected; retained callback after disposal/recreation was fenced.

## Finding details

Each of the six seeded actions below produced two findings (`input.candidate.live` and `input.reference.live`):

| Seeded script | Action index | Read-only target | Requested text | Effective text |
|---|---:|---|---|---|
| `seed-20261030-case-3` | 36 | child 2, `row-1-input` | `line left\r\nline right` | `line leftline right` |
| `seed-20261030-case-6` | 28 | child 2, `row-1-input` | `line left\r\nline right` | `line leftline right` |
| `seed-20261030-case-11` | 35 | child 3, `row-2-input` | `line one\nline two` | `line oneline two` |
| `seed-20261030-case-27` | 18 | child 3, `row-1-input` | `line one\nline two` | `line oneline two` |
| `seed-20261031-case-10` | 30 | child 3, `row-1-input` | `line one\nline two` | `line oneline two` |
| `seed-20261031-case-18` | 23 | child 3, `row-1-input` | `line one\nline two` | `line oneline two` |

For all six, the target's typed policy was `ReadOnly=true`, the actual DOM input had `disabled=true`, the fixture recorded `disabledStepProbe=true`, and `inputWitnessObservation` was `null`. Raw shards show the live input value stayed at its previous value. The follow-up repair should record a blocked-disabled witness with requested value, unchanged live value, and no dispatch, then validate that branch without removing the sanitation assertion for enabled inputs.

## Frozen-source verification

The before capture is `typed-composition/build/frozen-full-run-before.json`; the after capture is `typed-composition/build/frozen-full-run-after.json`. Each contains SHA-256 values for the same 49 source and build paths. Results:

- `unchangedFromBefore`: `true`
- `reportPinsEqualBefore`: `true`
- `reportPinsEqualCurrent`: `true`
- changed paths: none
- sorted path-to-hash source-set SHA-256, before and after: `8b913499f56c5fc7e393dcba977124867d78a61ce9f258831589c1aa38141bef`
- checker report's source-set SHA-256: `b497a5d66e64aa430ab06deec024421c62df73531c8b837539076a93582dd9e7` (same pinned values hashed in the checker's declared source-list order)

Toolchain and browser versions: Go `go1.24.0 linux/amd64`; Node `v22.23.4`; Chromium `153.0.8010.0`; React `19.3.1`; React DOM `19.3.1`.

## Preserved artifacts

- Full report: `typed-composition/build/frozen-full-report.json` — SHA-256 `784cb1ae0d23a4362a7e44bb87011bc239eb2cca18e2c4bc974292160b8b417f`
- Raw shards: `typed-composition/build/frozen-full-report-scenarios/` — 66 complete shards, indexed and hashed in the raw manifest
- Raw manifest: `typed-composition/build/frozen-full-report-manifest.json` — SHA-256 `cb1a734fb25b265dd54d923e7348c849d10b4cb37a9028af03a9b56922890960`
- Complete mismatch records: `typed-composition/build/frozen-full-report-mismatches.json` — SHA-256 `35fddeb032ff5b66bf7e9f25c06d55fb096790897e9d8431479f3fa9246af5f`
- Before hash capture: `typed-composition/build/frozen-full-run-before.json` — SHA-256 `f408701bb525fccea9a7bf8af3e83fb54c30df032af26f51fd30ca74b84736c3`
- After hash capture: `typed-composition/build/frozen-full-run-after.json` — SHA-256 `f5e96d433d4b5b761fba56e75e28e63f126745fa73d21557b57431bbf1326bb9`

The earlier exploratory full run and clean fixed preflight remain in their separate `t5-full-report*` and `t5-final-fixed-report*` artifacts; neither was overwritten. No source repair or rerun is included in F-RUN.
