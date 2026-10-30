# Controlled input across replaceable renderers

Base: PR #2 at `0f160357b65e3cd39a6f5c8aa7a19e8a028ccfb8`. PR #1 and #2 are complete, open and green; main remains the separate Inertia milestone at `3b46301e69104d82298126e58e0c65565825a4c4`. Fresh branch/PR inspection found no overlapping input work. Stack this review on PR #2; no merge/deployment. All inherited files and receipts stay byte-identical.

The lead chooses a bounded editor workflow: type text, save the exact draft, repeatedly save, reset, and switch renderers while retaining Go state and ordered messages. Go owns all transitions. A new explicit binding sidecar transports browser input values without changing the fixed literal argument meaning of `gobi.On`. A magic argument sentinel would weaken that existing contract; changing the signed Node type would rewrite historical evidence. New packages plus a sidecar avoid both.

## Frozen shared contract

New `inputbinding` package: string Source type with `TargetValue = "target.value"`; Binding has exported Path, Event, Message strings and Source. View has Tree gobi.Node and Bindings []Binding. Validate(view) error rejects ambiguous/duplicate/colliding/unsupported bindings and malformed paths; Resolve(view, gobi.Step) (gobi.Message, error) selects declared bindings or unchanged literal On handlers. Only input[type=text] with exactly one value attribute, event=input, source=target.value is dynamic in this milestone. Both Go and browser validators reject unsupported semantics. No application-specific message whitelist belongs in the generic binding resolver.

New `editor` package: State{Draft string; Saved string; Saves int}. Init returns zero state. Update receives gobi.Message: edit sets Draft=Arg; save when Draft != "" stores exact Draft in Saved and increments Saves (repeat saves count); reset clears all fields; unknown message leaves state unchanged. No effects. View returns inputbinding.View, stable topology:

| Path | Node |
| --- | --- |
| root | div class=editor |
| 0 | input type=text, value=Draft, aria-label=Draft; no literal On |
| 1 | p children "Saved: " and Saved |
| 2 | p children "Saves: " and decimal Saves |
| 3 | button class=save, literal click/save/empty Arg, text Save; disabled iff Draft=="" |
| 4 | button class=reset, literal click/reset/empty Arg, text Reset; disabled iff all state fields zero |

Bindings is always [{Path:"0",Event:"input",Message:"edit",Source:"target.value"}]. Snapshot JSON top-level {state,tree,bindings,messages}; nested Go fields retain PascalCase and nil slices as emitted by Go. messages is the complete ordered delivered-message log, a non-nil [] when empty. New editor.Session exposes NewSession(), Snapshot(), Dispatch(gobi.Step)(Snapshot,error); disabled events suppress messages; invalid dispatch is atomic. cmd/editor-wasm publishes globalThis.gobiEditor={init(),dispatch(step)} following counter WASM conventions; no counter changes.

Browser modules all new under controlled-input/. `protocol.mjs` validates snapshots and binding subset and exports common helpers (owner E2 announces API to E3/E4/E5). `dom.mjs` exports mountEditorDOM(root,runtime); `react.mjs` exports mountEditorReact(root,runtime), pinned React19.3.1. Mount functions satisfy the existing backend-replacement/host.mjs interface: snapshot(),domSnapshot(){html,disabled},click(path),unmount(). The unchanged host keeps one Go initialization and fences stale renderers. Native input events read currentTarget.value and dispatch a Go Step; literal clicks retain declared Arg. DOM patching preserves the input element/focus while editing; React uses onInput plus controlled value and synchronous flush. Swap focus/selection, IME composition, asynchronous/concurrent scheduling, effects, arbitrary Node support and pixels remain outside scope.

Independent React reference implements editor transitions itself and projects its own state into the same Node/binding contract. It never consumes Go snapshots. Browser harness uses two isolated Go WASM runtimes starting with different backends and one reference. Input actions use actual Playwright fill/typing; click actions use native click; swaps affect one Go host. Compare state, tree, bindings, complete ordered messages, raw actual DOM, input value property, disabled properties and focus stability during ordinary typing after every observation. Preserve full traces and run native Gobi Trace comparison (binding/property/message checks supplement native fields). Fixed cases cover empty input, repeated saves, reset at zero, alternating edit/save/reset, Unicode/escaping, swaps with unsaved text, and detached input events. Deterministic generated sequences use explicit seeds. Test negative comparisons, contract errors, stale generations and ordinary multi-keystroke typing.

## Six disjoint lanes and dependency gates

Native Rebalancer1.0.4 solved six slots before dispatch, native/exact600/600, zero broken constraints. Actual platform capacity is seven total including root; six free children were observed. Root alone owns Git, coordination receipts, final evidence and integration. Workers cannot edit inherited files, switch Git, commit or publish.

| Packet | Scope | Owned paths | Gate |
| --- | --- | --- | --- |
| E1 | Go contracts/application/runtime | inputbinding/, editor/, cmd/editor-wasm/ | Frozen contract above; unit tests then downstream execution |
| E2 | DOM + shared browser protocol | controlled-input/protocol.mjs, dom.mjs, protocol.test.mjs, dom.test.mjs | Announce helper API early; runtime fixture validation independent of WASM |
| E3 | React renderer | controlled-input/react.mjs, react.test.mjs | Consume E2 helpers only after API announcement |
| E4 | Independent reference + replay | controlled-input/reference.mjs, check.mjs, scripts.mjs, harness.test.mjs | Implement from frozen contract; real browser execution waits E1/E2/E3/E6 assets |
| E5 | Adversarial probes | controlled-input/adversarial.mjs, adversarial.test.mjs | Review contracts now; execution waits renderer/runtime artifacts |
| E6 | Demo/runner/CI/usage | controlled-input/demo.html, demo.mjs, demo-smoke.mjs, README.md, run-controlled-input.sh, .github/workflows/controlled-input.yml | Build all required new assets and inherited regressions; demo uses same public APIs |

Every lane supplies concrete tests and an actual completion report. Lead acceptance of all author packets gates a fresh native cross-review solve excluding authors. Preserve independent reviewer reports, fixes and exact acceptance receipts; native solver assignment and platform dispatch remain distinct. Reuse prior coordination adapter without mutating its files or historical ledger. No invented native extraction completion.

## Acceptance and evidence

- [x] Meaningful Go contract/session tests, browser validator negatives, independent parity comparisons and real demo smoke pass.
- [x] Original static 59 rules/5000 cases/exact hashes, original counter interactions and renderer replacement regressions pass under Go1.24/Node22.
- [x] Two input seeds, exact commands/versions, all mismatches/fixes, complete reproducible traces and tested/untested guarantees recorded.
- [x] All inherited signed manifests verify; review publication follows this frozen checkpoint; CI is checked separately on the PR.

Implementation is authorized by the user's explicit autonomous development/review request. No additional design approval is needed for these bounded engineering choices.
