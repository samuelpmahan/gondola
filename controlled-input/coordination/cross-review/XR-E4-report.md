# XR-E4 independent review

## Decision

**ACCEPT.** I found no blocking correctness or evidence gaps in the independent reference, replay schedules, or parity harness.

## Review

- `reference.mjs` implements `initialEditorState`, `updateEditorState`, and `projectEditorSnapshot` in JavaScript with its own React state and message history. It does not import or call the Go runtime, host, or candidate renderers. It handles edit, non-empty save/repeat save, reset, disabled native controls, and projects the full tree and binding sidecar.
- The replay starts each scenario with an initial record. Its native tick uses index `0` and an empty step; later records carry sequential indices and the action step. `CompareInteraction` checks shape, index, step order/value, state, tree, and DOM. The JS comparator checks full snapshots (`state`, `tree`, `bindings`, ordered `messages`) and the raw root/HTML, input value property, disabled paths/properties, and renderer-reported HTML/disabled lists. Each field is compared both against the independent reference and between the two Go hosts, so the extended input observations are not left to the legacy comparator.
- The Go isolation probe retains both captured WASM API objects, checks distinct identity and zero-state snapshots, edits the DOM runtime, then dispatches a disabled Save to the untouched React runtime without reinitializing it. It asserts the DOM edit was recorded once and React remains empty. This is a valid independent-instance check.
- The seeded generator is deterministic for a seed and bounded by the requested action limit. It guarantees an initial fill and, when the action budget permits, a real swap. Full message arrays are compared at every observation, preserving delivered event order. Harness tests cover same-seed reproducibility and the fixed scripts cover edits, saves, reset, swaps, Unicode, typing, and stale input.
- The typing harness focuses each renderer's input and explicitly places the caret at the end before a sequence. It checks focus after every key and compares resulting state, tree, messages, and DOM. The policy is honest: caret restoration across a renderer swap is outside scope; ordinary typing within each mounted renderer is still exercised. E5's current keyboard probe additionally checks input identity and caret position after every key.
- `nativeTick` carries the legacy Gobi fields plus serialized bindings, messages, actual input value, and disabled properties. The legacy `CompareInteraction` implementation compares the legacy fields only; the harness separately compares every added field. If the native comparator is unavailable or errors, `addNativeComparisons` records mismatches for each candidate, so the CLI cannot silently skip native comparison. The fixed-only trace recorded 16/16 native comparisons as matched.
- Every returned adversarial probe with `pass: false` becomes a mismatch. Go runtime errors and page/console errors are also mismatches. I ran a targeted negative check: one failed probe and two browser errors each produced mismatches; an unavailable native comparator produced two candidate mismatches.

## Verification

- `/tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/harness.test.mjs`: **10/10 passed**.
- The retained fixed-only Chromium diagnostic at `controlled-input/build/diagnostic-fixed.json` records 8 fixed scenarios, 74 observations, zero mismatches, and 16/16 native matches. E4 reports 9/9 adversarial probes passed.
- After the E5 test-strength amendment, I also confirmed the current fixed-only Chromium output `/tmp/input-e5-amended-fixed.json`: 8 scripts, 74 observations, zero parity mismatches, 9/9 adversarial probes, zero expected-error entries, and 16/16 native matches. Disabled native clicks recorded zero runtime dispatch calls under both renderers.
- I did not run the full generated two-seed suite because the root-owned full run was in progress.

## Non-blocking coverage note

`compareEveryTick` rejects every reported failed adversarial probe, but it does not assert that the returned probe list contains the expected nine names. Current browser evidence confirms all nine ran and passed; a future harness test could guard against accidentally returning an empty or partial probe list.
