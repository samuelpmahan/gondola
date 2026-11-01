# XR-KEYEDREG — independent keyed aggregate review

**Worker:** N1  
**Job:** XR-KEYEDREG  
**Decision:** `accepted` for the pinned clean 88 regression baseline

## Review scope and packet integrity

I verified the current canonical E-KEYEDREG report, receipt, and rawlogs index against the immutable seal. All three match their sealed hashes. I also checked every one of the 28 files named by the E-KEYEDREG rawlogs index against its recorded byte length and SHA-256; all matched.

The run is bound to commit `88e7937e66fd1c8f36e5b5dd3224209b07c6eb33` (tree `fb4a44ad63eea969f1ae655e2d58f531b56a94fe`). The detached regression worktree is at that commit and clean. The before/after source pin maps are identical and contain 161 files. I checked every file against the Git blob at commit 88 and the clean detached worktree bytes; all 161 matched. The runner receipt, archive manifest, and pre-archive snapshot all bind the same source map and clean commit.

The current shared checkout is also at commit 88, but has three later, unpinned worktree paths: modified `compiled-module-effects/run.mjs` and untracked `compiled-module-effects/delivery-contract.mjs` and `compiled-module-effects/delivery-contract.test.mjs`. None of the 161 E-KEYEDREG pinned source paths differs from its commit-88 content in the current checkout. A later final-source checkpoint still needs the separately assigned N3 source-binding review.

## Archive and result checks

I independently streamed the referenced archive and verified its SHA-256, 604 unique regular-file members, and every member’s size and SHA-256 against the indexed manifest. The gzip stream completed without error. All 161 `source/` members exactly match the source pin map. The archive is 25,706,937 bytes with SHA-256 `76185b06ae9b8932d95bbbba94db4f4204b1fb85b44caf306d6c561449fab0f4`; the manifest SHA-256 is `6f10da788de62fdc0e3b43025ace1ea2def63afa76598389b40a2491cadb6d93`.

The scenario rows derive to 126 events, 130 native checkpoints, eight direct captures, and twelve mounted browser captures. The run records four independent builds, five focused Go packages, five passing Node tests, 17 rejected build-identity mutations, and 11 rejected capture mutations. The native/direct/browser summaries report matched results for the literal and three seeded scenarios. The six demo smoke steps passed. The independent consumer record reports the same archive and manifest hashes and 604 members.

The lane did not rerun Milestone 0 or counter regressions, consistent with its scope; the preserved `EXPECTED.json` and `SHA256SUMS` hashes match their accepted baselines. This packet verifies the inherited keyed-module aggregate only. It does not expand the two-key profile, assert asynchronous-effects behavior, or claim trusted pointer/OS input: the browser captures use `HTMLElement.click()`.

## Reviewer audit record

The full aggregate was not rerun. The bounded reviewer script and command transcript are indexed in `rawlogs/XR-KEYEDREG/`. An initial reviewer-only audit attempt had two incorrect self-check calculations (manifest source rows include a `source/` prefix, and per-scenario profile counts are captures rather than event totals); that first output is preserved as `audit-first-pass.*`. The audit script was corrected, rerun, and passed without changing any frozen E-KEYEDREG inputs.

## Decision boundary

I accept E-KEYEDREG as the clean, source-pinned regression baseline at commit 88. The packet itself records that it is not bound to a later final source checkpoint. This review does not substitute for N3’s later source-closure binding and does not accept a module-effects delivery archive.

No aggregate tests were rerun, and no production source, archive, repository state, or scheduler state was changed. Reviewer evidence is indexed by `rawlogs/XR-KEYEDREG/index.json`.
