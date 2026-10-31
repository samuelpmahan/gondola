# E-GOCLI: Go certificate command

**Worker:** N2  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Implementation

Added `cmd/backend-qualification/main.go` and `main_test.go`. The command accepts `--input <raw.json> --output <certificate.json>`, calls the Go-owned `backendqualification.CertifyFile` and `WriteCertificate` APIs, rejects an input/output path alias, and exits nonzero when parsing, certification, or writing fails. It creates no certificate unless Go certification succeeds.

The CLI does not classify failures in JavaScript. It only passes the raw report to the typed Go certifier, which checks the 13-case registry and the SHA-256 of each referenced case evidence file before writing the certificate. No library, fixture, compiler, or runner source was changed by this lane.

## Verification

The Go 1.24 combined package command passed:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test -count=1 ./backendqualification ./cmd/backend-qualification
```

The Node 22 Go-CLI black-box suite passed all 15 tests, including certification of the real N4 capture and rejection controls for a missing case, duplicate case, unactivated fault, generic-exception-only observation, and empty semantic-channel evidence. It was run with `GOBI_GO_BIN=/tmp/gondola-go/bin/go` so the test process used the explicit Go 1.24 toolchain.

A direct Go 1.24 CLI run on `/tmp/gobi-backend-qualification-E-HARNESS-node22/qualification.raw.json` produced certificate schema `gobi.backend-qualification-certificate/v1`, `qualified: true`, and 13 of 13 passed results. The raw report is 7,820 bytes, SHA-256 `4222a32d73fde4e9fa31e534ebad7ab61fae8337f6cff7e0b2c9b05486586bcf`; its 13 referenced evidence files were independently rehashed and match the report's evidence digests. The resulting certificate is 11,072 bytes, SHA-256 `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174`.

Two preliminary test invocations failed and are preserved. The first CLI unit-test run exposed a help-output mismatch; the `FlagSet` usage hook was corrected and the rerun passed. The first Node suite invocation omitted `GOBI_GO_BIN`, so its spawned `go` command returned `ENOENT`; rerunning with the explicit Go path passed all 15 tests. These were harness/test-invocation issues, not failed certificate evidence.

## Scope

This confirms the Go CLI and certificate behavior on the current 13-case N4 capture. It does not claim qualification coverage beyond that captured run or change the independent N4 browser/runtime result.
