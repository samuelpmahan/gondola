# Compiled value methods: execution status

This milestone starts from PR12 source `195c9433179218348d4b9f2477ae1e0725337d15`. Repository inspection found the interactive counter already implemented and executed in PR1, with compiled Go applications and replaceable DOM/React renderers in PR11/12. The new capability is bounded concrete value-receiver method compilation with reachable local dependency analysis. Main is unchanged; this work is intended for a stacked feature/review PR.

**Frozen source checkpoint:** all implementation repairs have independent acceptance. Full local attempt `attempt-20261031T035244499Z` is running against 137 unchanged input hashes; fresh CI is pending. This checkpoint does not claim those unfinished gates passed. The final PR description and a separate immutable evidence commit will record their actual outcome without changing the tested implementation head. Generated execution receipts can therefore be running or historical at this source checkpoint.

## Executed local evidence

| Check | Observed result | Evidence |
| --- | --- | --- |
| Native method fixture | 19 ticks from 18 intents; 14 dispatches and four suppressed intents; scalar/nested-value isolation and direct read-only guards pass | `coordination/reports/E-FIXTURE.md`, `evidence/fixture/` |
| Compiler | Actual React and DOM CLI builds: one app and 67 outputs each; same AppIR/encoder; separately pinned raw modules | `coordination/reports/E-COMPILER.md`, `evidence/compiler/` |
| Supported/rejected source contract | Focused analyzer tests and native AppIR replay pass; v1 schemas and role ABI unchanged | `CONTRACT.md`, `coordination/reports/E-CONTRACT.md` |
| Independent browser oracle | Six Node 22 tests pass; raw matrix observations independently checked against literal state-to-DOM/control expectations | `coordination/reports/E-BROWSER.md`, `evidence/browser/` |
| Native/direct/browser comparison | Attempt04 matches native Go, direct emitted module, React-only, DOM-only, and alternating profiles: 19 ticks, 18 swaps, 18 retired-callback fences, no page errors or WASM use | `evidence/harness/attempt-04-final/` |
| Emitted module value isolation | All 14 enabled updates leave the original opaque state unchanged, including both saved-value publications; two direct read-only messages preserve state with no effects | `evidence/harness/attempt-04-final/methods.value-semantics.json`, `methods.read-only-guards.json` |
| Root focused verification | Uncached native adapter tests and 10/10 Node22 tests pass; all24 original M0 checksum entries match | `evidence/integration/focused-checkpoint.json` |
| HTTP demo probe | Passed against the preserved original module: 14 Go actions, three renderer switches, expected final saved-value state, no page errors or WASM | `evidence/demo/http-probe/attempt-20261031T034015684Z/`, `evidence/builds/README.md` |
| Harness repair | Semantic message-value mutation now rejects at `message.name`, with the field schema unchanged; fresh local matrix and independent repair review pass | `coordination/reports/R-HARNESS.md`, `coordination/reports/XR-R-HARNESS.md` |
| Compiler selection repair | Isolated pre-fix tests reproduce admission of method-expression/promoted applications; repaired source rejects them and preserves direct builders; scoped tests/race/vet, fresh CLI builds, and independent repair acceptance pass | `coordination/reports/R-COMPILER.md`, `coordination/reports/XR-R-COMPILER.md`, `evidence/repairs/r-compiler/` |
| Full inherited chain and fresh HTTP demo | Fresh full attempt is running after source repair/review gates; the first full attempt is retained as aborted with source-pin mismatches | `artifacts/attempts/`, `evidence/demo/attempt-01-canceled/`, `coordination/receipts/E-DEMO.json` |
| Independent acceptance | Fixture/browser and all three repair reviews accepted; final full execution acceptance remains pending | `coordination/reports/XR--*.md`, `coordination/reports/XR-R-*.md` |

The method graph has **ten receiver methods, three fixture package role functions, and two original-counter dependency functions**. Receiver-qualified IDs distinguish same-named methods on different types. The browser matrix uses the React build's concrete GoScript module across both renderers; the distinct DOM build is separately emitted and pinned. Raw build hashes are not claimed identical.

These runs used Go1.24.0 for native application code, Go1.27.3 for the compiler module, Node22.23.4, pinned React/ReactDOM19.3.1 and GoScriptv0.6.2, and local Chromium153.0.8010.0 via `CHROMIUM_PATH=/tmp/chromium`. Exact per-command versions, arguments, input/output hashes and traces are in the receipts. Managed GitHub Actions execution for this new checkpoint is pending.

The method-specific action script is fixed, not randomized; it has no seed. The inherited chain's randomized seeds and counts must be read from the completed run rather than inferred from earlier PR12 evidence. Milestone0's original receipts are preserved; its prior PR12 pass is historical evidence until this full run finishes.

## Preserved failures and limits

Attempt01 exposed a checker bug expecting uppercase Go message fields where the versioned trace uses lowercase fields. Its raw failure and later attempts remain retained. Independent review subsequently found the `wrong-message` mutation control still used uppercase keys: its rejection proved shape drift, not a well-formed changed message. R-HARNESS repaired that acceptance gap and its independent review accepted the fresh matrix; original author/review evidence remains unchanged. The first full default attempt was aborted with exit130 after two concurrent checker edits; its final mismatch set also includes the later runner reporting correction. It cannot count as an exact-checkpoint pass. Two HTTP smoke-probe failures exposed assertion bugs (joined DOM text and a mismatched no-WASM observation key); their receipts/logs are retained alongside the accepted probe.

An exploratory broad `go test ./...` inside the nested compiler module fails in an unchanged archival source-snapshot directory under `compiled-frontend/coordination/reviews/xr_r_abi_codec/source-snapshots`. The author retained the failure and proof that those snapshot files match the baseline. The supported compiler runner checks its live packages explicitly; this milestone does not rewrite historical snapshots to make them buildable.

This is finite synchronous serialized behavior in Chromium for the method fixture. It does not establish arbitrary Go equivalence, general deep copying of reference-bearing values, pointer/interface/generic dispatch, full compilation of `composition.Manager`, session ownership, cancellation, effect completions, focus/selection preservation for this button-only fixture, other browser engines, concurrent React scheduling, hydration, IME, or pixels. Earlier milestones have separate evidence for some of those application behaviors; it does not transfer automatically to this compiler profile.

## Next composed milestone

Compile a bounded typed parent/child session lifecycle through this method-capable path: independent state and inputs, saved-value publication, pending effects, renderer replacement, and child-first disposal with stale-callback fencing. That requires an explicit supported representation for manager ownership and reference-bearing state, source validation for the required operations, native/direct/module/browser traces, and an adversarial cancellation/late-reply matrix. This milestone supplies concrete value methods as a tested prerequisite; it does not claim that lifecycle capability yet.
