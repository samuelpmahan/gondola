# N5 — Native integration and adversarial controls

## Result

The N5 suite passes against the real PR23 attempt directory at `gondola/compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a`. `VerifyDirectory` accepted the unmodified bundle and reported source commit `e0933465725e470dc610e3f81b4bbee95538c1d0`, four scenarios, 20 profiles, 178 events, 182 states, 58 effects, 116 transport events, and seeds `20261104`, `20261105`, and `20261106`.

The mutation tests first accept the unmodified capture set. Each semantic profile edit is made in a private hard-link overlay; the target file is unlinked before rewriting so the producer bundle remains unchanged. The modified profile digest and byte count are written back into `effects.summary.json`, and the summary digest and byte count are updated in `effects.check.json` before `CheckCaptures` runs.

## Negative controls and expected reasons

| Control | Mutated field | Required rejection reason |
| --- | --- | --- |
| Go state | `snapshots[0].snapshot.children[0].goState.Core.Step` | `snapshots[0].snapshot.children[0].goState differs from replayed Go value` |
| Go view tree | `snapshots[0].snapshot.children[0].view.tree.kids[0].kids[1].text` | `snapshots[0].snapshot.children[0].view.tree differs from replayed Go value` |
| Go-rendered DOM | `snapshots[0].dom.html` | `snapshots[0].dom Go-rendered DOM differs` |
| Disabled browser click | `events[0].domClick.disabledBefore` | `events[0].domClick.disabledBefore differs from Go-rendered view` |
| Event ordering | `events[1].eventIndex` | `ordering: events[1].eventIndex mismatch` |
| Transport correlation | `transportLedger[0].correlation.effectIndex` | `ordering: transportLedger[0].correlation: start correlation differs from ordered action` |
| Effect correlation | `effectLedger[0].correlation.effectIndex` | `ordering: effectLedger[0].correlation mismatch` |
| Strict JSON | Duplicate top-level `schema` key | `duplicate key "schema"` |
| Suite downgrade | Remove seed `20261106` scenario, native replay, all five profiles, and corresponding summary records/counts | `missing required capture` for `effects.seed-20261106.scenario.json` |

The producer summary/check inventory is updated for the semantic capture mutations and for the removed-seed control. The capture checker rejects the reduced suite because the pinned scenario is required, even when the remaining inventory reports a coherent three-scenario suite.

## Verification

The final full package command was:

```sh
GOBI_EFFECTS_QUALIFICATION_INPUT=/workspace/scratch/39a56936f173/gondola/compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a /tmp/gondola-go/go/bin/go test ./effectqualification -count=1
```

It passed: `ok github.com/samuelpmahan/gondola/effectqualification 30.099s`. The verbose N5 run also passed and records each exact mutation error in `rawlogs/N5-NEGATIVE/negative-controls-02.stdout.log`.

Several earlier attempts failed while shared N2–N4 implementation files were being completed. Their raw outputs are preserved as `go-test.stdout.log`, `go-test-02.stdout.log` through `go-test-05.stdout.log`, and `negative-controls.stdout.log`. The final successful outputs are `go-test-final.stdout.log` and `negative-controls-02.stdout.log`.

## Scope limits

The positive integration uses the checked-in unpacked attempt directory. N5 does not verify archive CLI behavior; that belongs to delivery. These tests validate offline Go replay and captured data and do not claim a new browser run.
