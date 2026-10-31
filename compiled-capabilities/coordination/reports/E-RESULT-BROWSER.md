# E-RESULT-BROWSER

**Outcome: insufficient evidence.** The current local full attempt contains a matched browser conformance result, and an independent read-only audit of its raw capture passed. The outer E-BUILD receipt nevertheless ended `failed` and the runner returned exit code 0. N4's hosted CI artifact review is still pending, so this packet makes no milestone or hosted-artifact acceptance claim.

## Browser evidence reviewed

The local full attempt is `compiled-capabilities/builds/attempts/attempt-20261031T095356051Z`, bound by E-RESULT-PROVENANCE to local commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c` and published source commit `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`, both at tree `d22b75e18c7bea70a743cc79d53461b287c7d045` with the frozen base as their direct parent.

I audited the browser capture and check JSON directly with the read-only script under `compiled-capabilities/ci/2026-10-31/lanes/browser/`. It recomputed case IDs from the literal oracle; checked admission call counters; compared raw before/after state, view, DOM, and pending data; derived the incompatible active renderer profile from the built React AppIR; recomputed the five-tick event/effect trace; and compared the capture and check outputs with the conformance runner's source, build-output, evidence, and browser-bundle pins.

The raw evidence confirms:

- All 19 admission stimuli appear exactly once: seven missing-capability cases, six strict host declaration cases, and six strict renderer declaration cases. Every row reports `TypeError`, zero Init/Update/View calls, zero renderer calls, and an empty physical container.
- The host option accessor case records an own getter descriptor constructed and zero getter calls. The pinned browser source uses `Object.defineProperty` and derives the witness from `Object.getOwnPropertyDescriptor`; the host option and capability-array getters remain uninvoked.
- The actual compiled AppIR declares `view.node`, numeric capabilities, `effect.request-reply`, and `effect.cancel`. Its only required renderer capability is `view.node`; the active incompatible candidate has `[]`, omits `view.node`, calls no candidate methods, and rejects at admission before unmount.
- Raw state, view, DOM, and pending values match before and after both the rejected and compatible swaps. After rejection, the old active click adds one tick on the retained generation. The compatible commit detaches the old root; an old callback is rejected as stale without changing the committed trace; the pending reply is then accepted.
- The physical Request button reports `disabled: true` when clicked. The attempt leaves the trace at the same tick count. The five-tick trace and the nine-step browser event order match the captured request, old active click, commit, callback fence, and reply sequence.
- All nine raw capture-data mutation controls and all eight inherited lifecycle controls were detected. The inherited lifecycle check records 17 swaps, 26 events, and 26 ticks.

The local browser audit passed; it does not override the outer full-run result. E-BUILD failed only its `inherited-static-and-interaction-lifecycle` text predicate: it looked for “inherited compiled-methods,” while the nested passed receipt says “fresh full run-compiled-methods.sh completed.” The nested lifecycle receipt reports passed with zero failures. E-RESULT-PROVENANCE records that all 16 commands exited zero and the outer runner also returned zero despite the failed stage, creating a false-green CI risk.

## Hosted CI and acceptance boundary

The primary hosted push run is `41190743932` for the published `a2e1164d…` source. Root reported its hosted status green, while N4 was still downloading and verifying the immutable artifact at this packet's close. This report does not treat a green workflow status as acceptance and does not claim that I inspected the hosted capture. N4 remains the sole owner of that artifact and its catalog.

E-RESULT-PROVENANCE separately records a 161-pin source audit, the local/published tree and parent binding, and all 24 M0 rows as verified. Its N1 auditor invocation failed to parse the runner's `new Set([...])` declaration before its own pin/M0 checks. Those provenance results are not expanded or replaced by this browser-lane review. The full local E-BUILD receipt is failed, the hosted raw artifact has not been independently reviewed here, and the result is therefore **insufficient evidence**.

## Preserved evidence

The local full-run archive and N6 execution receipt remain in the attempt directory. The browser audit code, its JSON result, stderr, and exit code are under `compiled-capabilities/ci/2026-10-31/lanes/browser/`. This review made no production, runner, Git, or provider changes and did not rerun the browser or full suite.
