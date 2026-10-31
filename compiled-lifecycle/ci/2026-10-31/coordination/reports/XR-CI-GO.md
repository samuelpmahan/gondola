# XR-CI-GO: independent review of the hosted Go lifecycle packet

**Decision: `accepted` for the bounded evidence listed below. Outcome: `mixed_change`.** The artifact contains passing Go/native adapter, build, and typed effect-bridge evidence; the overall hosted conformance attempt failed before its native Go replay and did not produce the final comparison.

## Provenance and retained packet

The packet is bound to push artifact `13034915662`, workflow run `41178420647`, source `49cc2b96c8817a47319d5b7bd484184a22fa984b`, tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. Its retained ZIP is 47,035,803 bytes, SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`, provider conclusion `failure`.

The dated N1 report and receipt are byte-identical to the author’s canonical copies. Their SHA-256 values are respectively `9fc1129f38c92b4716983b1f593d43ce07eb8d17a22191ced18be00a84ff8eda` and `58d63e4a69c31c3dd02764c09134a5633117adc1bfb9fdf445e9af5e294a3d3d`; N1’s audit is `aaaa74b18e8df8b0beb2dc2b216f0b875538cee9687166ba8373732f8c52d1fc`.

My independent verifier reassembled the 12 provider chunks, checked the artifact SHA and all 1,272 ZIP member hashes/lengths against both the member inventory and extracted files, and streamed every member so the ZIP library also checked CRCs. The included lifecycle archive is 12,062,689 bytes, SHA-256 `eb9c9678f224be7cedb2e95be845343320bf8fdf319481c6a6d568a8136a944d`. All 241 archive members matched the archive manifest and extracted copies, totaling 158,843,470 uncompressed bytes.

The attempt recorded 122 source pins before and after its hosted run. I independently compared every pin to the immutable 49cc Git object, confirming 0 mismatches; this avoids relying on the shared worktree while harness files are being edited for the separate native-path repair. For both React and DOM, all 67 output pins at each recorded checkpoint match the archived emitted files and BuildResult output inventory. AppIR and encoder bytes match across backends; the generated React and DOM modules have different bytes. The AppIR component uses the full lifecycle package path and binds `Init`, `Update`, and `View` to the expected `GobiCompiled*` exports.

## Go, native, and effect bridge evidence

The hosted logs record exit code 0 for:

- `go test ./compilercontract ./gobi ./fixtures/compiled/lifecycle ./cmd/compiled-lifecycle-native`
- `go test ./analyze ./build ./cmd/... ./emit`
- The Node 22 compiled lifecycle runtime tests, 10 passed and 0 failed.

The first Go command's retained stdout SHA-256 is `86a90409767a7d18ddd75378c848193164acbb343779c704ee983ea41a473846`; the compiler test stdout SHA-256 is `9eacb29a005eef7b8a607fa48f3b3e089da3475e852a05e9f2c6206e695b3f17`. Both stderr logs are empty. The runtime suite stdout SHA-256 is `423cb059cc96073a10f6d57271c0c8b6c07af7bbf11631cbe7ce3f2e7c8173ca`, also with empty stderr.

The separately built native adapter binary (SHA-256 `897f021e17529503724c1535178255546308e98d365fe31ebd5ff57444837655`) ran the frozen lifecycle script successfully; the retained CLI probe stdout hash is `ae38bab913056033f299d40441503ed7d18dae962e46f8273b36495317022f55`. Its standalone `gobi.compiled-lifecycle-native/v1` trace has 26 events. I checked its event messages and effect records against the fixture script, and compared 13 recorded state checkpoints with the fixture’s typed state expectations. It emits seven `fixture.request/lookup` effects, then cancels Grandchild, Child, Parent in that order. The sibling request survives. The trace shows three old-generation completion messages and two duplicate completions as no-ops, accepts the sibling and all three fresh generation-2 replies, and ends with request ID 7. This is the standalone native probe; it is not the matrix stage that failed below.

Both AppIRs declare `Update` as returning `[]github.com/samuelpmahan/gondola/gobi.Effect`, represented as a slice whose element is the typed Gobi Effect struct (`Kind`, `Name`, `Arg`, `Reply`). `uint64` is represented as JavaScript `bigint`. The hosted runtime test log specifically covers compiled append effects through the signature-typed encoder, acceptance of a nonzero-offset effect GoSlice, rejection of malformed GoSlice wrappers and malformed Effect fields, and rejection of an unexpected field in the typed Value. These are bounded bridge tests, not a substitute for the absent full conformance comparison.

The direct emitted-module replay separately completed 26 ticks and its raw record has no pending effects. Browser profiles are recorded in the N1 packet, but do not supply the missing native CLI matrix comparison. I do not make a standalone-native-versus-direct equivalence claim here.

## Blocking failure and claim boundary

The primary hosted job and lifecycle matrix remain failed/rejected. The full matrix passed its contract/build-manifest, direct-module replay, browser profiles, and stability stages, then failed at `native-go-script-cli-replay`: `--native-go go` was resolved to `/home/runner/work/gondola/gondola/go` and spawning it returned `ENOENT`. The native stdout/stderr files are empty and `lifecycle.check.json` was withheld. The independent native binary probe above passed, but it does not replace the missing matrix native replay or its required final checker. No complete hosted lifecycle CI pass or native/direct/browser final comparison is claimed.

## Independent audit and reproduction

Run from repository root:

```sh
python3 compiled-lifecycle/ci/2026-10-31/lanes/review-go/audit_go_review.py
```

This deterministic artifact audit uses no random seed and does not rerun hosted Go or Node tests. The hosted test commands used Node `v22.23.4`, root Go `1.24.13`, compiled frontend Go `1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, and Chromium `156.0.8078.4`. The audit ran under Python `3.12.14`.

- Independent audit output: `lanes/review-go/audit.json`, SHA-256 `994fccbb5d3eb3a3a353a908e4bd5ff80e62fa716480d2bcf6586d77d781b9c1`.
- Independent audit script: `lanes/review-go/audit_go_review.py`, SHA-256 `61fcc467c380cf3b188c1a64e1289e0b357b0948605ebe53537a19fbaa5363e3`.
- Primary native trace: `extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/native-cli.json`, SHA-256 `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5`.
- Full conformance run record: `extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.run.json`, SHA-256 `1c4ba7c6882faccb760bfb182bacad709d91bd8efd81bc320cf834b0e40364a8`.

I made no product source, Git, provider, or shared state edits.
