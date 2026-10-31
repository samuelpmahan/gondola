# XR-HARNESS: Independent conformance harness review

## Decision

**Amend.** The fresh native/direct/React/DOM/swap run matched, and the main active swap path uses the unmodified compiled lifecycle AppIR. One admission-matrix row named `accessor-host-capabilities-property` does not create a property getter, so it does not establish the claimed host option accessor behavior. The production guard is covered separately by N2's runtime test; this is an N3 harness evidence defect.

## Fresh run

I reran the E-HARNESS CLI with its exact input flags and the fresh feasibility React/DOM outputs. The output prefix is this review's unique path so the author's attempt-01/02/03 evidence remains untouched.

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
  --output compiled-capabilities/coordination/reviews/XR-HARNESS/conformance
```

It exited 0 with Node `v22.23.4`, Go `go1.24.0`, Chromium `153.0.8010.0`, and Playwright `1.64.1`. The run and checker reported `matched`: 19 admission rows, 26 inherited lifecycle ticks, 16 clicks, 7 requests, 3 cancellations, 8 inherited mutation controls, and no WebAssembly API attempts or requests. One of the 19 rows is the wrong stimulus for its accessor-property label, described below. Source and build output pins were stable.

The active browser sequence uses the actual compiler-generated lifecycle module, encoder, and AppIR. Its component requirements are `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. The negative pre-initialization matrix deliberately overlays the N4 oracle's capability metadata on wrappers around the actual compiled role functions; those cases validate runtime admission given declared metadata and are not evidence of compiler inference. In the actual active swap, the candidate profile is `[]` and the missing required capability is `view.node`; a physical click on the old DOM still updates Go state, a compatible React swap commits, the retired callback is fenced, and the pending reply is accepted.

## Finding: host option accessor case is a non-array case

The row `accessor-host-capabilities-property` in `expectations.json` uses the sentinel value `"getter-property"`. `watchedHostCapabilities()` only turns `"accessor-at-index-zero"` into an accessor array; otherwise it returns the value directly. `rejectedAttempt()` then assigns that value as an ordinary own data property (`options.hostCapabilities = hostCapabilities`). Consequently the named row tests that a string is rejected as a non-array, not that a getter on the mount options is rejected without invocation. Its `descriptorGetterCalls` is always zero because the `descriptorGetter` counter is never connected to an options getter. The checker only asserts the array-element accessor row's getter counter.

This row still rejects before `Init` and renderer calls, so the fresh run's status remains `matched` for the cases it actually executed. It does not substantiate the host option getter assertion in the E-HARNESS report. The production runtime's own-data-property guard has separate N2 coverage, including a getter invocation counter. The bounded harness repair is to define an accessor on the mount options for this case, retain its invocation counter in the result, and make the checker require that row's counter to be zero alongside its pre-`Init`/render assertions.

## Checker review

I exercised `checkCapabilityConformance()` on the fresh capture. It rejects mutations to the observed preservation list, admission call counters, and old callback result. That provides an independent check for those summary fields.

Two checker limits remain. First, it consumes the browser-generated `observedPreservedAfterRejectedSwap` and compatible `observedPreserved` labels instead of recalculating preservation from serialized snapshots. The checker still reports `matched` if I alter only the rejected swap's serialized state, view, DOM, or pending-effect snapshot while leaving the labels unchanged. The compatible swap does not serialize its before/after snapshots at all. N3 should retain both snapshots and have the checker independently compare state, view, DOM, and pending effects for both rejected and compatible swaps; the callback identity should remain an observable behavior/generation check, not a serialized function claim.

Second, `expectedIncompatibleRendererCapabilities` is copied from the N4 synthetic oracle and compared back to the same expectation; it is not the active candidate profile. The active lifecycle AppIR requires only `view.node`, and the actual candidate profile is `[]`. The candidate is rejected because it lacks that actual requirement, and the capture includes the candidate profile, missing capability, and zero method-call counts. N3 should remove the synthetic profile field as proof of the active swap and make the independent checker validate the candidate profile against the actual AppIR's view requirements with the selected missing capability removed. Mutation of the synthetic expectation and its copied browser field to the same unrelated value currently still passes the checker. These are harness/checker evidence defects; the observed runtime rejection itself is valid.

## N6 contract compatibility and preserved history

I checked the fresh command's 13 required N3 flags and its outputs against N6's `runConformance()` checks. Run/check/manifest schemas and statuses matched; the lifecycle/native schemas and identities matched; all expected admission IDs and swap fields matched the current N4 list; and all 10 evidence suffixes required by N6 existed. `logs/n6-schema-probe.mjs` records the independent comparison.

The author's `attempt-01` missing contract/schedule/browser-adapter failure and `attempt-02` lifecycle wrapper profile failure were preserved. Their original raw output files were not edited. The one-line inherited adapter change forwards `core.viewCapabilities`; `git diff` from the assigned base confirms that is the only change in `compiled-lifecycle/conformance/browser-entry.mjs`.

## Evidence and limits

- Fresh CLI stdout/stderr and its full native, direct, React/DOM, capability, run, check, and manifest outputs are under `compiled-capabilities/coordination/reviews/XR-HARNESS/`.
- `logs/checker-probes.mjs` documents the checker mutation controls and the raw-snapshot limitation; `logs/n6-schema-probe.mjs` documents N6 output compatibility.
- SHA-256 pins for the reviewed harness sources, N6 runner, expectations, fresh outputs/logs, and preserved author failure logs are in the XR-HARNESS receipt.
- The root-owned full milestone runner, fresh compiler builds, inherited full regression chain, and archive round trip remain pending. This review does not claim final acceptance.

No production files, Git state, dependencies, or the author's attempt directories were changed.
