# XR-ARCHIVE

**Reviewer:** N4  
**Decision:** `accepted`  
**Reviewed job:** E-ARCHIVE (N1)

## Review result

I reviewed the sealed E-ARCHIVE report, receipt, extraction implementation, and owned tests against the portable archive contract. The implementation enforces the requested Linux extraction boundary: strict manifest schema and duplicate-key rejection, canonical source commit matching, exact sorted inventory, exact snapshot membership, regular-file-only tar entries, bounded compressed and decompressed reads, size/hash checks, rejection of unsafe paths and archive links, and cleanup of the private extraction root on errors and `Close`.

The gzip reader is single-member mode. The implementation drains the remaining decompressed tar stream under the expansion limit, rejects nonzero data after the tar end marker, and rejects remaining compressed bytes, covering trailing data and concatenated gzip streams. Member output uses exclusive creation under a newly created mode-0700 root with mode-0600 files. `Bundle.Close` uses its private cleanup path rather than the exported `Root`, is mutex-protected, and is idempotent.

The relevant tests cover digest mismatch and failure cleanup, separate extraction roots and caller-owned-path safety, expected commit validation, strict/duplicate manifest keys, unsafe path aliases, duplicate/extra/missing inventory members, symlinks/hardlinks/special entries, trailing and concatenated gzip streams, compressed/single-file/aggregate/member-count limits, plus the real archive fixtures. I did not rerun the package suite: the sealed E-ARCHIVE final log records a passing full `qualificationarchive` package run, and current hashes for all six package source/test files match its reported test snapshot.

The important evidence distinction is preserved: the original 397-member archive is structurally extractable under its own manifest, but `Verify` rejects it because eight source pins have no archived source bytes. The separate 405-member supplemented fixture passes the integration path; it preserves all original archive members and does not represent a fresh browser run.

## Reviewed pins

Current source hashes match the E-ARCHIVE source snapshot:

| File | SHA-256 |
| --- | --- |
| `qualificationarchive/archive.go` | `87e2db7726efb9ebf9262983b4dcc9674c7a7860fcd7b62918df04f7f3e2ea03` |
| `qualificationarchive/archive_test.go` | `e92a6e73c9489b037bcc1d3f517190700dbf27c382db44aa61142c4bc4980aa4` |
| `qualificationarchive/integration_test.go` | `f2eac6b861450342f85dc8ffef0f099ca8d3fa46c6005c685298be88fb4b7541` |
| `qualificationarchive/policy_test.go` | `33c3dd4a2b348f08186357808a1695c27207d7f75b39ac5c947a0e8d255db941` |
| `qualificationarchive/verify.go` | `1999b7b0d693e6e8fc4019b71f727e646a73469d67ed2de805b680426b97a79c` |
| `qualificationarchive/verify_test.go` | `e0362eba245cdbea0ec7fcdcfee4c0b94e80c80925d1279b804cb8ee5533d169` |

The E-ARCHIVE report SHA-256 is `a275e81fe08efd64fe92faa082b1cf4353e55e80a7f08e15a9b71b27510abbc2`; its receipt SHA-256 is `d556ed2e4b8d1d60f00a591d1b071a8105c72b708b60cfd66b8256cee85c8b8d`. Its final package-test command was `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./qualificationarchive -count=1`, Go 1.24.0, exit 0, output `ok github.com/samuelpmahan/gondola/qualificationarchive 5.504s`.

## Limits

This review evidence is Go 1.24.0 on Linux/amd64. Windows filesystem behavior and DOS reserved device basenames were not exercised; this packet makes no Windows-support claim. The archive/manifest remain integrity inputs, not authenticated publisher claims. Extraction does not attest that archived browser evidence is true or fresh.

The source-pin audit, exact E-ARCHIVE test log, and tool version were captured read-only under `portable-coordination/rawlogs/XR-ARCHIVE/`.
