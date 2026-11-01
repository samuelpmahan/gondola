# XR-HOSTED — independent review of E-HOSTED

**Reviewer:** N1  
**Decision:** `accepted`

## Review result

I verified the sealed E-HOSTED packet copies and all indexed evidence before assessing its claims. The five E-HOSTED seal members match their seal digests, all 57 entries in its sealed rawlog index match their recorded byte counts and SHA-256 values, and the working report, receipt, and coordinator index match the sealed copies. The review check is saved in `rawlogs/XR-HOSTED/seal-verification.json`.

The saved workflow and job responses identify native run `41278451068`, job `124765296457`, completed successfully at source commit `4338255bf8800d521b7f932fb530fe2cedebbf72`. The retained artifact response identifies artifact `13072252035`, `gobi-module-effects-qualification-41278451068-1`, 24,858,789 bytes, and SHA-256 `2592859c66658aa18cc1d2d64e11dbec50ab6102edb154b8da2d85a325fd218b`. The downloaded ZIP has that exact size and digest, and the retained `unzip -t` output reports no compressed-data errors.

The ZIP's selected hosted attempt is `attempt-20261101T055753166Z-4231-84d0cbc7`. I independently streamed its tar and manifest directly from the retained ZIP: the tar is 8,785,654 bytes, SHA-256 `9b0791f8e51b591960e72ddf148ab74660999ae8f9300dfe113fe36d9fa0c7a1`, with 676 members; the manifest is 173,803 bytes, SHA-256 `a2521b09baa9acbf483a2cde1a0a1fff7dc709c723838ec34655d1dcb0e69376`. The retained hosted receipt and manifest report source/verifier commit `4338255...`, clean status, 236 matching source pins, and no pin mismatches. Before/after pin files are byte-identical and have SHA-256 `955ca8f511feb842ba361ee02f01358dc65ba193d6717fe20f2f779917a3b2bc`.

## Hosted checks and offline readback

The hosted job log reports Go `1.24.13`, Node `22.23.4`, Chrome for Testing `156.0.8078.4` (Chromium revision `1248`); the retained compiler regression summary uses Go `1.27.3`. The test summary reports 3 native Go packages / 14 tests, 36 Node tests across 7 files, 4 compiler regression tests (8 cases), one build-stage regression, and one module ABI regression, all with zero skips or failures.

The retained native Go CLI verification of the actual embedded hosted tar and manifest has exit status 0 and empty stderr under `PATH=/nonexistent`, with Go module/toolchain downloads disabled. Its result matches the hosted source commit and reports 4 builds / 2 ABI pairs, 4 scenarios / 20 profiles, 178 events, 182 states, 58 effects, 116 transport events, 236 archived source checks, and 676 archive members. This is the saved result of an offline Go readback; I did not rerun the browser matrix or redownload the artifact.

That CLI worktree used local Go `1.24.0` at HEAD `8632f139354c0863482eb625c3ba99b4f607ea0c`. The retained diff from hosted source commit 433 contains only `effectqualification/fixture_selection_test.go` and `effectqualification/integration_test.go`, both test files. It does not indicate a production-source change. The offline report explicitly does not authenticate Git history or compiler-build provenance and does not launch a browser.

## Separate inherited workflow failure

The retained API response for run `41278451076`, job `124765296616`, shows a separate keyed-module workflow failure on the same source commit. The log excerpt records nine `effectqualification` tests failing at the expected PR23 fixture precondition because the fallback attempt directory is absent; the keyed profile step is skipped and the artifact list is empty. This does not change the separate successful native qualification result. The later CI fix is outside this review and is not assessed here.

The retained artifact path listing has no `Go.Class.Var.Message_Controller` entry. The current canonical E-HOSTED receipt uses the allowed `confirmed_reuse` extract outcome; the original preflight-rejected receipt remains preserved. Exact-copy checks are saved in `rawlogs/XR-HOSTED/packet-copy-verification.json`. No evidence was rewritten by this review.

## Limits

This review verifies the saved hosted run/API records, downloaded ZIP fingerprint and integrity log, embedded manifest/attempt records, and existing Go CLI readback. It makes no claim that I reran CI, the full browser matrix, or the fresh CI fix. The CLI result checks its pinned input bytes and Go-replayed profile data but is not proof of GitHub authentication, a compiler invocation, or arbitrary browser behavior.

## Evidence

The new review checks, direct ZIP-member hashes, and exact command list are under `rawlogs/XR-HOSTED/`. The original run, artifact, CLI, and failure evidence remains pinned by `rawlogs/E-HOSTED/index.json` and the E-HOSTED seal.
