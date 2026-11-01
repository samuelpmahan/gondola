# XR-HARNESSCONTROLS — independent review

**Worker:** N2  
**Job:** XR-HARNESSCONTROLS  
**Decision:** `accepted`  
**Score:** 400/400; 0 broken items

## Review result

The sealed E-HARNESSCONTROLS packet fixes the N6 conformance failure caused by the obsolete exact-eight capture-control check. The new validators require the explicit 16 capture IDs and seven build-admission IDs, unique IDs, a `detected` report, every row rejected with a nonempty failure path, and totals derived from and equal to each rejected array. Capture extras require the explicit boolean `allowAdditionalControls: true`; build-admission extras remain disallowed. The fresh summary contains 16/16 capture controls and 7/7 build controls, all uniquely identified and rejected.

Independent checks verified the sealed report and receipt hashes, all 34 author rawlog entries, all nine sealed conformance source files against both the working tree and archived source copies, and the preserved N6 failure witness. The witness remains at `attempt-20261101T031902805Z-2-00c0492f/conformance/effects.failed.json` with SHA-256 `d366f7aa9956d42c35a22d77343e5e16e81b308229ecee528162c7a5ddafbaeb`.

## Reproduced checks

The focused mutation-control suite passed 11/11 tests. The nine structured probes passed, including rejection of zero controls, missing IDs, duplicate IDs, undetected controls, count mismatch, unapproved extras, ID/name mismatch, and a non-boolean extra policy; a valid extra is accepted only with explicit permission. The full Node inventory passed 32/32.

I independently loaded and hash-checked the 28 saved capture files (68,555,460 bytes), then replayed each scenario through the current native and profile parity oracle. All four scenarios matched across all five profiles. Derived totals were 178 native events, 182 native states, 58 effects, 116 native transport rows, 20 lifecycle rows, and 890 profile event rows. All browser captures had zero page errors. The source distinguishes memory/direct calls from real rendered-button `HTMLElement.click()` calls in browser profiles.

The runner reused the existing N6 build index, SHA-256 `c2bc37cc8b7387972ac898e296cf91147494a1a8400758306b161672a274b0f5`; no bundles were rebuilt. The current loader and build-admission oracle revalidated four independent apps across React and DOM and passed all ten native/compiled mount-boundary cases for each backend.

## Consumer and scope

The N6 outer consumer remains compatible: its pinned `run.mjs` checks nonempty rejected arrays, matching array-derived totals, and all-rejected rows without an exact-eight condition. N5’s consumer preflight accepted the 16-capture and seven-build report shape. That probe is preflight-only; it does not establish clean E-RUN archive acceptance.

The E-HARNESSCONTROLS source inventory is limited to `compiled-module-effects/conformance/**`, and all sealed source copies match. The prior N6 failure remains intact. The author’s fresh 4×5 matrix used the reused four-build index; the fresh aggregate/archive run is still pending.

Commands, versions, source and artifact pins, and independent audit output are indexed under `rawlogs/XR-HARNESSCONTROLS/`.
