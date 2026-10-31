# E-ACCEPT-BROWSER

**Decision: accepted for current-source browser conformance evidence.** This closes the browser evidence lane for source `60b5aeff3172837ad7831c2b78b210454a3d81a2`. It does not declare the overall capability milestone accepted; the local archive container remains rejected as described below.

## Source and current full runs

The reviewed commit is `60b5aeff3172837ad7831c2b78b210454a3d81a2`, tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`, direct parent `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`. The publication binding records the same local and published commit and tree. Its SHA-256 is `18e502e12e886c99a641a4a02e0c39d690806644362ede3dc3aed92b5c49869d`.

The local full run `attempt-20261031T103735751Z` finished passed at `2026-10-31T11:00:09.475Z`: 17 recorded commands exited zero, all stages passed, and its 163 source pins matched. The browser audit below independently checked the raw local browser capture. The local archive container itself is **rejected**: the root integrity record reports actual archive SHA-256 `91e3d977e8efd7ef42a37d43029997a9e2ab8db7266a88cf54d5f7cc90a64b5f`, cause unknown. Its original receipt and archive remain unchanged. This packet does not claim local archive integrity passed.

The authoritative same-source full artifact is hosted push run `41193504188`, job `124514913013`, artifact `13040129310`. Its hosted E-BUILD receipt passed in full mode with zero failed stages and 163 matching source pins. N4's independent archive verification reports the 76,786,265-byte ZIP SHA-256 `3a54a53c81ac93ad1c5a8231b17ac289875ed57ad7bb12d7ae2b3609ff267de1`; the inner archive is 14,960,460 bytes, SHA-256 `ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f`, with 189 manifest files, matching tar members, and a valid gzip EOF/trailer. The raw browser audit used the canonical extraction and independently matched 11 browser-critical ZIP members to those extracted bytes.

The terminal catalog `source-60b5aeff-terminal-runs-jobs-20261031T111444Z-v2.json` is 135,588 bytes, SHA-256 `b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc`. I recomputed this digest and parsed the catalog: 30 unique runs and 30 unique jobs are completed-success, split into 15 push and 15 pull-request runs; all run head SHAs equal the reviewed source commit. The primary run and job above are present and successful.

## Browser evidence

I independently audited the raw local and hosted capability captures and checks using the lane's read-only `audit_browser.py`, compared both captures with `compare_local_hosted.py`, and checked the hosted ZIP's browser-critical members with `verify_hosted_browser_zip.py`. All four commands exited 0 with empty stderr. The audit outputs and scripts are pinned in the receipt.

Both captures show 19 distinct admission stimuli: seven missing-capability cases, six strict host declaration cases, and six strict renderer declaration cases. The host option property case constructs an own getter descriptor, and the getter, Go roles, and renderer methods are never called. Every case rejects with `TypeError`, zero Init/Update/View calls, zero renderer calls, and an untouched empty container.

The active component profile comes from the unmodified compiled React and DOM AppIR; both declare `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. The rejected candidate is derived from the actual component requirement and has an empty view-capability list, so it omits required `view.node`. It rejects during admission before unmount or candidate calls.

The raw before/after state, view, DOM, and pending values are preserved across both rejected and compatible swaps. The old active click continues on the retained generation after rejection. After the compatible commit, the old root is detached and an old callback is fenced without changing the trace; the pending reply is accepted. The physical disabled Request button suppresses its click. The five-tick trace and nine-step browser event order match. All nine capability capture-data mutations and all eight inherited lifecycle mutation controls are detected; inherited lifecycle evidence records 17 swaps, 26 events, and 26 ticks. Local and hosted raw snapshots and key lifecycle facts match semantically; capture/check/run files contain expected per-run metadata differences.

Both browser captures report focus captured/restored as `false`/`false` for rejection and compatible commit. This programmatic-click sequence makes no focus-identity preservation claim.

The first hosted audit invocation is retained as attempt 01 and exited 1 because the extracted artifact does not package the oracle expectations file at the assumed path. The final audit used the source-pinned workspace `compiled-capabilities/oracle/expectations.json` and the canonical extracted artifact; it passed. No browser or full-suite rerun was needed for that path correction.

## Scope and limitations

This decision accepts the current-source browser conformance evidence, including the same-source hosted full artifact and terminal CI cohort. It does not certify the rejected local archive container, establish why its digest differs, or make a global milestone/release acceptance decision. The local raw browser audit remains valid as bounded loose-member evidence despite that container rejection. Focus identity behavior is unclaimed.
