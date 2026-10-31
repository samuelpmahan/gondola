# E-HARNESS: compiled capability admission and swap conformance

## Change

Added the capability conformance CLI, browser adapter, active React/DOM probe, and independent result checker under `compiled-capabilities/conformance/`. The CLI composes the existing lifecycle conformance runner with the N4 literal expectation file. It keeps the native Go trace, direct compiled roles, and exact React, DOM, and alternating-swap checks from the inherited 26-event fixture.

The capability browser probe runs the full N4 admission matrix: 7 missing-capability cases, 6 malformed or hostile host declarations, and 6 malformed or hostile renderer declarations. Every case rejects with `TypeError` before Go `Init`, `Update`, or `View`, before renderer methods, and before DOM insertion. Accessor values and accessor profile properties are not invoked.

For the active swap sequence, the probe mounts the unmodified compiled lifecycle AppIR. It performs a real Add and Request click, verifies the disabled Request click adds no trace tick, and tries a React renderer that lacks the app's `view.node` requirement. The replacement is rejected in `phase: admission`, with the old renderer unmounted flag false and no candidate methods called. State, view, DOM, pending request, renderer lease, and callback identity match the N4 preservation list. A physical click on the existing DOM still updates the Go state. A compatible React replacement preserves state, view, DOM, and the pending effect; the old callback is fenced only after that commit, and the outstanding `parent:g1:r1` reply is then accepted against `dispatch-0002/0`.

The inherited lifecycle browser adapter originally wrapped each renderer without forwarding its capability profile. Strict admission correctly rejected that wrapper. With root authorization, the wrapper now forwards `core.viewCapabilities`; no lifecycle logic, fixture, or expected trace changed. The lifecycle demo uses raw built-in renderer instances, so it needed no wrapper change.

## Evidence

### Focused end-to-end run

Command, from the repository root:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false CHROMIUM_PATH=/tmp/chromium \
  /tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/conformance/run.mjs \
  --react-app-ir compiled-capabilities/builds/feasibility/react/output/apps/lifecycle-7e6575d90707/app-ir.json \
  --react-compiled compiled-capabilities/builds/feasibility/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs \
  --react-helpers compiled-capabilities/builds/feasibility/react/output/apps/lifecycle-7e6575d90707/encoder.mjs \
  --react-manifest compiled-capabilities/builds/feasibility/react/output/buildmanifest.json \
  --dom-app-ir compiled-capabilities/builds/feasibility/dom/output/apps/lifecycle-7e6575d90707/app-ir.json \
  --dom-compiled compiled-capabilities/builds/feasibility/dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs \
  --dom-helpers compiled-capabilities/builds/feasibility/dom/output/apps/lifecycle-7e6575d90707/encoder.mjs \
  --dom-manifest compiled-capabilities/builds/feasibility/dom/output/buildmanifest.json \
  --native-go /tmp/gondola-go/bin/go \
  --fixture fixtures/compiled/lifecycle/scenario.json \
  --expectations compiled-capabilities/oracle/expectations.json \
  --chromium /tmp/chromium \
  --output /tmp/gobi-capability-focused-N3-20261031-03/conformance
```

Result: exit 0; Node `v22.23.4`; Go `go1.24.0`; Chromium `153.0.8010.0`; Playwright `1.64.1`. The run and independent checker both report `matched`. Source pins and build output pins were stable through the checker; the React and DOM AppIR files have identical SHA-256 `ed93e9ae6f9be20c306669d63b676ed466e65fee8dc7fd0a1a4c8a6b38f0a68a`. The AppIR capabilities are `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`.

Native replay command recorded by the run:

```sh
/tmp/gondola-go/bin/go run ./cmd/compiled-lifecycle-native \
  --script /workspace/scratch/39a56936f173/gondola-capabilities/fixtures/compiled/lifecycle/scenario.json
```

The literal lifecycle checker matched 26 events and 26 Go ticks, 16 physical clicks, 7 requests, and 3 child-first cancellations in order: `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`. The fixture removes and remounts the parent subtree at events 9–10, resets its counters, and exercises the second Add sequence at events 16–18. All three browser profiles (`react`, `dom`, `swap`) matched; 8 mutation controls were detected. The capability checker matched all 19 N4 cases and both exact preservation lists. The focused browser made no WebAssembly API attempts or WebAssembly requests.

The active capability trace is exactly: initial tick; `addParent` / `dispatch-0001`; `requestParent` / `dispatch-0002`; `addParent` / `dispatch-0003` from the old DOM after rejected replacement; and `complete(parent:g1:r1)` / `dispatch-0004` after compatible replacement. The disabled Request click and both renderer replacement attempts add no Go ticks.

### Attempt history and raw files

- Attempt 01 retained the first actual browser probe pass, but the composed lifecycle replay was rejected before execution because the direct `runLifecycleConformance()` call lacked its frozen contract, schedule, and browser-adapter arguments. Those paths are now explicit and included in the local source pins.
- Attempt 02 retained passing native and direct traces plus the capability browser probe. The inherited browser profile failed at mount because its wrapper omitted `viewCapabilities`. The minimal forwarding line fixed that integration seam.
- Attempt 03 is the complete passing run.

Raw stdout, stderr, per-stage run records, native/direct/browser traces, checks, manifests, and failure artifacts are preserved in `conformance/evidence/attempt-01/`, `attempt-02/`, and `attempt-03/`. Attempt 03's run JSON SHA-256 is `fa867ca149d4d70f338691bab2de31f71502b32f01d92400bdcaa8b41164afbf`; its capability check SHA-256 is `ba38359c2ef44fa9009459b28d64c9e036112dddeabced0ba0c31b30de7b45e5`.

### Static checks

Node 22 `--check` passed for the four new conformance modules and the forwarded inherited lifecycle browser entry. The exact command and Node's environment warning are retained in attempt 03's stderr log.

## Scope and limits

Implementation touched `compiled-capabilities/conformance/**`, the single renderer-profile forwarding line in `compiled-lifecycle/conformance/browser-entry.mjs` authorized by root, and this report/receipt. No commit, merge, deployment, or Git operation was performed by N3.

This is the focused E-HARNESS author result. Root still owns the full fresh-build chain, inherited regressions, and final source-pin/archive decision; the feasibility outputs used here are not the final milestone acceptance run.
