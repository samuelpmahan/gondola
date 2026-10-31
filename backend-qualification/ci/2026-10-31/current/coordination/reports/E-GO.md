# E-GO: authoritative qualification certificate

**Worker:** N1  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Result

Implemented the Go-owned `backendqualification` library. Its fixed 13-case registry derives required and allowed semantic channels; the raw report cannot provide a verdict or expected-channel policy. `CertifyFile` strictly decodes the run schema, requires every unique registered case and exact backend/fault pair, checks activation metadata and event/tick checkpoints, reads each report-relative evidence file within the report directory, verifies its SHA-256, binds the five evidence comparisons to the live observation fields, derives the changed channels, and rejects mismatched, unknown, duplicate, or insufficient channels. Infrastructure and page errors disqualify a case. `WriteCertificate` writes only a complete qualified certificate atomically.

The library and its rejection tests are in `backendqualification/registry.go`, `backendqualification/certify.go`, and `backendqualification/qualification_test.go`. The CLI directory was explicitly ceded to N2 before implementation; I did not edit it.

## Verification

The Go 1.24.0 library test command passed:

```text
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test ./backendqualification -count=1
ok   github.com/samuelpmahan/gondola/backendqualification  0.063s
```

After the library was frozen, N2's combined Go package run also passed for `./backendqualification` and `./cmd/backend-qualification`. N2's separate Node 22 CLI black-box run passed all 15 tests, including the actual capture and five invalid-report controls. These results are recorded in the sealed E-GOCLI packet.

I also ran the N2 CLI against N4's actual Node 22 capture at `/tmp/gobi-backend-qualification-E-HARNESS-node22/qualification.raw.json` (SHA-256 `4222a32d73fde4e9fa31e534ebad7ab61fae8337f6cff7e0b2c9b05486586bcf`). It emitted a `gobi.backend-qualification-certificate/v1` result with `qualified: true` and 13 passed cases. The exact command, exit code, empty stdout/stderr, and certificate are preserved under `rawlogs/E-GO/actual-report.*` and `rawlogs/E-GO/actual-certificate.json`.

The real report measured all three healthy profiles at 50 source events and 46 checkpoints. Each fault case activated once. The certificate derived DOM differences for text and order faults; disabled and DOM differences for enabled-control faults; and dispatch-count, trace-count, state, and DOM differences for click faults. In particular, the click cases were detected from actual observations even where the guarded host/runtime changed the resulting state or callback count.

The library tests cover the valid 13-case certificate and rejection of missing, duplicate, unknown, misidentified, or claimed-verdict input; missing activation or semantic witnesses; exception-only detection; raw/evidence channel disagreement; unknown/duplicate channels; infrastructure/page errors; missing, hash-mismatched, or escaping evidence paths; wrong healthy counts; and malformed source commits. Initial test runs exposed fixture-data issues; those are retained as earlier logs, and the final library run passed without weakening the registry policy.

The first read-only receipt self-check found incorrect byte counts in the receipt's source pins. I corrected those metadata values, retained the failed attempt, and reran the validator successfully against the active E-GO/N1 packet, all three source pins, this report, and the actual certificate.

## Scope and limits

This packet validates the certificate library and independently invokes the CLI on one actual 13-case capture. N2 owns the CLI source and its combined package and black-box test run; N4 owns browser execution. The certificate requires a syntactically valid 40-character lowercase source commit; the delivery runner must bind that commit to its source pins. This packet does not claim the complete qualification pipeline, demo, or hosted workflow has passed.

## Frozen source pins

| Path | SHA-256 |
| --- | --- |
| `backendqualification/certify.go` | `a1f579e1930cc2bcadf007d58b8ed3e421df3e28283528a2889ac71d801c463c` |
| `backendqualification/registry.go` | `e9f1394ff38c26b303d8bd498a84a6a87a7a9514a7cd5878c09a89cd82da61a2` |
| `backendqualification/qualification_test.go` | `498f526e54e366b5b4cb190818e98dc991aa629e148c3c239844293f32a0e4eb` |

