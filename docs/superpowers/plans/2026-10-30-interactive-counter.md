# Interactive counter implementation plan

Goal: advance the existing Go counter to a mounted WebAssembly experiment, comparing deterministic browser actions against an independent pinned React reference.

Authorization: the user explicitly requested implementation, execution, branch/review publication, and maximum concurrent Luna 6 XHigh coordinated using Rebalancer. The six available worker slots are used. Main is not a landing target in this task; the feature branch is the review checkpoint.

Architecture: preserve counter.Init/Update/View and the signed Milestone 0 source/receipts. A native-testable Session resolves child-index paths against the current Node and dispatches declared handlers. A Go WASM bridge exposes synchronous snapshots. A browser adapter constructs mounted DOM. An independent React counter uses React state and renders the same specified counter. A seeded harness clicks both roots and compares state, full Node trees, outerHTML, disabled properties and ordered messages after each action.

Scope: counter-only DOM subset, serialized click actions plus explicit rapid bursts. No generic Go-to-React compiler, keyed reconciliation guarantee, input/focus preservation, effects, pixels, hydration, accessibility audit, or general event equivalence claim.

Owned lanes:
- runtime: interaction/session.go, session_test.go, cmd/counter-wasm/.
- DOM: interaction/dom.mjs, demo.html.
- harness: interaction/check.mjs, react-reference.mjs, scripts.mjs, JS tests.
- comparison: new gobi/compare_interaction*.go; preserve build.go.
- environment: run-interaction.sh, isolated pinned package manifest/lock, CI workflow.
- scheduling: native Rebalancer inputs, solver receipts and independent reviews.
- lead: integration, documentation, validation and GitHub publication.

Each lane writes focused regression checks first where executable, implements within its ownership, reports exact checks and limitations, and receives independent cross-review. Dependency failures must remain reported failures rather than fabricated passes.

Acceptance checks:
- original bash run.sh reproduces 59 compatibility rules, 5,000 cases seed 20261030, original receipts.
- Go tests exercise declared handler selection, disabled zero reset, repeated Add, alternation and invalid paths/events.
- browser harness saves initial and every subsequent tick, mismatch details and seeds; compares independent mounted implementations including disabled .click suppression and event ordering.
- negative comparator tests reject unequal states and reordered events even if DOM matches.
- exact tools/commands and evidence are recorded; demo runs from the generated build.
- branch plus pull request contain no generated build/dependency directories and preserve original signed bytes.

Review focus: disabled programmatic .click versus forced events; synchronous React flush versus batched bursts; stale listeners on full redraw; nil slices versus empty arrays in canonical trees; full replacement destroys identity/focus and is outside the counter claim.

Execution: local environment provisioning; implementation lanes in parallel; native solver cross-review allocation; repairs by original owners; checkpoint explanation; static and interaction suites; independent review; commit and publish review PR without merging.
