# XR-PORTABLE-ORACLE independent review

**Reviewer:** N4  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Finding and review result

The original E-ORACLE test hardcoded `/tmp/gondola-go/bin/go` and used a 32 MiB spawn buffer. That made the focused oracle test depend on one local toolchain location and its captured CLI output limit.

N5's E-PORTABLE-ORACLE repair resolves the executable as `process.env.GOBI_GO_BIN ?? "go"` and sets `maxBuffer` to 64 MiB. Comparing `compiled-publications/oracle/oracle.test.mjs` to the preserved E-ORACLE source shows only those two edits. All six test declarations are retained.

The test launches a fresh native Go CLI trace with the fixed scenario. It imports the independent literal `oracle.mjs`, and its final test reads the expectation JSON to check that the published file matches the literal. It has no dependency on a captured author raw trace or a golden Go reducer copy.

## Evidence reviewed

N5 recorded both resolver paths as passing all six tests:

| Mode | Command result |
|---|---|
| Explicit executable | `GOBI_GO_BIN=/tmp/gondola-go/bin/go .../node --test compiled-publications/oracle/oracle.test.mjs` — 6 passed, 0 failed. |
| PATH fallback | `env -u GOBI_GO_BIN PATH="/tmp/gondola-go/bin:$PATH" .../node --test compiled-publications/oracle/oracle.test.mjs` — 6 passed, 0 failed. |

The unmodified environment PATH had no `go`; the fallback test prepended the installed Go 1.24 directory and removed `GOBI_GO_BIN`, so the test used the default `go` lookup. The tool versions recorded by N5 are Node `v22.23.4` and Go `go1.24.0 linux/amd64`. The exact output logs, hashes, and sizes are recorded in the receipt.

Preservation checks passed: the live E-ORACLE receipt/report and oracle module/expectations match their sealed copies byte-for-byte. The E-PORTABLE-ORACLE report and receipt also match their sealed copies. The review did not alter source.

## Boundary

This accepts the bounded portability repair. Root is running the C3 portable Node suite; N4 did not rerun it. This review does not claim full project, browser, CI, or release acceptance. The original E-ORACLE report remains unchanged and retains its original `mixed_change` outcome.
