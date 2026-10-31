# XR-GOCLI: independent review of E-GOCLI

**Worker:** N3  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Result

The sealed E-GOCLI report and receipt match their seal copies exactly (report `b590b679e1c252f882280af15e40053c0e3be010955c604ce402ed3d32532598`; receipt `336e0fe51791936bf045e16fd8f1732053536ecef5b4ed104e2e289fef8ec0f2`). The reviewed Go wrapper and test files match the hashes in the receipt. I independently rehashed all seven E-GOCLI reviewed source inputs; there were no mismatches.

`cmd/backend-qualification/main.go` validates required flags and rejects extra arguments, resolves input/output paths and rejects a same-path alias before reading input, then calls `backendqualification.CertifyFile` followed by `backendqualification.WriteCertificate`. Errors flow to stderr and exit status 1. The CLI does not derive a verdict in JavaScript. Its unit tests cover help and malformed flags, exact input/output alias preservation, and missing or malformed input without creating a certificate. A focused live CLI probe also confirmed that a symlink alias is rejected before parsing and that malformed input exits 1 without creating an output certificate.

The actual N4 raw report is 7,820 bytes with SHA-256 `4222a32d73fde4e9fa31e534ebad7ab61fae8337f6cff7e0b2c9b05486586bcf`. Its 13 referenced case-evidence files independently match their listed hashes. The CLI-produced certificate is 11,072 bytes with SHA-256 `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174`; its rawlog copy matches the output file. It has schema `gobi.backend-qualification-certificate/v1`, `qualified: true`, 13 of 13 passed results, and no failed case IDs.

The preserved Go package command succeeded. I also independently reran `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test -count=1 ./cmd/backend-qualification`; it passed. The preserved Node 22 black-box suite records 15/15 passing, including actual-run certification and rejection controls for missing, duplicate, and unactivated cases, generic-exception-only evidence, and empty semantic channels.

## Preserved preliminary failures

The initial help test failed because the `flag` package sent usage to stderr; the CLI was corrected to print help to stdout, and the final Go tests pass. The first Node black-box attempt omitted `GOBI_GO_BIN` and failed with `spawnSync go ENOENT`; the preserved rerun sets `/tmp/gondola-go/bin/go` and passes all 15 tests. These are accurately described in the sealed E-GOCLI packet and preserved under its rawlogs; neither is an outstanding CLI failure.

## Scope and limits

No must-fix issue was found in the bounded CLI review. This review did not rerun a browser profile or full qualification pipeline. It confirms the supplied N4 capture and Go CLI behavior; it does not independently freeze the source commit represented by the capture or establish qualification coverage beyond these 13 cases. No production source, Git state, or scheduler/native state was changed.

The independent checks and exact source/evidence hashes are in `coordination/receipts/XR-GOCLI.json` and `coordination/rawlogs/XR-GOCLI/`.
