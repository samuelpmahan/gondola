# XR-RUNFINAL — independent clean-producer review

**Worker:** N1  
**Job:** XR-RUNFINAL  
**Decision:** `accepted` for the clean producer-run phase only

## Sealed packet and source binding

The current E-RUNFINAL report, receipt, and rawlogs index match the immutable seal. All 118 files recorded in the producer rawlogs index match their byte counts and SHA-256 values. The stored runner receipt, archive manifest, and build index also match their referenced external files.

The run records commit `f6c9da1b9299a983f8a55c86ddbb0ab7543a1204`, tree `89a4548e2dcaafb138a5d2b46bbffda082b52d9b`, a clean before/after worktree, 201 source pins, and 57 pinned test sources. The before/after maps, runner receipt, execution snapshot, and archive manifest agree. I independently matched all 201 source entries against Git blobs at commit f6. At the time of this review, HEAD/tree still identify f6, but N2 has begun the scoped post-run relocated-loader repair: `compiled-module-effects/build/module-loader.mjs` is modified and `compiled-module-effects/build/module-loader-relocation.test.mjs` is untracked. One pinned worktree file now differs from the f6 Git blob. This happened after E-RUNFINAL completed; the recorded clean flags and commit blobs remain the historical run evidence.

## Producer results

The structured run evidence reconciles to four builds; 13 native Go tests in two packages; one module ABI regression; four compiler analyzer tests/eight cases; one compiler build-stage regression; and 35 passing Node tests across six files. The four scenarios contain 178 source actions, 182 native states, 58 effects, and 20 profile captures with 890 profile events and 910 snapshots. Conformance rejected 16 capture mutations; the oracle records 64 rejected mutation applications over 16 control IDs; build admission rejected seven controls. The six-step Chromium timer demo passed with pending UI visible before transport start, and no page errors or failed requests. The browser harness uses `HTMLElement.click()`.

The archive is 8,666,186 bytes with SHA-256 `e01b9508747b6e59af97a0cb57ce6c41a44514393cf9b57d6832b9d7bef89f4a`; its manifest is 160,505 bytes with SHA-256 `5c06a221bae5709eca9859d1c273a7b9f4b26463fca086a4a2caa2ecd30fe0fc`. The manifest lists 638 members and confirms its archived execution snapshot. I rehashed the external archive and the stored manifest, runner receipt, and build index. The producer receipt records successful round-trip checks and a passing built-in independent Python archive consumer; I did not rerun that consumer or inspect all member contents independently.

## External consumer remains a separate failure

E-RUNFINAL itself leaves external archive consumption, publication readback, and final acceptance pending. The recorded N5 attempt `accept-e6460df3-v3-attempt03` has four offline native replay outputs, then rejects the relocated direct/browser phase. Its failure record reports `build index generated-source context is malformed or belongs to a different checkout` at `loadModuleEffects` in the relocated source tree. The associated diagnosis is a mismatch between the recorded repository root and the physical extraction root. I did not rerun the consumer. The archive has not passed the external relocated-browser acceptance gate, so this review accepts the clean producer phase only.

This run’s source closure is the module-effects/compiler/test dependency closure, not a full M0/counter checkout. M0/counter and inherited keyed regressions are separate evidence and were not rerun here.

## Reviewer evidence and limits

The exact read-only audit command and its result are in `rawlogs/XR-RUNFINAL/commands.log` and `audit-result.json`. The review verified the seal, all 118 stored raw evidence files, artifact pins, 201 Git source blobs, and recorded count reconciliation. A few early reviewer-helper attempts used an incorrect archive path/count lookup; their logs are preserved in `audit-first-pass.*` through `audit-fourth-pass.*`. The corrected audit passed without modifying E-RUNFINAL or source files.

No full test suite, build, browser demo, or external consumer was rerun. I made no production, Git, or scheduler edits. The frozen producer packet remains a passed clean Git-bound producer run; external consumption and publication remain pending. Reviewer files are indexed in `rawlogs/XR-RUNFINAL/index.json`.
