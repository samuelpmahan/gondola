# E-FIX-HARNESS: independent capability evidence repair

## Change

Repaired the capability conformance evidence gaps identified by XR-HARNESS, within `compiled-capabilities/conformance/`:

- The `accessor-host-capabilities-property` row now constructs an own `hostCapabilities` getter with `Object.defineProperty`. Capture records the actual accessor descriptor, and the independent checker requires `optionAccessorConstructed: true`, zero getter calls, and zero Go-role and renderer calls before rejection.
- Rejected and compatible renderer swaps now retain serializable before/after state, view, DOM, pending effects, and renderer diagnostics. The checker recomputes all four raw preservation comparisons for both swaps. It does not serialize or claim callback identity: the existing physical click proves the old renderer remains live after rejection, and the retired callback's stale result plus unchanged trace and committed generation prove fencing after a real commit.
- The active incompatible candidate is derived from the unmodified compiled AppIR's required view capabilities with the selected required capability removed. The actual lifecycle AppIR requires `view.node`; the active candidate is `[]`. The synthetic N4 incompatible profile remains outside the active-swap proof.
- The checker clones the actual browser capture for nine data-mutation controls, changes one raw field per clone while keeping browser labels unchanged, and requires every mutation to throw. All nine are detected.

## Verification

Node 22 syntax checks passed for the four conformance modules. The first focused repair run is preserved at `conformance/evidence/attempt-04/`; its native/direct/browser stages completed, but a checker assertion looked for the `initialAppIRUsedUnmodified` marker under the wrong object. I corrected that checker path and retained the failed run unchanged.

The new full focused run passed with exit status 0:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/conformance/run.mjs --react-app-ir compiled-capabilities/builds/feasibility/react/output/apps/lifecycle-7e6575d90707/app-ir.json --react-compiled compiled-capabilities/builds/feasibility/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs --react-helpers compiled-capabilities/builds/feasibility/react/output/apps/lifecycle-7e6575d90707/encoder.mjs --react-manifest compiled-capabilities/builds/feasibility/react/output/buildmanifest.json --dom-app-ir compiled-capabilities/builds/feasibility/dom/output/apps/lifecycle-7e6575d90707/app-ir.json --dom-compiled compiled-capabilities/builds/feasibility/dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs --dom-helpers compiled-capabilities/builds/feasibility/dom/output/apps/lifecycle-7e6575d90707/encoder.mjs --dom-manifest compiled-capabilities/builds/feasibility/dom/output/buildmanifest.json --native-go /tmp/gondola-go/bin/go --fixture fixtures/compiled/lifecycle/scenario.json --expectations compiled-capabilities/oracle/expectations.json --chromium /tmp/chromium --output compiled-capabilities/conformance/evidence/attempt-05/conformance
```

Attempt 05 reports `matched`: 19 admission cases; 26 lifecycle events and ticks; 16 physical clicks; 7 requests; 3 cancellations; 8 inherited lifecycle mutation controls; and all 9 new capability checker mutation controls. Both raw swap preservation fields are true. The host option accessor was constructed and invoked zero times. React/DOM inputs and source pins remained stable through checking. The browser used Chromium 153.0.8010.0 and Playwright 1.64.1; no WebAssembly API attempts or requests were recorded.

The nine detected controls, in wire order, are `rejected-state`, `rejected-view`, `rejected-dom`, `rejected-pending`, `compatible-state`, `compatible-view`, `compatible-dom`, `compatible-pending`, and `host-option-accessor-construction`. The exact error strings and run evidence hashes are in the receipt.

Original E-HARNESS attempts 01–03 and the XR-HARNESS review artifacts remain untouched. Attempts 04 and 05 are retained alongside them. This focused run uses the existing feasibility builds; the root-owned full fresh-build chain and final acceptance remain separate.
