# XR-RELEASE-CONTRACT-MATRIX (N4)

**Decision: `amend`.** The finite guarantee matrix and source978 evidence are otherwise well-bounded and hash-verified. One sentence miscounts stages by placement: it says nine stages passed after the inherited stage, when eight stages follow that failed stage. Nine is the count of all non-inherited stages, including preflight, which ran before the inherited stage.

## Required correction

In `compiled-children/coordination/reports/E-RELEASE-CONTRACT-MATRIX.md`, line 21, replace “The nine stages after inherited execution passed” with wording such as “All nine non-inherited stages passed: preflight and the eight stages after the inherited stage.” The source978 E-DELIVERY stage list has ten stages: preflight passed, inherited capabilities failed, then eight new stages passed. This distinction leaves the overall source978 result correctly failed.

## Evidence review

- Verified all 38 path/size/SHA-256 evidence pins embedded in the E-RELEASE-CONTRACT-MATRIX receipt against the packet or the source978 attempt in the archived worktree. The N1 report and receipt hashes also match their receipt pin.
- Verified source snapshot commit `462a9827bfe1980600456b00d0a67843eaa9756d` in `/workspace/scratch/39a56936f173/gondola-children-archive`, including the frozen Go contract, `app.go`, `view.go`, and current capabilities runner pins. No source files were edited.
- Source978 remains a failed full delivery with two recorded failures and an empty semantic-mismatch list. The inherited E-BUILD archive-helper guard expected three tests but observed five passing tests, and the inherited source-pin boundary also failed (`sourceBefore` empty versus 163 files afterward, with pre-archive pins unequal). The E-DELIVERY report and receipt explicitly retain that failure.
- The source978 fixed capture matches 42 events, 38 Go updates, and 39 checkpoints. It records two swap attempts (one accepted compatible swap and one rejected incompatible candidate), 12 mutation controls, and one fenced disabled request action. The disabled probe is a bounded `disabled-HTMLElement.click` on a disabled request button; its event has no Go step and the trace remains at 10 ticks before and after. The capture’s 27 `HTMLElement.click` actions per profile and finite literal state/tree/DOM projections do not establish general DOM, pixel, focus, or browser-engine behavior.
- The three recorded seeds each have 60 events / 59 Go updates; only seed `20261031` has mounted-browser evidence. Seeds `20261032` and `20261033` are native/direct-only. The HTTP smoke has 32 checks, and the archived delivery has a verified 239-member round trip and post-command consumer.
- The Go fixture owns ordered keyed child state, generations, request sequences, cancellation, key reuse, stale-completion rejection, clear/removal/remount, and the view tree. The shared host contract advertises `effect.request-reply` and `effect.cancel`. The matrix’s other-backend guidance reuses the shared module/renderer API, capability set, and closed effect policy with the same replay instead of introducing JavaScript domain state.
- Typed parent inputs and child publication are explicitly future work for dynamic child identities. The report does not present the separate PR13 typed-composition evidence as proof of this fixture’s keyed-child behavior.
- Source462 full/CI acceptance is still pending per root. The source978 failure and its valid fixed-scenario capture are not presented as current full acceptance.

## Review audit

The bounded read-only audit validated existing receipt pins and capture fields; it did not rerun the harness, test suites, or full pipeline. Its first helper attempt expected an unrecorded `operation.result.accepted` field on the disabled probe and stopped before making any capture claim. The corrected audit checks the captured disabled property, null step index, and unchanged trace tick count. This was reviewer-helper shape correction, not an implementation or replay failure.

Audit output: `rawlogs/XR-RELEASE-CONTRACT-MATRIX-20261031-01/audit.stdout.json`.
