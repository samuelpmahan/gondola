# XR-GO-CHANNELS: independent review of raw channel validation

**Worker:** N3  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Result

The sealed E-GO-CHANNELS packet matches its current report and receipt byte-for-byte. It changes only `backendqualification/certify.go` and `backendqualification/qualification_test.go`; the current registry hash still matches the original E-GO sealed registry, and the E-GO-CHANNELS scope reports no other production paths changed. The original E-GO report/receipt and the earlier XR-GO AMEND report/receipt remain present with their recorded seal pins.

The previous review's main finding is fixed. `certifyCase` now calls `validateChannelList` on the raw report row's `observedChannels` before comparing channel sets. That helper rejects unknown names and duplicate names before calling `canonicalChannels`, while valid known names can be reordered and are emitted in canonical order. The registry's five names and per-case required/allowed policies are unchanged. The added tests reject unknown and duplicate channels on fault and healthy rows, and accept a valid four-channel list in a different order.

I independently reran actual CLI controls on copies of the real 13-case N4 report and its 13 evidence files. A fault row with `['dom', 'gpu-pixels']` exited 1 with an unknown-channel error; `['dom', 'dom']` exited 1 with a duplicate-channel error. Neither emitted a certificate, and every copied evidence-file hash was unchanged. The unmodified report certified as 13/13; its 11,072-byte certificate hash is unchanged at `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174`.

## Verification

- Go 1.24 targeted raw-list regressions: passed; the subtests cover four invalid raw lists and one reordered valid list.
- Go 1.24 combined package tests: `backendqualification` and `cmd/backend-qualification` passed.
- Node 22 Go-CLI black-box suite: 15 passed, 0 failed.
- Actual malformed raw-channel CLI controls: both exited 1, emitted no certificate, and matched their specific expected validation error.
- Actual unmodified N4 report: 13/13 passed, `qualified: true`, certificate SHA-256 `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174`.

The first parallel attempt to redirect test output raced with creation of the rawlogs directory, so those shell redirections exited 1 before either test ran. Both commands were rerun after the directory existed and passed; the setup-only failure is preserved in `rawlogs/XR-GO-CHANNELS/initial-log-directory-race.txt`.

## Scope and limits

The earlier XR-GO note about supplemental callback-invocation metadata remains a documented limitation: those auxiliary fields are diagnostic and not fully structurally cross-bound. This review does not claim that metadata proves malicious behavior, does not broaden the channel-list repair to that field, and does not claim a full browser pipeline or hosted-CI run. No production, CLI, registry, Git, or native state was changed by this review. One read-only `git status --short` command was mistakenly run during final inventory; no Git write command was run and no output was acted on. The scope note and exact command are preserved in the rawlogs.

Exact report, receipt, source, and rawlog pins are in `coordination/receipts/XR-GO-CHANNELS.json`.
