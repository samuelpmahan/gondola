# XR-CERTIFICATE — independent N1 review

## Decision: amend

The recomputed-certificate comparison and archived certificate parsing pass the reviewed checks. The main source-closure and attempt-reference checks also match the positive 405-member archive. I found a strict-JSON gap on other JSON inputs used by `Verify`: a fully rehashed archive can still verify as qualified when raw-report or provenance JSON contains conflicting duplicate keys, or when case evidence/provenance contains unknown fields.

I reproduced four distinct accepted boundary cases through the actual `verify-qualification` CLI, with the archive and manifest hashes recomputed and affected references updated:

1. The raw report contains two top-level `sourceCommit` fields, first set to forty zeroes and then to the expected source commit. `Verify` returned `qualified: true`, 405 members, and 13 passing cases.
2. The pre-archive snapshot contains conflicting duplicate `attempt` fields, with an invalid value followed by the expected attempt. It also returned qualified.
3. The pre-archive snapshot contains an unknown field. It returned qualified.
4. A case-evidence JSON file contains an unknown field; the evidence hash, raw report, archived certificate, and relevant references were updated consistently. It returned qualified.

I also retained a same-value duplicate `sourceCommit` case, which passed, and a negative control: an unknown top-level raw-report field is rejected by `CertifyFile`'s `DisallowUnknownFields` decoder. The ambiguity is concrete because the conflicting duplicate values are accepted according to last-value decoding, rather than rejected as duplicate keys. `readJSONMember` uses `json.Unmarshal` for snapshot and provenance records, and `CertifyFile` uses `json.Unmarshal` for case-evidence records, so these paths do not reject duplicate/unknown members.

This finding is about consistent JSON boundary validation. It does not undermine the verified byte pins or change the fact that Go recomputes the certificate. The archived certificate itself is decoded strictly: the verifier rejects unknown and duplicate certificate fields. Its nested `probeException` values are compared semantically without dropping additional fields; duplicate keys are rejected, and numeric spellings such as `1` and `1.0` compare by exact rational value.

## Verified behavior

- `Verify` runs `backendqualification.CertifyFile` over the extracted raw report and returns registry-ordered Go results. The 405-member fixture result is qualified with all 13 cases passing. The original 397-member archive remains a fail-closed control because eight pinned source files are absent; the separate CLI evidence records that rejection.
- Manifest bytes, attempt, source commit, and pre-archive snapshot references are cross-checked. Attempt references must be under the manifest attempt path and safe relative paths.
- Independent byte verification against the completed archive found 177 `source-before`/`source-after` pins and 87 build-provenance source pins; every pinned archived file matched size and SHA-256. Source-before/source-after and their inline snapshot copies agree. The manifest pre-archive snapshot reference matched the snapshot's bytes and digest.
- The focused N2 unit tests passed. They cover certificate duplicate/unknown rejection, exact JSON-value comparison (including number formatting and additional nested exception fields), attempt path checks, and source path/hash helpers.

## Commands and evidence

Go was `go version go1.24.0 linux/amd64`. The focused unit command passed:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./qualificationarchive -run 'TestCertificateEqual|TestStrictCertificateJSON|TestVerifyReferences|TestSourcePinComparison' -count=1 -v
```

I then generated each JSON mutation from the pinned 405-member archive, rebuilt the affected archive/manifest and snapshot references, and invoked `go run ./cmd/verify-qualification`. The exact generator, per-case command, full CLI output, exit code, input hashes, and result summary are preserved in `portable-coordination/rawlogs/XR-CERTIFICATE/`. Accepted cases output the normal 405-member qualified receipt with all 13 passing cases; the unknown raw-run field control exits nonzero with `json: unknown field "reviewerUnknownField"`.

The same raw-log directory contains a read-only source-pin closure check. It confirms all 177 source pins, all 87 build pins, and the pre-archive attempt/commit/reference bindings against actual archived member bytes. No package-wide or browser suite was run by this reviewer.

## Pins reviewed

| Evidence | SHA-256 |
|---|---|
| N2 report | `b3aea4325b220fa58127d5c97cbd3dfca75333f0c847a91add1e4b0f1a1a8b68` |
| N2 receipt | `aab32b091241235ebe5b7feccc5c9dc5ad2c7482f994eecddb47b3e46ac286c9` |
| `qualificationarchive/verify.go` | `1999b7b0d693e6e8fc4019b71f727e646a73469d67ed2de805b680426b97a79c` |
| `qualificationarchive/verify_test.go` | `e0362eba245cdbea0ec7fcdcfee4c0b94e80c80925d1279b804cb8ee5533d169` |
| `backendqualification/certify.go` | `9f4c1223421780eff104bebcba498a9986a5a4685a7639a236664c8aa5c44cc7` |
| Complete archive | `5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1` |
| Complete manifest | `7645cb803edb5cbb053b43a5a02c04f124e3b60553f7057a6a92777f3d211dcd` |

The reviewed author, fixture, and cross-worker input pins are also enumerated in `portable-coordination/rawlogs/XR-CERTIFICATE/reviewed-pins.json`.

The 33 files in this review's raw-log directory are byte/hash indexed by `portable-coordination/rawlogs/XR-CERTIFICATE/index.json` (SHA-256 `37486644970d74cf72b2fdc62ad3c484e6d5de120c03112be96319ca648480e7`).

No product source, fixtures, Git, or shared state were changed during this review. This packet does not claim archive producer authenticity or fresh browser execution.
