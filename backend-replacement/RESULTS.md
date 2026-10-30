# Replaceable renderer evidence — 2026-10-30

This milestone makes backend replacement executable: the unchanged compiled Go counter runs through either the original DOM renderer or a new React 19.3.1 renderer, and a host swaps renderers during a live Go session. JavaScript owns the rendering/lifecycle plumbing; the existing Go Init/Update/View and message dispatch still own application behavior.

Base: `534c9d239af83c7d9d51b035d6c0f7c2d35a7bf5`, the completed interactive-counter PR #1. This work is a stacked review branch and does not change PR #1, main, the original counter, or any earlier signed source/receipt. At reconnaissance, main held the separate Inertia milestone `3b46301e69104d82298126e58e0c65565825a4c4`. PR #1 had green combined-tree CI. This milestone's local evidence is pinned to its stated branch base, not a claim that untested combinations passed.

## Observed results

| Seed | Fresh scenarios | Observed ticks | Shared click steps | Backend swaps | Detached-control checks | Invalid backend requests | Mismatches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261030 | 103 | 5,249 | 3,232 | 880 | 880 | 154 | 0 |
| 20261031 | 103 | 4,999 | 3,084 | 823 | 823 | 166 | 0 |

Each seed includes three fixed scripts and 100 generated mixed-action scripts, capped at 80 scheduled actions. Each scenario compares two isolated Go WASM instances (hosts initially on DOM and React) against the independently implemented React counter. Click steps are issued to all three implementations; swaps affect only the chosen Go host. An extra observation follows a native click on the detached old control after each actual swap. Those detached clicks must not deliver Go messages. Initial renders are also recorded.

Both Go candidates agree with the independent oracle, and with each other, on original Go state, full Gobi Node tree, ordered delivered-message log, actual mounted HTML/outerHTML, and disabled button paths. Actual DOM observations are checked separately from each backend's reported DOM. The independent reference's Node tree is a projection of its own state, not React-internal introspection. There are **412 passing native Gobi Trace comparisons** across the two seeds. Every host records **exactly one underlying Go Init per scenario**, despite repeated replacements; continued Add after a swap proves state was retained in Go, not just displayed from a cached label.

**20 Node tests** pass (12 harness/negative checks, 8 host checks). **13 browser adversarial probes** pass, including disabled native clicks, repeated/idempotent/unknown replacements, stale controls, rejected runtime errors, unsupported React Nodes/events/effects, reused roots after failed mounts, and failure after an accepted dispatch. Real Go drives the lifecycle probes; synthetic runtimes cover errors/unsupported trees the counter cannot emit. The one deliberately injected runtime error is caught only by an exact, scoped sentinel handler and recorded in `expectedErrors`; any Playwright global error, unrelated console error or duplicate sentinel remains a failure. Negative unit checks enforce this.

The visible demo passes seven states: Count **0→1→2→2→3→3→0**, with DOM→React→DOM replacement and the expected message log. A real demo check discovered that `queueMicrotask` could refresh the JSON panel before React's delegated listener updated the state. The demo now samples in a later task; its browser smoke test checks actual versus displayed DOM/state after every step. [Demo smoke log](evidence/demo-smoke.log) and [independent captured snapshots](evidence/demo-smoke.json) retain the observations.

## Commands and environment

Local verification used Linux x86_64, **Go 1.24.0**, **Node 22.23.4**, locked **React/ReactDOM 19.3.1**, **esbuild 0.28.2**, **Playwright 1.64.1**, and actual **Chromium 153.0.8010.0**. The binary is the previously provisioned npm-hosted `@sparticuz/chromium@153.0.0`; the earlier environment report describes its temporary archive-extraction workaround. Standard Playwright Chromium is configured in the new CI workflow; local evidence does not substitute for the CI result.

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH bash run.sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-backend-replacement.sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GO_COMPARE_BIN=$PWD/interaction/build/compare-interaction node backend-replacement/check.mjs --seed 20261031 --cases 100 --max-actions 80
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s backend-replacement/coordination -p 'test_*.py' -v
```

All completed successfully. The first command reran original vet/Go tests, 59 React rules, 5,000 static inputs (seed20261030), exact expected receipts and SHA256SUMS. The replacement runner reran the original mounted counter suite (107 scripts/4,473 ticks), built both backends, ran all 20 new unit tests, tested the visible demo, and ran the new replacement suite. Temporary provisioning paths above record this execution; normal installation and demo commands are in [README.md](README.md).

[Static log](evidence/static-node22.log) · [Final complete runner log](evidence/final-run.log) · [Second-seed log](evidence/second-seed.log) · [Machine-readable summary](evidence/summary.json) · [Full trace archive](evidence/replacement-traces.tar.xz)

Extract the archive using `tar -xJf backend-replacement/evidence/replacement-traces.tar.xz -C <empty-directory>`. It contains both complete browser reports plus all 412 native comparison input envelopes. Replay any envelope with `go run ./cmd/compare-interaction <input-file.json>`. Report hashes are in summary.json. Absolute original input paths in reports are provenance and can be replaced with the extracted file paths.

## Coordination and review

Six Luna6 XHigh workers, the maximum available child-agent capacity, were assigned by native **Rebalancer1.0.4 before implementation dispatch**. A second native solve assigned six independent cross-reviews, excluding every author. Each allocation achieved native/exact score600/600 with zero reported broken constraints. Platform agent controls delivered the assignments; native Rebalancer did not call agent APIs. [Coordination protocol and receipts](coordination/PROTOCOL.md) preserve actual author results, bounded repair history, dispatch acknowledgments, review decisions and negative gate checks. Acceptance lives in an explicit ledger; no fake extraction outcome was supplied to the inherited probe's extraction-only finish validator.

## Boundaries and next milestone

Demonstrated: finite counter parity and Go session/message preservation across these two concrete renderers under synchronous, serialized click and replacement scheduling. The React backend supports the counter's button/div/p, text/fragments, class/disabled and click subset. It rejects keys, effects, unsupported events and other attributes. This is a renderer adapter, not a generic Go-to-React source compiler or a completed `gobi.Backend.Emit` generator.

Pixels, focus/selection, keyed reconciliation, hydration, concurrent React scheduling, arbitrary Go components, effects, input bindings and other browser engines are untested. A renderer failure after Go accepted a message cannot rewind Go; API-driven click failures fence the host rather than silently resetting it. The caller must give one active host exclusive ownership of its runtime API. Review also noted that a caught native React callback failure may not remain visible in the demo error banner; injected-error recovery is tested through explicit APIs, not claimed as a complete product error UI.

The next coherent milestone is a second Go component with controlled text input and an explicit event-value binding contract, exercised across both backends. That would test whether replacement extends beyond the counter and expose the contract work needed for input, focus and effects, rather than extending the present finite counter claim.
