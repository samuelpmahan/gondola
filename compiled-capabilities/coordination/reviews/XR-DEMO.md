# XR-DEMO: independent review of the capability demo

## Decision

**Accepted.** The demo uses the actual compiled lifecycle AppIR module, encoder and Go Init/Update/View exports. The page does not implement application state transitions in JavaScript. Its explicit effect host support and actual DOM/React view profiles are displayed, and the interaction sequence matches the frozen capability milestone.

## Review findings

- The build checks the compiled lifecycle package and its AppIR requirements before bundling the emitted module and encoder into the HTTP demo. The lifecycle host exports a frozen `LIFECYCLE_HOST_CAPABILITIES` array and passes it to `mountCompiledApp`; the UI displays that exact host profile.
- The DOM and React renderers each expose the exact frozen profile `view.node`, `binding.value`, `binding.checked`. A review-only browser probe confirmed the active DOM profile, switched to React, and switched back; it also confirmed the exported host array cannot be mutated and that its displayed values match.
- The smoke creates an empty-profile candidate for the active React renderer. The runtime rejects it during admission. The smoke compares the live Go state, logical view, tick trace, pending request and physical DOM before and after rejection; it also confirms the same parent control node remains mounted and dispatches successfully afterward.
- A compatible React→DOM recovery keeps the pending request; the manual host delivers its reply into compiled Go Update. The exact tick sequence is `addParent`, `requestParent`, `addParent`, `complete`, with dispatch IDs `dispatch-0001` through `dispatch-0004`. Injecting a click into the disabled pending request adds no Go tick.

The E-DEMO author receipt records an initial smoke failure: the first parent-add selector matched three nested buttons, and the first tool output was not saved. The source was narrowed to the Parent's direct child button. I did not claim that no prior failure occurred. My fresh build and smoke against the corrected frozen source both passed.

## Verification

Node was `v22.23.4`; Chromium was `153.0.8010.0`; React and ReactDOM were `19.3.1`.

- All four demo/profile-probe JavaScript syntax checks passed; raw output is in `reviews/XR-DEMO/logs/check-*.log`.
- Fresh build from `compiled-capabilities/builds/feasibility/react/output` passed. It emitted a 1,846,155-byte bundle with SHA-256 `b395ae7366fa39c1654bb96600660d883482c1bb7af20c30dd5bd6cd4cf009fe` and AppIR requirements `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`.
- HTTP/Playwright smoke passed all 8 checks on ephemeral port 41025. `/`, `/demo.css`, and the bundle returned HTTP 200; browser errors, console errors, failed requests, and WebAssembly requests were all empty.
- The review-only browser profile probe passed its 2 checks for frozen host export and actual DOM/React declarations and display.
- Screenshot: `reviews/XR-DEMO/demo.png`. Build output, smoke JSON, profile JSON, screenshot, and exact logs are preserved under `reviews/XR-DEMO/`.

The demo files are additions relative to base `00da54ad0f5a4006b13a5cded18ce291845978bc`. Current demo source hashes match the E-DEMO author receipt. This review ran the fresh demo build and smoke only; the integrated N1–N6 milestone run remains pending. No production files were modified.
