# Portable qualification archive verification

This profile verifies the complete published mounted qualification archive using Go 1.24. It does not start Node, a browser, or the application. The verifier checks the bounded archive and manifest, extracts only the declared files, recomputes the 13-case certificate from the included raw qualification evidence, and compares the result with the certificate stored in the archive.

The positive fixture is the 405-member `runtime-complete.tar.gz` bundle from source commit `77f7ce36439f1ae457a397269ea5a8c6d2db1`. It retains the original 397 archive members and adds the eight exact, source-pinned historical compiler review-evidence files that the original bundle's inventory omitted. The original 397-member `runtime.tar.gz` remains in the fixture as an explicit rejection control; the runner expects the Go verifier to reject it for those absent source pins without writing a success receipt. The augmentation used the pinned source bytes from the archived source commit and did not run a new browser capture.

The runner pins both archives and both manifests by SHA-256 before invoking Go. The artifact source commit is an expected label from that published capture; it does not authenticate a Git checkout or a browser producer. `verifierGitHead` in each run summary is the separate checkout revision containing the verifier implementation.

## Run locally

From the repository root:

```sh
bash run-portable-qualification.sh
```

The runner was validated with Bash 5.2 and Go `go1.24.0 linux/amd64`; it requires Bash, Go 1.24, and `sha256sum`. Set `GOBI_GO_BIN` to choose a Go executable. It forces `GOTOOLCHAIN=local` and adds `-buildvcs=false` to `GOFLAGS`. It runs these native commands:

```sh
go test ./qualificationarchive ./cmd/verify-qualification
go run ./cmd/verify-qualification \
  --archive portable-qualification/testdata/runtime-complete.tar.gz \
  --manifest portable-qualification/testdata/runtime-complete.manifest.json \
  --source-commit 77f7ce36439f1ae457a397269ea5a8c6d2db1cb2 \
  --output <new-attempt-directory>/verification.json
```

The runner also invokes the same command with `runtime.tar.gz` and its original manifest as a negative control, requiring a nonzero result, empty stdout, and no output file.

Each invocation creates a fresh output directory. Set `GOBI_PORTABLE_OUTPUT_DIR` to choose a directory that does not already exist. The output contains the verifier's deterministic receipt, the exact commands and four input hashes, source/test/fixture hashes captured before and after execution, Go test and CLI logs, the negative-control rejection logs, and `run-summary.json`. A failed command remains a failed run; the summary records the stage and exit code.

`verifierGitHead` identifies the checkout that contains the verifier. `archiveSourceCommitExpected` is the source label inside the older published capture. They are intentionally separate: the offline verifier does not establish Git provenance for either one.

## What a pass establishes

A pass means the complete fixture's pinned bytes were checked; the 405-member archive was admitted under the Go parser's bounds and member policy; its contents matched the manifest; and the Go certificate recomputed from the included capture agreed with the archived certificate for the expected source-commit label. The 397-member historical control was rejected for its missing pinned source files. The included integration and adversarial tests exercise malformed archive and semantic mismatch cases. The producer inventory regression test checks that the eight pinned names are unioned into the archive inventory while preserving the original member hashes.

This is a verification of this captured artifact and the verifier's finite tests. It does not rerun the browser or frontend, authenticate the manifest, establish trusted Git provenance, or protect against a malicious evidence producer that can replace both inputs. It does not certify arbitrary backends, prove independent executable Go child modules, or establish that a current runtime behaves like the capture. See [THREATS.md](THREATS.md) for the explicit boundary.

The extractor and runner were tested on Linux/amd64 only. Windows and macOS are untested. In particular, the current path policy has not been shown to reject every Windows reserved device name, so this package makes no cross-platform secure-extraction claim.

The workflow runs the producer inventory regression test and the existing Milestone 0 chain under Node 22 in a separate job. Neither is part of the portable Go verification profile.
