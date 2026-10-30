# Multi-root verification results

The full entrypoint exited zero on 2026-10-30. This draft awaits independent
review of the final RE5 oracle repair: the assigned Luna reviewer exhausted
its usage allowance before acceptance. XR-E5's original amend is preserved.

## Reproduce

```sh
bash run-multi-root.sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
# Open http://127.0.0.1:8000/multi-root/demo.html
```

Exact local command, with dependencies already provisioned:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GOTOOLCHAIN=local GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-multi-root.sh
```

Go 1.24.0; Node 22.23.4; React/ReactDOM 19.3.1; Playwright 1.64.1;
Chromium 153.0.8010.0; native Rebalancer 1.0.4.

## Executed results

| Gate | Result |
| --- | --- |
| Milestone 0 | 5,000 cases matched; original 24 SHA256SUMS entries pass |
| Counter | 107 scripts / 4,473 ticks, native matched |
| Backend replacement | 103 scripts / 5,249 ticks, native matched |
| Controlled input | 216 scripts / 10,149 observations, native matched |
| Async effects | 76 scripts / 1,552 observations, native matched |
| HTTP effects | 82 scripts / 1,572 observations, native matched |
| Keyed editor | 70 scripts / 1,113 observations, native matched |
| Renderer conformance | 71 scripts / 1,184 observations, native matched |
| Multi-root unit tests | 34/34; 39/39 including adapter tests in focused run |
| Multi-root browser demo | All five assertions pass |
| Multi-root replay | 63 scripts / 1,896 actions / 1,959 ticks / 11,754 actor observations; zero mismatches |
| Multi-root native comparator | 193/193 session segments matched |

Seeds: 20261030,20261031; 30 generated cases per seed, maximum 40
actions, plus three directed witnesses. [integration-final.json](evidence/integration-final.json)
records exact commands, channels, negative controls, toolchain, raw report hash
and preservation audit. Raw traces are generated under ignored build/ and
uploaded by CI. Earlier [replay-final.json](evidence/replay-final.json) is the
author run before RE5; its counts are historical.

## Repairs and review

Compact failed traces preserve 75 initial mismatches, 1,938 cancellation
observation mismatches and 58 focus/generator mismatches. Cancellation capture
waits at most ten seconds for server abort observation, failing on timeout;
ordered transport events remain compared. Collapsed caret direction is
normalized; noncollapsed selection direction remains exact. Generated saves
require the current draft to be nonempty.

Independent review caught queued cancels lost during disposal; its repair has
independent acceptance. The raw Go bridge error-frame adapter repair also has
independent acceptance. XR-E2/3/4/6 accepted their slices. XR-E5 found an
unchecked fabricated lifecycle history and seeds exceeding maxActions. RE5
adds exact per-tick event derivation, cumulative history/parity, ownership and
order checks, and hard action bounds. Tests and integrated replay pass;
independent XR-RE5-RE5 remains pending due the worker usage limit.

Six Luna 6 XHigh workers occupied all six available child slots. Native author
allocation scored 600/600 with zero broken constraints. The probe allocates
packets; collaboration tools separately dispatch actual agents. Inspect the
coordination states, native bundles, reports and receipts. Final review
acceptance has not been fabricated. Remote CI status is recorded on the PR.

Historical manifests remain unchanged. Rechecking their 650 pins found four
intentional renderer source/test changes for instance handles; prior bytes
remain in base commit 47728575f6f9a7989e3e380bc0acf2d4b242180b.
All other pins and Milestone 0 receipts pass. The final receipt lists each
exception with old/new hashes.

## Guarantees and next boundary

Finite Chromium tests compare Go state, Gobi trees, bindings, ordered messages,
audits, transport/server observations, mounted DOM, live values, disabled
controls, focus/selection and lifecycle histories against independent React
sessions. The demo exercises three roots, duplicate request IDs in separate
lanes, replacement, scoped disposal/cancellation, rejected late release,
sibling continuation and fresh remount.

Nested components, shared transactions, other browser engines, IME, pixels,
hydration and production services remain untested. Another backend must
implement the Go-generated renderer contract, return independent instance
handles, obey scoped dispatch/cleanup, preserve logical focus and pass the
fixtures and deterministic native/browser comparisons. The next coherent
milestone is typed parent/child ownership with nested lifecycle and effect
cancellation, after the pending independent repair review.
