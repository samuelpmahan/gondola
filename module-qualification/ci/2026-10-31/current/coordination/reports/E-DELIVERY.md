# E-DELIVERY — native Go module qualification runner

**Worker:** N6  
**Outcome:** `mixed_change`  
**Execution scope:** author prepublication checks only; no fresh producer profile was run.

## Implementation

Added the executable `run-module-qualification.sh` wrapper, Node runner in `module-qualification/run.mjs`, profile README/results, an output-only `.gitignore`, and the focused GitHub workflow. The runner composes the existing `run-compiled-modules.sh`; it adds no app or reducer semantics. It requires an explicit 40-character source commit, validates a clean checkout, creates a unique attempt, runs the producer, verifies producer receipts and archive hashes, invokes the Go verifier in directory and archive modes, and bundles the verifier Go source closure, upstream runtime archive, command records, reports, and input pins with an independent archive round trip.

The focused Go test environment is wired to the fresh producer output using all four values: `GOBI_MODULE_CAPTURE_ROOT`, `GOBI_MODULE_ARCHIVE`, `GOBI_MODULE_MANIFEST`, and `GOBI_MODULE_EXPECTED_SOURCE`. The runner requires the real capture-acceptance test and all ten named mutation subtests to pass with no skips, and checks that the actual-archive integration test is enabled. It then runs the existing Milestone 0 and counter-interaction regressions. `module-qualification/controls/mutations.json` is explicitly required and pinned because Go reads it with `os.ReadFile`, so `go list` cannot discover it as an embedded input.

The workflow has identical push and pull-request path filters (38 paths), pins `SOURCE_COMMIT` at job scope, checks out the same PR-head/SHA, installs the existing locked dependencies and Chromium, and uploads unique attempt output. The README limits the platform claim to Linux/amd64; Windows and macOS are untested.

## Validation performed

The following author checks passed under Node `v22.23.4`, Go `1.24.0 linux/amd64`, and Python `3.12.14`:

- `node --check module-qualification/run.mjs`
- `bash -n run-module-qualification.sh`
- `bash run-module-qualification.sh --help`
- PyYAML workflow structure check: push/PR path lists equal, 38 entries, job-level source commit matches checkout ref.
- `go list -deps -test -json ./cmd/module-qualify`: 11 local packages and 44 local Go/test source files were present in the current Linux build graph. The non-embedded JSON mutation corpus is pinned explicitly.

Node emitted an experimental `EnvHttpProxyAgent` warning during syntax/help commands; those commands exited zero. Chromium `153.0.8010.0` was version-probed only; this packet does not claim browser execution.

One bounded CLI attempt against the preserved prior artifact was red. The exact command was:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go run ./cmd/module-qualify --archive compiled-modules/output/attempts/attempt-20261031T213332911Z-35.tar.gz --manifest compiled-modules/output/attempts/attempt-20261031T213332911Z-35.manifest.json
```

It exited `1` with empty stdout. Stderr reported a mismatch in the prior browser capture at `profiles.seeded.seed-20261031-swap.events[21].kind`: actual `stale-callback`, expected `renderer-swap`. The tested artifact is the prior `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0` archive (6,373,581 bytes, SHA-256 `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c`, 529 members and 147 source pins). This was a prepublication attempt against an older capture and evolving checker; it is preserved as a failure and is not a current-source acceptance result. No cause is inferred from it.

## Not run / boundaries

No fresh GoScript/compiler/browser producer, full focused Go suite, directory/archive paired acceptance, Milestone 0 run, or counter-interaction run was performed by N6. The checkout was dirty with concurrent lane changes at base `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`, so no clean-candidate or source-commit match is claimed. Root owns publication of the clean candidate and the fresh integration run. The separate full run must establish the 12-profile, 144-event, 99-Go-update counts and actual source/archive agreement before acceptance is claimed.

This finite profile covers one parent/child fixture, fixed and seeded traces, React/DOM/swap captures, and the ten Go mutation cases. It does not establish arbitrary module-graph correctness, malicious-producer resistance, or additional renderer compatibility. Archive consistency is not publisher authentication.

## Evidence

Raw command output, source pins, the prior archive failure, and the immutable rawlog index are under `native-module-coordination/rawlogs/E-DELIVERY/`. The static-check record SHA-256 is `0d0d668309627a3319c9ca34ae41c28224818d3b7e3fc10e3e89de1c95f49d94`; the prior-archive command record SHA-256 is `8c8cfe28e0946a90d2f9a28ca6eb3069c08a49fad748d4ff1533b787af634397`.
