# XR-FIX-HARNESS: independent review of the N3 harness repair

## Decision

**Accept.** The three XR-HARNESS findings are closed in the updated conformance harness. A fresh focused run matched, and the raw outputs independently demonstrate the repaired accessor, swap-preservation, active-candidate, and mutation-control evidence. The full N6 runner remains a separate root-owned step.

## Source review

- `accessor-host-capabilities-property` now creates an own `hostCapabilities` getter with `Object.defineProperty`. The browser probe records whether the own descriptor is an accessor. The N3 checker requires that descriptor flag and zero getter calls. It also requires the case to reject with `TypeError` before Go `Init`, `Update`, or `View`, before any renderer method, and before container insertion. The fresh capture records `optionAccessorConstructed: true`, getter calls `0`, all four call counts `0`, and an empty container.
- Rejected and compatible swaps both serialize before/after runtime snapshots and pending effects. The independent checker compares raw state, view, DOM, and pending-effect values for each swap; it also checks the rejected lease generation. The fresh check reports both `rawPreservationVerified` booleans true.
- The active incompatible candidate is built from the component in the imported compiled module's actual AppIR. The AppIR's actual renderer requirement is `view.node`; the candidate removes that selected requirement and is `[]`, so admission rejects with missing capability `view.node`. The checker verifies the candidate against the actual component capability capture and does not use the N4 synthetic incompatible profile as active evidence.
- The checker clones the browser capture for nine mutations while leaving the browser-generated labels unchanged: four rejected-swap raw fields, four compatible-swap raw fields, and the host option accessor construction flag. It reruns the checker for each clone and requires each to throw. The fresh result reports all nine ordered rows as detected with error strings.

N6 integration is compatible with the repaired result: its conformance gate requires a matched N3 check, the frozen host case IDs and pre-init/render rejection control, both raw-preservation booleans, and all nine ordered mutation rows. The host descriptor flag and zero getter count are asserted by the pinned N3 checker; the fresh N3 check records those fields and reports `matched`.

## Fresh focused run

I ran the exact E-FIX-HARNESS CLI from its receipt with the same feasibility React/DOM builds and a new review output prefix:

```sh
mkdir -p compiled-capabilities/coordination/reviews/XR-FIX-HARNESS/attempt-02/logs
set -o pipefail
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
  --output compiled-capabilities/coordination/reviews/XR-FIX-HARNESS/attempt-02/conformance \
  2>compiled-capabilities/coordination/reviews/XR-FIX-HARNESS/attempt-02/logs/runner.stderr.log \
  | tee compiled-capabilities/coordination/reviews/XR-FIX-HARNESS/attempt-02/logs/runner.stdout.log
```

The command exited 0. Node was `v22.23.4`, Go was `go1.24.0`, Chromium was `153.0.8010.0`, and Playwright was `1.64.1`. Run and check statuses were `matched`; all 19 admission cases passed, and the inherited lifecycle replay matched 26 ticks, 16 physical clicks, 7 requests, and 3 cancellations. Source and build pins remained stable. No WebAssembly API attempts or requests were recorded, and no failure artifact was left.

The captured review output is under `coordination/reviews/XR-FIX-HARNESS/attempt-02/`. Its stdout and stderr hashes, capability capture/check, manifests, lifecycle traces, run record, and build/source hashes are recorded in the accompanying receipt. The original attempts 01–05, XR-HARNESS amendment, E-FIX-HARNESS report, and E-FIX-HARNESS receipt remain unchanged.

## Scope and limits

This review changed no production source, dependencies, Git state, or outer runner. It used feasibility builds and does not replace root's full fresh-build N6 chain or final integrated acceptance.
