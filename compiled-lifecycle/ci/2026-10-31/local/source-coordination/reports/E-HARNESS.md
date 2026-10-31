# E-HARNESS — N3 lifecycle conformance

**Outcome:** `mixed_change` — a new deterministic harness and independent checker were added, then the frozen Go lifecycle fixture matched across native Go, direct compiled-module replay, React, standalone DOM, and alternating renderer replacement.

## What was checked

The harness replays the exact 26-event `compiled-lifecycle-parent-child-grandchild-remount-fence` fixture. The Go native CLI and emitted GoScript `Init`/`Update`/`View` paths agree with the literal independent oracle for all 26 state ticks, messages, effect requests and cancellations, and view trees. The browser profiles each record 27 snapshots (initial state plus every event), including normalized rendered HTML and live button properties.

The accepted matrix reports 16 physical clicks, 7 requests, and the child-first cancellation order `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`. The pending requests survive the required DOM-to-React replacement. The alternating profile makes 17 replacements: 16 click-driven swaps and the fixed event-8 swap. Six retained parent/child/grandchild add/request buttons are clicked after remount in each profile; all 18 detached-button probes leave Go ticks, state, callbacks, pending effects, effect records, and physical HTML unchanged. Old-generation completion attempts are rejected by the runtime after cancellation; direct stale `complete` messages reach Go and match its no-op state/view behavior. Duplicate reply probes also match.

Sixteen retired renderers had an actual user-action callback to replay, and both retired dispatch and stale callbacks were fenced for each one (32 callback fences). The fixed event-8 swap retires a newly mounted DOM renderer that had not received a user action. The harness records that it had no retained callback to probe and checks that the swap preserved state, tick count, pending effects, and the physical root lifecycle. It does not claim callback-fence evidence for that one ineligible renderer.

All 8 negative mutation controls were detected: native cancel order, direct stale-generation state, direct message, React physical DOM, DOM disabled property, swap effect correlation, detached remount button coverage, and browser cancel order. React, DOM, and swap profiles each unmount to an empty root. Browser WebAssembly API attempts and network requests are both zero.

## Reproduction

Run from the repository root with Node v22.23.4, Go v1.24.0, and Chromium 153.0.8010.0:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/conformance/run.mjs \
  --react-app-ir compiled-lifecycle/builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/app-ir.json \
  --react-compiled compiled-lifecycle/builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs \
  --react-helpers compiled-lifecycle/builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/encoder.mjs \
  --dom-app-ir compiled-lifecycle/builds/feasibility/final/dom/output/apps/lifecycle-7e6575d90707/app-ir.json \
  --dom-compiled compiled-lifecycle/builds/feasibility/final/dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs \
  --dom-helpers compiled-lifecycle/builds/feasibility/final/dom/output/apps/lifecycle-7e6575d90707/encoder.mjs \
  --react-manifest compiled-lifecycle/builds/feasibility/final/react/output/buildmanifest.json \
  --dom-manifest compiled-lifecycle/builds/feasibility/final/dom/output/buildmanifest.json \
  --native-go /tmp/gondola-go/bin/go --chromium /tmp/chromium \
  --output compiled-lifecycle/conformance/evidence/attempt-05/lifecycle
```

The fixture and generated React/DOM AppIRs share the canonical component ID `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`; the runner verifies that identity and both required AppIR capabilities. The final run and check both report `matched`. Source pins (178 files) and build-input pins (8 files) remained stable before, during, and after checking. The run records tool versions, command arguments, and SHA-256 pins.

Harness syntax checks passed, and the three N3 checker tests passed. The independent browser oracle's existing unit suite has one stale expected-effects assertion: it expects only the cancellation row while the frozen fixture now contains seven request rows plus that cancellation row. N4 recorded this as outside the frozen E-ORACLE lane; the full browser output was independently checked against its literal DOM/state API in the attempt-04 capture and the final attempt-05 run.

## Evidence

Final raw traces and hashes are captured under `compiled-lifecycle/conformance/evidence/attempt-05/`:

| Artifact | SHA-256 |
|---|---|
| `lifecycle.native.json` | `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5` |
| `lifecycle.direct.json` | `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71` |
| `lifecycle.browser.capture.json` | `78886a28fc0ac6e519a21b4765167aabea6d394bf539e05b725bb2a1aabe4763` |
| `lifecycle.check.json` | `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a` |

The complete source/build pin lists, tool versions, stage timestamps, and commands are in `lifecycle.run.json` and `lifecycle.manifest.json`. Earlier rejected attempts remain alongside the accepted attempt with their raw failures preserved; attempt-05 is the only accepted matrix.
