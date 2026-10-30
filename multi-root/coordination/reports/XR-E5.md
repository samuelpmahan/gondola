# XR-E5 — Independent review of the replay oracle and evidence

## Decision: amend

Reviewed `multi-root/scripts.mjs`, `reference.mjs`, `check.mjs`, their focused
tests, the final raw replay, and the compact evidence record. I did not edit
implementation or tests. Two reproducible issues prevent acceptance.

## Findings

### 1. `lifecycleEvents` can diverge undetected

`validateObservationShape` requires `lifecycleEvents` to be an array, but
`compareObservationPair` does not compare it. `validateReplayScenario` checks
that `tick.events` has increasing sequence numbers, but does not validate that
each observation's lifecycle events match the events for that root and
participant. Therefore the reported lifecycle channel can be fabricated or
omitted while the scenario still passes validation.

I built a valid one-tick scenario with all three roots and both participants,
changed only `alpha.candidate.lifecycleEvents` to
`[{"sequence":999,"kind":"fabricated-event","sessionID":1}]`, and left
`tick.events` empty. `validateReplayScenario(scenario)` returned `[]`. The
production recorder currently appends a projection of an event to both arrays,
but the checker does not enforce that relationship; an adversarial difference
is accepted.

### 2. The generator can exceed its advertised `maxActions`

`randomCase` checks `actions.length < length` before each loop iteration, but
the focus branch appends two actions. With valid seeds, that branch can push a
script past the selected length and past the CLI's maximum.

Reproduction with Node 22:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --input-type=module -e 'import {seededScripts} from "./multi-root/scripts.mjs"; for (const [seed,maxActions] of [[59,40],[0,13]]) { const script=seededScripts(seed,{cases:5,maxActions}).find(s=>s.actions.length>maxActions); console.log(JSON.stringify({seed,maxActions,script:script?.name,actions:script?.actions.length})); }'
```

Output:

```json
{"seed":59,"maxActions":40,"script":"seed-59-case-4","actions":41}
{"seed":0,"maxActions":13,"script":"seed-0-case-1","actions":14}
```

The recorded default seeds happened to stay within 40, and the generator tests
check that sampled default set. The configured maximum is not enforced for all
valid seeds.

## Other requested checks

- **Fail-closed observation shape:** missing roots, actors, snapshots, and
  required channel fields produce validation issues. The lifecycle finding
  above is the exception to the claimed lifecycle comparison guarantee.
- **Determinism and generated actions:** the generator uses a seed-local
  xorshift32 stream; tests compare repeated output for both default seeds and
  ensure generated saves target nonempty drafts. The action-cap reproductions
  show that validity does not hold for the full accepted seed/options domain.
- **Cancellation quiescence and ordering:** repeated-save handling waits up to
  10 seconds for the new request to reach `held` and previous held requests to
  reach `cancelled`, failing on timeout. It captures the transport's retained
  event arrays after that wait and compares their ordered entries; the wait
  does not rewrite the per-transport event order.
- **Selection semantics:** normalization changes direction to `none` only
  when selection start equals end. Noncollapsed selection direction remains
  part of parity comparison and focus-witness validation. Focus tests cover
  collapsed and directional selections.
- **Native comparison coverage:** each mounted root/session generation needs a
  nonempty native segment; every mounted tick must be covered. The validator
  checks frame order, session/generation identity, state/tree/DOM agreement,
  and action steps before the CLI invokes `compare-interaction`.
- **Evidence integrity:** the compact record reports 63 scripts, 1,764
  actions, 1,827 ticks, 10,962 actor observations, 193/193 native segments,
  and zero mismatches. I independently checked the raw report's 327,100,526
  byte size and SHA-256 (`dfa5dc8a044d519fce9192fded2ebfad4351744ce03570b75469f51f1b2cd6c2`),
  and confirmed the three recorded source hashes match the current `scripts.mjs`,
  `reference.mjs`, and `check.mjs` files.

The author evidence records 36 focused Node tests passing and the fixed and
seeded browser replay runs matching. I did not rerun the Node suite or browser
witnesses because the root integrated runner was active and the review dispatch
asked me to avoid contention; the two findings above were independently
reproduced with small Node probes.

## Required repair

Make lifecycle event observations fail closed against their corresponding
ordered `tick.events` projection, and bound generated scripts so every valid
seed respects `maxActions`. Add regression tests for both adversarial cases,
then rerun the focused suite and affected replay witnesses before requesting a
fresh review.
