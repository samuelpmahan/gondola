# XR-CONSUME — independent review of E-CONSUME v5

**Reviewer:** N2  
**Decision:** **ACCEPTED**  
**Qualification:** the v5 clean archive consumer acceptance is substantiated for Stage 1. Published Git readback remains a separate pending Stage 2 gate.

## Reviewed packet and correction

The immutable E-CONSUME seal matches report `6e9af77e97730c0ecc8d9a4b80300768ae3e4662a2513e20280150075c52d25c`, receipt `96cd1312dd3f83bd699e2cf207259581b3b3eecc2c10fad3a15897d8e08e202e`, and rawlogs index `cce644aae575f5a1668941023c26121046e009f3a2bd6aa7ad6f8d99f19c0348`. The canonical report and receipt have been restored byte-for-byte from the seal. The later author working-copy update is separately preserved at `checkpoints/E-CONSUME-postseal-workingcopy/`; its two hashes match the explicit correction record. The correction does not change the raw index, consumer scripts, or acceptance summary.

The sealed receipt left `source.git` and `sourceTree` null. The separate correction points to the correct E-RUNPORTABLE worker receipt and the actual clean runner receipt; I rehashed both files. Their records identify commit `e0933465725e470dc610e3f81b4bbee95538c1d0`, tree `0a52ae23ab32e0ca35f6b1385ea851e3edeede3a`, a clean verifier, and 202 matching source pins. Read-only local Git object checks independently reproduced that tree and all 202 pinned blobs. This is local source-object evidence, not the pending published-Git Stage 2 check.

All **1,706** stored files in the sealed index rehash with zero mismatches and zero non-regular entries. The explicitly excluded compiler cache contains the declared **516 files / 41,708,373 bytes**. All five external references match. I also checked all **639** regular archive members against the manifest, all **202** archive source members against their pins, and the archive/manifest outer hashes.

## Consumer source and actual run

The executed Python consumer is v5, `8885db084bb46f420bd600c4346a87f196fa44d57ce9241393aa567708546e01` (121,027 bytes); the executed browser runner is unchanged at `947e92caa4a7856e8f0cf434d9401bb8218296859481ae7eebddcfd515e48d1c`, and the pinned restore tool is unchanged at `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98`.

The v4 Python parser expected `profileResults` at the Node summary top level. The actual Node output nests the rows at `direct.profileResults`. V5 requires that nested result, derives the eight scenario/backend pairs, checks the extracted loader against the archived build-index pin, and validates each direct output’s byte count, hash, full JSON, and canonical JSON. It also validates the browser’s six actions, actual click inventory, lifecycle, request and error arrays, and screenshot integrity. The materialized v5 Node output has the expected nested shape and eight rows. The exact v4/v5 source pins and parser-shape comparison are in `rawlogs/XR-CONSUME/v4-v5-review.json`.

The pinned v5 `consume-summary.json` is **293,081 bytes**, SHA-256 `24aae206e8f41b41a6fbaf88e6b09dfaa326acc5874dd0a4406ae00881890b84`. I independently compared its materialized rows and outputs:

| Evidence | Independent result |
|---|---|
| Archive | 639 regular members, 99,726,798 expanded bytes; manifest and source pins match |
| Offline Go native | 4/4 byte and canonical JSON matches; 178 events, 182 states, 58 effects, 116 transport rows |
| Extracted-source direct profiles | 8/8 byte and canonical JSON matches; 356 profile events and 364 snapshots |
| Browser demo | 6/6 steps; 12 `HTMLElement.click()` activations; 3 renderer swaps; 2 timer replies; `b:g1` removed before remount as `b:g2` |
| Browser requests and state | 4 local request observations, 0 external attempts, 0 page/console/request/HTTP errors; all 4 request-start observations show Go `Pending` and matching token before transport, with Saving/disabled Save/enabled Cancel controls |

The browser run used programmatic `HTMLElement.click()`, not trusted pointer or OS input. The screenshot is illustrative; pixel equivalence is not asserted. Hash consistency does not establish publisher authenticity.

## Focused probes and preserved failures

I reran the frozen v5 probes from copies in this reviewer’s rawlog directory. All passed:

- 45/45 snapshot, counts, command binding, and mutation-control probes.
- 9/9 scoped unmount lifecycle-order probes.
- 40/40 Node summary probes against the actual completed Node result fixture, including acceptance of the nested schema and rejection of misnesting, missing/duplicate rows, bad pins, and malformed browser details.

The 45 and 9 probes are contract fixtures, not archive acceptance evidence. The 40 probes use the earlier completed Node result from v4 to exercise the summary parser; the separately pinned v5 attempt-02 full archive run establishes the clean acceptance.

Prior failures remain present in the E-CONSUME index: the first F6 attempt lacked `GOCACHE`; the next F6 attempt stopped at the old relocated-loader root guard after four native passes; attempt 04 was a not-run disposition; portable v4 rejected the actual nested Node summary; and v5 attempt 01 stopped because the restore tool was outside `--package-root`. None is counted as a pass.

## Acceptance boundary

I accept the E-CONSUME v5 Stage 1 clean archive acceptance. The additive producer-reference correction is substantiated and preserved separately from the original seal. Stage 2 published-Git readback remains pending; this review does not claim it occurred. No producer, archive, full consumer, or browser run was rerun by this reviewer. I made no production, consumer, Git, or scheduler changes; my Git checks were read-only.

Commands, reviewer probes, packet/archive verification, source pins, and preserved-attempt references are indexed in `rawlogs/XR-CONSUME/index.json`.
