# XR-ACCEPT-BROWSER: independent review

## Decision

**Accepted for the scoped current-source browser evidence gate.** N3's author report and corrected receipt are bound to commit `60b5aeff3172837ad7831c2b78b210454a3d81a2`, tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`, parent `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`. The final author receipt SHA-256 is `39d94e3c999ce9902e33af41947191d830bb49e18b2318eccb1e627c70ad3046`. Its preserved snapshots confirm only the required `outcome` correction and subsequent nonempty `summary` addition. This review accepts the browser evidence lane only; it does not accept the overall milestone.

## Browser evidence

I reran N3's read-only browser audit on the local attempt and primary hosted attempt, its local/hosted comparison, and its hosted ZIP member check. All four commands exited 0 with empty stderr. The audit outputs are preserved under `coordination/reviews/XR-ACCEPT-BROWSER/` and their command/output hashes are in `audit-index.json`.

Both local and hosted captures contain 19 admission cases. Each rejects before Init, Update, View, or renderer calls; the host option getter descriptor is constructed while its getter is called zero times. The active capability requirements are read from the actual React and DOM AppIR, including `view.node`; the incompatible candidate omits `view.node` and rejects at admission.

I compared the raw captured before/after data for rejected and compatible swaps. State, view, DOM, and pending effects are equal across both swaps in both runs. The old active control still dispatches after the rejection; a stale callback is fenced after the compatible commit, the pending reply is accepted, and the disabled request button produces no tick. Both runs have the five-tick trace, all nine capability-capture mutations detected, and all eight inherited lifecycle mutation controls detected. Local and hosted comparisons report the same facts.

Focus diagnostics are `false`/`false` for both rejected and compatible swaps in both runs. This sequence provides no focus identity preservation claim.

## Current-source artifact and local archive

The primary hosted artifact is run `41193504188`, job `124514913013`, artifact `13040129310`, at source `60b5aeff3172837ad7831c2b78b210454a3d81a2`. I independently reran the complete-mode archive verifier against its extracted receipt and archive. It returned `completeAcceptance: true`, verified all 189 manifest members and 163 source pins, and matched the inner archive SHA-256 `ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f` and manifest SHA-256 `ccf0bb8fb460d72febd3f96ab7476f3f29588b80fba38c974cf4ab95066ebac5`.

The independently hashed terminal provider catalog has 30 successful runs and 30 successful jobs (15 push, 15 pull request), all bound to the same source. The local browser evidence is valid bounded loose-member evidence, but the local archive container remains **rejected**, SHA-256 `91e3d977e8efd7ef42a37d43029997a9e2ab8db7266a88cf54d5f7cc90a64b5f`; the cause is unknown. I did not reclassify or modify that container.

## Native protocol and limits

At the captured review snapshot, the read-only global scheduler auditor verified the native event/epoch history through 35 accepted epochs with zero errors. It reports `INCOMPLETE`: four packets were still open (`XR-ACCEPT-NATIVE`, `XR-ACCEPT-BROWSER`, `E-FIX-ACCEPT-CUSTODY`, and `XR-FIX-ACCEPT-CUSTODY`), with the custody amendment closure also pending. The exact 167 protocol-input files were unchanged during the audit. Epoch 32 assigns and dispatches `XR-ACCEPT-BROWSER` to N6, marks N6 as its sole eligible reviewer, and records both independent checks true, a solved native result, zero broken values/count, zero constraint values, and matching exact/native scores of 400.

The review verifier's first attempt used a nonexistent `disabledClick.accepted` field and stopped before emitting a review result. I preserved that failed probe. After correcting the reviewer check to use the recorded `targetDisabled` and unchanged tick count, the verifier passed. This was a review-script mismatch only; no author evidence or source file changed. No browser, build, or full regression suite was rerun.

This review records current-source browser evidence with outcome `mixed_change` because the hosted artifact passes while the local archive container remains rejected. It makes no global milestone or release acceptance claim.
