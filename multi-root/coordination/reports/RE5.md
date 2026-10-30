# RE5 — Replay lifecycle semantics and hard action bounds

## Repairs

- Lifecycle observations now participate in candidate/reference parity. The
  parity projection compares ordered kinds, generations, action details, and
  request IDs while normalizing independent session IDs, backend labels, and
  cross-actor sequence interleaving. Candidate-only renderer replacement and
  renderer-failure events are semantically checked separately.
- The validator derives the exact event sequence for each tick from the
  scripted action and before/after observations. It rejects event count/order
  changes, gaps or duplicate sequence numbers, wrong root/participant/session
  ownership, invalid mount/dispose generations, and mismatched action details.
  Each actor's cumulative `lifecycleEvents` must match the validated event
  projection. The XR-E5 fabricated-event mutation now fails both
  `lifecycle-history` and lifecycle parity.
- Seeded generation now treats `maxActions` as a hard ceiling. A focus action
  is added only when both the fill and focus steps fit; forced pending-release
  repairs also stop at the ceiling. The generator remains deterministic.

## Verification

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test multi-root/*.test.mjs renderer-conformance/adapter.test.mjs
# 39 passed, 0 failed

/tmp/gondola-node22/node_modules/node/bin/node --input-type=module -e 'import {seededScripts} from "./multi-root/scripts.mjs"; for (const [seed,cases,maxActions,caseIndex] of [[59,5,40,4],[0,2,13,1]]) { const s=seededScripts(seed,{cases,maxActions})[caseIndex]; console.log(JSON.stringify({seed,caseIndex,maxActions,actions:s.actions.length})); }'
# seed 59 case 4: 40/40 actions; seed 0 case 1: 13/13 actions
```

`check.test.mjs` includes the adversarial lifecycle mutation, duplicate record,
session-ID and generation ownership probes. `scripts.test.mjs` includes both
reported cap seeds and checks all generated cases remain within the selected
limit.

The integrated runner was active in inherited HTTP replay while these edits
were made. Browser replay verification against the repaired lifecycle recorder
is pending that runner's fixed/default multi-root stage; no browser pass is
claimed by this packet yet. The preceding E5 run's compact summary describes
the earlier replay source state, not this RE5 revision.

## Limits

The lifecycle validator checks the deterministic replay event contract; it
does not prove arbitrary browser event scheduling or other browser engines.
This packet did not run a separate browser process to avoid contention with
the integrated runner. Native comparison, full seeded replay, and the
repository-wide gates remain for the root runner to verify.
