# XR-G-CONFORMANCE

**Decision: amend.** The partial conformance result is supported: native and independent direct-JavaScript traces match for all four fixtures; counter alone passes the mounted-browser checker; the form, list, and effect browser failures are real renderer admission errors with stable final provenance. Amend the stale provenance input counts in `G-CONFORMANCE.md` and `G-CONFORMANCE.json`. This review does not treat the three browser rejections as false positives or require the full milestone to pass before accepting the partial evidence.

## Confirmed partial result

- Read-only comparison of the saved native/direct traces confirms exact equality across 31 ticks: counter 5, form 10, list 11, effect 5. The original native/direct comparison command reported the same summary.
- Replaying `checkConformance()` on the saved counter inputs reproduces the saved `counter.check.json` exactly: matched, five ticks, 17 detected mutation controls, zero WASM requests/API attempts. Both the physical container and renderer snapshot are empty after unmount.
- The saved browser failures are consistent with their raw stages: form and effect reject at mount; list rejects while applying action 0. Each final failure manifest has 96 matching before/after inputs, an empty changed-input list, and a failure hash matching its failure JSON. The same `Node.Attrs.backing has unsupported symbol properties` error appears in all three.
- The independent GoScript slice probe records the form node’s Attrs slice as a GoScript wrapper with backing length 4, offset 0, length 3, capacity 4, and a `Symbol(goscript.spareZero)` function property with writable, enumerable, configurable data descriptor. The renderer’s captured rejection is therefore tied to an observed input representation. The effect browser failure happens at mount, so it does not establish or resolve effect completion behavior.

## Required correction

The report and receipt state that direct manifests contain 94 inputs and browser provenance contains 95. The final `n6-source-900dc38-r2runtime` evidence instead has 95 inputs in each direct manifest and 96 in the successful counter browser evidence and each failed-browser manifest. The additional source is `frontend/runtime/r2_completion_probe.mjs`, which the provenance scanner includes from the runtime directory; the browser capture adds its generated bundle. Correct the counts to **95 direct / 96 browser**. The failure manifests remain stable at those counts.

The earlier parallel capture is not equivalent evidence for source instability: its list and effect records differ only because the prior form failure bundle was included in the source walk. The preserved sequential rerun has stable hashes and no changed paths for all three failures. The final `r2runtime` sequential capture is also stable. This distinguishes a generated-evidence inclusion artifact from a compiler or application source change.

## Checker audit

The checker compares typed state against AppIR and fixture expectations; exact ordered views and Go messages across native/direct/browser traces; requested and completed effect correlations; and browser DOM against a hand-authored fixture oracle. Renderer-observed lowerCamel Action, requested intent, and uppercase Go Message remain separate fields. A checker test exercises a literal handler whose target value differs from its requested intent; the successful counter browser actions use empty values, and form never mounts on this checkpoint, so that divergent-value case is not demonstrated in a successful mounted-browser run.

The counter checker also detects mutations to action, message, state, effects, tree, bindings, DOM, and post-unmount DOM. Unit tests verify focus selection range and direction fields, but the list browser fails before its focus witness is reached; keyed-node focus and backward selection preservation remain unproven in mounted browser. The report correctly leaves effect completion ordering, list focus/selection, detached-handler behavior beyond reached stages, and callbacks after runtime unmount unproven.

## Verification

Under Node `v22.23.4`, the original ten-file conformance suite passed **37/37**, and `conformance/check.mjs` passed `node --check`. A later full-glob run passed **40/40** after `list-growth.test.mjs` and `provenance-order.test.mjs` appeared in the shared tree. The latter run is recorded separately; this bounded review did not audit the new fixture feature.

The 57 files listed in the final `r2runtime/SHA256SUMS` all passed checksum verification. No four-app browser rerun was performed because the React and codec source gates were still open. The reviewed browser evidence remains pinned to renderer `9f10b75d…68868e5a` and runtime `ab0a2fe8…b26704`; recapture after the gates freeze.

One scope note: I invoked N6’s `verify-native-direct.mjs`, which rewrites `native-direct-summary.json`. Its resulting bytes retained the preexisting receipt hash `53f1db1f…9155ba`; no trace or failure artifact changed. I used a second read-only comparison for the retained audit log.

Supporting evidence and test logs are in `coordination/reviews/xr_g_conformance/`. The machine-readable review record is [audit.json](../reviews/xr_g_conformance/audit.json).
