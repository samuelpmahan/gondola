# XR--HARNESS

**Decision: amend.** Attempt 04 substantiates the reported AppIR, replay, browser, swap, value-isolation, direct read-only guard, and pin results. One of the four mutation controls does not prove the semantic message-drift case its name and report claim imply. The report also needs a count clarification for the call graph.

## Verified evidence

- The actual React AppIR contains 15 symbols: 13 in the methods package (three role functions plus ten value-receiver methods) and two local `counter` functions. All signatures and call edges match `method-contract.json`, including receiver-first parameters and `(State, []gobi.Effect)` returns. The React and DOM AppIR files are byte-identical; manifests identify their respective backends. The React module is the one executed through the direct, React, DOM, and swap profiles; the DOM-built module is separately pinned and is not the module under those profiles.
- Native Go and direct emitted-module traces match byte-for-byte at SHA-256 `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`. The direct runner imports the emitted `gobiCompiled` module and encoder, compares the compiled module’s AppIR with the build AppIR, then checks the frozen method contract before running direct roles.
- The opaque-input probe encodes the original GoScript state before and after each of the 14 enabled Update calls and checks the returned state against the fixture. All 14 checks pass. PublishSaved witnesses at actions 4 and 13 preserve the original Parent count while returning Parent=2 and Parent=1 respectively. Separate direct role calls verify `childAdd` and `childReset` while ReadOnly is true; both keep original and returned state unchanged and return zero effects.
- Each React, DOM, and swap profile contains 19 trace ticks, 18 actions, 19 oracle snapshots, and 19 physical DOM snapshots. Four disabled targets (indexes 6, 9, 10, 17) were clicked with `HTMLElement.click`; each was disabled, produced no renderer callback, and yielded a suppressed trace tick with null message and dispatch ID. The other 14 actions were enabled and delivered the expected message and empty action value.
- The swap profile alternates React and DOM after every action. All 18 swaps preserve state and tick count, empty and detach the old root, and invoke one captured callback from the retired renderer. Each retired callback is recorded as stale with exactly one additional runtime fence and no trace advance.
- Attempt 04 reports four mutation-control outcomes. Wrong state, missing callee edge, and wrong DOM are valid changes to otherwise correctly shaped inputs and are rejected. The separate shallow-copy regression also detects nested Parent mutation at both PublishSaved actions. Source, output, and raw-evidence hashes were independently recomputed from the current files: 188 source pins in each before/after/final set, 149 build/native pins in each before/after-check set, and all seven run evidence pins match.

## Required amendment

The `wrong-message` mutation in `check.mjs` and `check.test.mjs` assigns `{ Name: "parentAdd", Arg: "" }`, while the actual `gobi.trace/v1` message shape is lowercase `{ name, arg }`. Attempt 04’s recorded rejection reason is an object-field-set mismatch (`Arg` was unexpected), not a changed message value under the valid shape. Keep the existing attempt and counts as historical evidence, but qualify this control as an invalid-shape check. Add a well-formed mutation such as `{ name: "parentAdd", arg: "" }` and show that the checker rejects the changed message value.

The report says “ten fixture package symbols.” The contract actually has ten receiver methods and thirteen methods-package symbols once `Init`, `Update`, and `View` are included; the full AppIR has 15 symbols after `counter.Init` and `counter.Update`. Clarify the wording.

## Limits

No harness source, renderer, runtime, fixture, native state, or Git data was changed or rerun in this review. The author’s local Chromium run and Go 1.24 native binary are correctly reported as local evidence, not managed CI. The evidence covers the fixed value-method profile; it makes no Manager, session ownership, cancellation, effect workflow, or general UI claim. The DOM-built GoScript module is pinned separately but is not directly executed by the three browser profiles.

The audit data and exact file/hash checks are retained under `compiled-methods/evidence/reviews/xr-harness/`; the repair lane should make only the focused mutation-control and report-wording amendments without rewriting attempt 04.
