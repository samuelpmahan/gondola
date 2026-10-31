# E-STRICT-JSON (N2)

**Outcome:** mixed change; ready for independent review.

## Scope and implementation

Implemented strict JSON boundaries in the four authorized Go files: `backendqualification/certify.go`, `backendqualification/qualification_test.go`, `qualificationarchive/verify.go`, and `qualificationarchive/verify_test.go`.

`CertifyFile` now rejects duplicate object keys throughout the raw report and evidence JSON, including objects held in `json.RawMessage`. Typed Go records reject unknown fields and noncanonical field-name casing before `encoding/json` decoding, which otherwise matches struct tags case-insensitively. The case envelope explicitly recognizes the actual diagnostic fields (`baseline`, `policyPassed`, `baselineCheck`, `browserVersion`, `profile`, and callback `stale`) as opaque; they do not affect the certificate. Activation and DOM records that are decoded into Go structs use the same strict path. JSON map keys remain case-sensitive and raw state JSON is not interpreted as a Go schema.

`qualificationarchive.Verify` now decodes the pre-archive snapshot and typed provenance members through duplicate-key, exact-field, and unknown-field checks. Named fields cover the archive’s existing source-tree, trace counts, build-profile metadata, qualification inputs, and demo diagnostics. Existing source-pin and certificate comparisons remain in force.

## Reproduction and results

N1’s pinned XR-CERTIFICATE packet previously showed five successful malformed-archive variants: four distinct acceptance cases plus a same-value duplicate `sourceCommit`. Its unknown top-level raw-run field was already rejected. This packet preserves that earlier result as the red baseline and records independent post-change CLI executions against the same six rehashed variants. All five previously accepted variants and the existing negative control now exit 1 with empty stdout.

The focused Go package command passed:

```text
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./backendqualification ./qualificationarchive -count=1
```

The actual Go 1.24 CLI also accepted both source-complete 405-member inputs: the local published test bundle and the hosted complete bundle. Each returned a qualified certificate with 13 of 13 passing cases. The CLI was built with:

```text
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go build -o /tmp/verify-qualification-strict-json ./cmd/verify-qualification
```

Detailed commands, stdout/stderr, exit codes, bundle pins, and output summaries are in `portable-coordination/rawlogs/E-STRICT-JSON/`.

## Pins and limits

The source commit under review is `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2`. Exact owned source hashes and reviewed build-input hashes are in `source-pins.json`; the CLI result manifest pins the archive and manifest bytes used for each run.

This is a focused package and CLI verification, not a full repository test run, full CI result, or browser rerun. The archive verifier checks consistency of captured evidence and provenance; it does not authenticate the archive producer. The legacy 397-member archive remains a fail-closed control because eight pinned source copies are absent.
