# XR-RE5-RE5 — Independent review of replay lifecycle repairs

## Decision: amend

Reviewed the PR8 source tree at tree `59139e1d03481919f615bc74840f2798de9fbdb5`,
the RE5 repairs and tests, and the prior XR-E5 findings. I made no implementation
changes. The two XR-E5 findings are repaired, but a renderer-failure semantic
case remains undetected by the replay oracle.

## Rechecked XR-E5 findings

- The observation-only lifecycle mutation is now rejected. The focused test
  `lifecycle trace rejects an observation-only fabricated event` passed, and
  `validateReplayScenario` checks lifecycle history against action-derived
  events. Tick events require contiguous sequence numbers and exact root,
  participant, session, generation, request, and action details.
- The cap reproductions now stay within their limits: seed `59`, case 4,
  `maxActions=40` emits 40 actions; seed `0`, case 1, `maxActions=13` emits 13.
  The cap is applied only to generated scripts. `makeScripts` still includes
  all three fixed scripts before the generated schedules, and the fixed-script
  test continues to require the three-root, disposal, renderer, and focus
  witnesses.
- The complete focused Node suite passed 39/39 using available Node `v24.22.1`.
  The two cap probes and the lifecycle mutation test were also rerun directly.

## Remaining finding: a failed renderer probe may change the backend

Only `replace` and `renderer-failure` are excluded from candidate/reference
lifecycle parity. Ordinary `replace` actions have an explicit target-backend
check in `compareReplayScenario`. A `renderer-failure` action has an exact
candidate-only event check, including the requested failing backend and a
nonempty error string, but there is no check that the candidate backend after
the failed replacement equals its backend before the action. `backend` is not
otherwise compared in `compareObservationPair`.

I constructed a valid three-root, two-tick scenario with unchanged state,
tree, and DOM; a correctly formed candidate-only failure event for
`throw-on-mount`; and valid native frames covering every root and tick. The
candidate's backend changed from `dom` to `react` across that failed probe.
Both `validateReplayScenario(scenario)` and `compareReplayScenario(scenario)`
returned `[]`. This allows a failed swap to silently change the active renderer
while the replay reports no mismatch.

The failure probe should require the candidate's post-action backend to equal
its pre-action backend, and a regression test should mutate that backend while
keeping the valid failure event and native frames. The existing host tests do
cover rollback in the current host implementation, but they do not make this
replay-oracle invariant fail closed.

The ordinary swap path's parity exclusion is otherwise narrowly scoped: its
event is checked against the `from` and target details, and the candidate's
post-action backend is checked against the target. Lifecycle normalization
removes cross-actor sequence and session IDs plus backend labels, while
preserving generation and semantic details. The action cap change also leaves
fixed witness definitions untouched.

## Reproduction

The following is the essential adversarial mutation used for this review:

```js
// Start with a valid captured scenario with all three roots mounted on DOM,
// exact mount lifecycle receipts, and native frames for every active tick.
const action = { kind: "renderer-failure", root: "alpha", backend: "throw-on-mount" };
const beforeBackend = "dom";
const after = structuredClone(before);
after.action = action;
after.roots.alpha.candidate.backend = "react"; // invalid: failed swap changed backend
after.events = [{
  sequence: nextSequence,
  kind: "renderer-failure",
  root: "alpha",
  participant: "candidate",
  sessionID: alphaCandidateSession,
  backend: "throw-on-mount",
  error: "synthetic expected failure",
}];
after.roots.alpha.candidate.lifecycleEvents.push({
  sequence: nextSequence,
  kind: "renderer-failure",
  sessionID: alphaCandidateSession,
  backend: "throw-on-mount",
  error: "synthetic expected failure",
});
scenario.actions = [action];
scenario.ticks = [before, after];
scenario.nativeSegments = validSegmentsForEveryMountedRootAndTick;
console.log(compareReplayScenario(scenario)); // []
```

## Browser evidence and limits

The integrated browser result is owned by the root run. I did not rerun the
browser replay: the temporary Go 1.24, Node 22, and Chromium executables had
been pruned from this workspace. The focused unit suite and synthetic oracle
probe above do not substitute for a browser rerun.
