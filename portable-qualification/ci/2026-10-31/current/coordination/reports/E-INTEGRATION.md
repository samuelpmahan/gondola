# E-INTEGRATION

**Worker:** N4  
**Outcome:** `mixed_change`  
**Reviewed source identity:** `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2`

## Changes

Added the public-API integration matrix in `qualificationarchive/integration_test.go` and retained the originally published archive and manifest in `portable-qualification/testdata/`. The original 397-member archive remains byte-for-byte unchanged.

The original archive extracts, but its 177 source-before/source-after pins refer to eight source files that are not present in the archived 397 members. `Verify` rejects it at the source-pin check. The missing paths are:

- `compiled-frontend/frontend/react/review-evidence/r2-go-emit.log`
- `compiled-frontend/frontend/react/review-evidence/r2-node-green.log`
- `compiled-frontend/frontend/react/review-evidence/r2-node-red.log`
- `compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.exit-code`
- `compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.raw.json`
- `compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.stderr.log`
- `compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-before.raw.json`
- `compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-before.stderr.log`

Following root’s source supplement, I added a separate 405-member test bundle and its augmentation record. The added bundle keeps every original member byte-identical and adds only the eight pinned source files; this is a source-complete verification fixture, not a new browser run or a replacement historical capture.

The integration suite covers:

- successful extraction and verification of the 405-member bundle, including all 13 registry-ordered passing certificate cases;
- rejection of the original 397-member bundle at its missing source-pin evidence;
- exact byte equality for all 397 original members and content/hash checks for all eight added support files;
- rejection after a compressed archive byte is corrupted or a manifest-listed raw report member is omitted;
- rejection of three fully rehashed archives with changed healthy event counts/evidence, an altered archived certificate, and changed source bytes that disagree with preserved source pins.

The mutation cases regenerate the outer tar and manifest hashes. The raw-evidence mutation also updates its evidence digest and provenance references; the certificate mutation updates its snapshot reference. They therefore reach the semantic verifier checks instead of failing because of stale outer archive hashes.

## Verification

Toolchain: `go version go1.24.0 linux/amd64`.

Final focused command:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/gofmt -w qualificationarchive/integration_test.go
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./qualificationarchive -run '^TestIntegration' -count=1
```

Result: exit 0, `ok github.com/samuelpmahan/gondola/qualificationarchive 4.725s`. This is the owned integration-test prefix, not a claim that N4 ran the full package or repository suite. Captured stdout/stderr and status are under `portable-coordination/rawlogs/E-INTEGRATION/attempt-006-registry-assertions/`.

The focused prefix contains five top-level tests. It passed the positive 405-member Verify path, the expected 397-member source-pin rejection, supplement byte/hash validation, two structural archive mutations, and three rehashed semantic/certificate/source mutations.

## Captured files

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `qualificationarchive/integration_test.go` | 19,847 | `f2eac6b861450342f85dc8ffef0f099ca8d3fa46c6005c685298be88fb4b7541` |
| `portable-qualification/testdata/runtime.tar.gz` (original) | 2,443,344 | `61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca` |
| `portable-qualification/testdata/runtime.manifest.json` (original) | 75,340 | `8adc8f345a5b66a6ea1fbb92fe9bd510d1682f4c37d4c76e8a0660e06ce30cb1` |
| `portable-qualification/testdata/runtime-complete.tar.gz` | 2,438,806 | `5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1` |
| `portable-qualification/testdata/runtime-complete.manifest.json` | 77,056 | `7645cb803edb5cbb053b43a5a02c04f124e3b60553f7057a6a92777f3d211dcd` |
| `portable-qualification/testdata/runtime-complete.augmentation.json` | 3,264 | `343ef3164ebad3f53d32fb05dad2c276ed0ff5cc3bc166aa1af5d37a4704b31c` |

The complete archive and augmentation record were copied only after their source SHA-256 values matched root’s published values. The tests independently verify the complete archive/manifest pins, source-supplement record hash, all original-member bytes, and each added member’s size and SHA-256.

## Recorded failures and limits

Earlier attempts are retained as unique records under `portable-coordination/rawlogs/E-INTEGRATION/`:

- Attempt 001 could not compile while N5’s concurrently edited `policy_test.go` had an unused `fmt` import; N5 fixed that file.
- Attempt 003 exposed an N2 verifier bug: source pins were passed through a path-bearing reference validator without a path. N2 fixed its owned verifier.
- Attempt 004 then exposed the actual 397-member archive gap: eight source pins lacked corresponding archived bytes. Root preserved that historical archive unchanged and supplied the separate 405-member source supplement. This known rejection is tested rather than hidden by weakening pin validation.
- Attempt 005 passed before the last assertion tightening; attempt 006 is the final passing capture.

This is a Go-only consistency test over captured files. It does not rerun a browser, establish producer authenticity, or turn the augmented archive into fresh qualification evidence. No Git operation or production-code change was made by N4.
