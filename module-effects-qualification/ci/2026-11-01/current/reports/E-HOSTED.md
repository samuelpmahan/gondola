# E-HOSTED — published CI evidence review

**Worker:** N4  
**Decision:** `accepted` for the bounded evidence review

## Published native qualification run

The [Gobi native module-effects qualification run](https://github.com/samuelpmahan/gondola/actions/runs/41278451068) completed successfully on 2026-11-01. Its job was `native-module-effects-qualification` (job ID `124765296457`); the run head and `SOURCE_COMMIT` were `4338255bf8800d521b7f932fb530fe2cedebbf72` on `codex/gobi-native-effects-qualification-20261101`.

Hosted logs report Go `1.24.13`, Node `22.23.4`, Chrome for Testing `156.0.8078.4` (Playwright Chromium revision `1248`), and compiler regression checks on Go `1.27.3`. The retained `test-summary.json` reports 3 native Go packages / 14 tests with 0 skipped and 0 failed; 36 Node tests across 7 files with 0 skipped and 0 failed; 4 compiler regression tests (8 cases), 1 build-stage regression, and 1 module ABI regression, all with 0 skipped and 0 failed.

The hosted delivery receipt reports 4 builds, 236 source pins, and 73 pinned test source files. It reports 4 scenarios (`literal`, `seed-20261104`, `seed-20261105`, `seed-20261106`), 178 native events, 182 native states, 58 native effects, 116 native transport events, 20 native lifecycle events, 4 retired children, 890 profile events, 910 snapshots, 3,290 ordered ledger events, 64 mutation-control applications across 16 controls, 7 build-admission controls, and 6 demo steps. These are the run's retained report values, not a new local replay.

Hosted before/after source-pin files are identical, each with 236 entries and SHA-256 `955ca8f511feb842ba361ee02f01358dc65ba193d6717fe20f2f779917a3b2bc`. The embedded manifest says source commit and verifier head both equal `4338255...`, `dirty=false`, zero source-pin mismatches, and 676 archive members. The before/after Git head streams both contain `4338255...`; the status streams are empty.

## Artifact bytes

The run exposes artifact [gobi-module-effects-qualification-41278451068-1](https://github.com/samuelpmahan/gondola/actions/runs/41278451068/artifacts/13072252035), artifact ID `13072252035`. GitHub metadata reports 24,858,789 bytes and SHA-256 `2592859c66658aa18cc1d2d64e11dbec50ab6102edb154b8da2d85a325fd218b`. I downloaded the outer ZIP, retained it at `rawlogs/E-HOSTED/hosted-native-artifact.zip`, and confirmed the digest matches the GitHub metadata; `unzip -t` reported no compressed-data errors.

The outer ZIP contains hosted attempt `attempt-20261101T055753166Z-4231-84d0cbc7`. Its embedded source archive is 8,785,654 bytes, SHA-256 `9b0791f8e51b591960e72ddf148ab74660999ae8f9300dfe113fe36d9fa0c7a1`, with 676 entries. Its manifest is 173,803 bytes, SHA-256 `a2521b09baa9acbf483a2cde1a0a1fff7dc709c723838ec34655d1dcb0e69376`. The archive and manifest fingerprints match the hosted attempt receipt, and the before/after pin manifests match each other. The artifact's retained `independentConsumer.status` is `passed`; this review did not repeat the full consumer profile matrix.

This hosted attempt is distinct from local E17 used in XR-SOURCE. Local E17 was `attempt-20261101T055628369Z-128-0d7fde3c` with a different archive fingerprint. Do not substitute local E17 bytes or results for this hosted attempt.

## Native Go CLI readback of the hosted archive

I also ran the native `module-effects-qualify --archive ... --manifest ...` CLI against the actual embedded hosted tar and manifest, with `PATH=/nonexistent`, `GOPROXY=off`, and `GOSUMDB=off`. It exited 0. The output report checks 4 builds / 2 ABI pairs and 4 scenarios / 20 profiles, with 178 events, 182 states, 58 effects, and 116 transport events; it reports 236 archived source checks and archive source commit `4338255...`.

The CLI compiled with local Go `1.24.0` from worktree HEAD `8632f139354c0863482eb625c3ba99b4f607ea0c`. The captured source diff against hosted `4338255...` contains only `effectqualification/fixture_selection_test.go` and `effectqualification/integration_test.go`, both test files; the production CLI/replay/archive sources used by this command are unchanged. The CLI report's scope states that it recomputes Go/profile evidence without launching a browser and does not authenticate Git history or compiler provenance. Full output and command/environment details are in `rawlogs/E-HOSTED/native-cli-verification.stdout.json` and `native-cli-check.txt`.

An initial CLI attempt from the workspace parent stopped before compilation because that directory had no `go.mod`; the successful run used the repository root. The initial diagnostic is retained in `native-cli-initial-cwd-error.stderr.log`.

## Inherited keyed-effects workflow failure

The [inherited keyed module effects run](https://github.com/samuelpmahan/gondola/actions/runs/41278451076) completed with failure on the same source commit. Its `module-effects` job (ID `124765296616`) failed at “Run M0, counter, and prior keyed-module regressions”; the keyed module-effects profile step was skipped. Its GitHub artifact list is empty, and the upload log says no artifacts will be uploaded.

The job environment shown in the log does not include `GOBI_EFFECTS_QUALIFICATION_INPUT`. Nine tests in `effectqualification` all fail at the fixture-directory precondition. A representative exact diagnostic is:

> `GOBI_EFFECTS_QUALIFICATION_INPUT must name an existing PR23 attempt directory: root="/home/runner/work/gondola/gondola/compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a" err=stat /home/runner/work/gondola/gondola/compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a: no such file or directory`

The nine failing tests are `TestBuildIndexEnvelopeAcceptsPR23FourBuildFixture`, `TestBuildIndexEnvelopeRejectsAliasesUnknownAndMissingFields`, `TestBuildRecordEnvelopeRejectsAliasesAndUnknownFields`, `TestPR23CaptureSemanticMutationControls`, `TestPR23OrderingRejectsEventAndCorrelationForgery`, `TestPR23StrictJSONRejectsDuplicateCaptureKeys`, `TestPR23RequiredSeedCannotBeRemoved`, `TestPR23DirectoryIsAccepted`, and `TestPR23OrderingAPIHasPositiveControls`. Other package output shows 48 packages passing and 12 with `[no test files]`; those 12 are not test skips. The failing package is `effectqualification`; its tests terminate on the same absent PR23 attempt path. Thus this run does not report a completed keyed-effects profile.

## Evidence and limits

The exact API responses, complete job logs, selected files from the downloaded hosted attempt, artifact ZIP, artifact path listing, integrity check, and the diagnostic excerpt are pinned by `rawlogs/E-HOSTED/index.json`. Tool responses were retrieved at 2026-11-01T06:18:25Z; run and job timestamps are in the raw run metadata and logs.

This review distinguishes the successful hosted native qualification from local E17 and records the inherited workflow failure as observed. The Go CLI readback checked the embedded archive and its normalized native/profile capture semantics; this review did not repeat the browser runtime matrix. The keyed-workflow failure is not a failure of the separately successful native qualification. No code or Git changes were made.
