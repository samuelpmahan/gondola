# E-CERTIFICATE (N2)

## Result

Implemented `qualificationarchive.Verify(archivePath, manifestPath, expectedCommit)`. It extracts through N1's bounded `Extract`, rechecks the manifest bytes and its attempt/source-commit/pre-archive-snapshot binding, and calls the existing `backendqualification.CertifyFile` on the archived raw qualification report. The returned `gobi.portable-qualification-verification/v1` receipt contains the archive and manifest hashes, verified member count, and the 13 registry-ordered Go-derived case results.

Before returning a receipt, Verify compares the recomputed typed certificate to `certificate/certificate.json`. Typed certificate fields must match, the archived JSON rejects unknown and duplicate object fields, and `probeException` values are compared as complete JSON values so whitespace, object order, or equivalent number spellings do not change meaning. Additional fields are not discarded; a difference in a nested probe exception rejects the certificate.

The verifier checks the archive's source/provenance cross-bindings:

- Expected `sourceCommit` agrees with the extracted manifest, pre-archive snapshot, raw report's recomputed certificate, archived certificate, and demo-build record.
- Manifest attempt agrees with the pre-archive snapshot. The manifest's pre-archive snapshot path, byte count, and digest match the extracted member.
- `source-before.json`, `source-after.json`, and their copies in the pre-archive snapshot agree. All 177 recorded source pins match archived `source/` bytes. All 87 Go build-provenance source pins are present in that snapshot and match the archived source bytes.
- Qualification raw-report and summary references, certificate reference, build provenance/native trace references, build-summary outputs and inputs, and demo smoke reference match their attempt paths, sizes, and hashes in the extracted archive. Build provenance fixture, plan, expectations, and native-trace inputs are checked against their archived source/input members.

The verifier does not hard-code the archive member count or source-file count; it validates the supplied manifest inventory and iterates the provenance pin maps. The case count remains tied to the existing 13-case Go policy.

## Verification

Go was `go version go1.24.0 linux/amd64`. The focused verifier tests passed:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./qualificationarchive -run 'TestCertificateEqual|TestStrictCertificateJSON|TestVerifyReferences|TestSourcePinComparison' -count=1
```

The full qualification-archive package suite also passed:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./qualificationarchive -count=1
```

That package run includes the actual 405-member positive archive, the original 397-member fail-closed control, structural archive mutations, and fully rehashed raw-capture, certificate, and source-byte mutations. It returned `ok github.com/samuelpmahan/gondola/qualificationarchive 4.860s`. The exact command, stdout, stderr, exit code, Go version, and focused command are retained under `portable-coordination/rawlogs/E-CERTIFICATE/`.

The original local archive remains unchanged at 397 members (archive SHA-256 `61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca`; manifest SHA-256 `8adc8f345a5b66a6ea1fbb92fe9bd510d1682f4c37d4c76e8a0660e06ce30cb1`). Verify rejects it because eight source files listed in the preserved 177-entry snapshots have no archived `source/` bytes. The separate augmented fixture has 405 members (archive SHA-256 `5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1`; manifest SHA-256 `7645cb803edb5cbb053b43a5a02c04f124e3b60553f7057a6a92777f3d211dcd`). It adds only those eight source copies; an independent streaming comparison found all 397 original member hashes unchanged, all 177 source copies matching their recorded pins, and the pre-archive snapshot bytes and manifest reference unchanged. The augmentation record is `portable-qualification/testdata/runtime-complete.augmentation.json` (SHA-256 `343ef3164ebad3f53d32fb05dad2c276ed0ff5cc3bc166aa1af5d37a4704b31c`).

The missing support paths are the eight `compiled-frontend/frontend/react/review-evidence/` inputs enumerated in the augmentation record. Root supplied their exact source-commit copies; this completes the historical source package and does not represent a new browser run.

N3 separately reports that the actual Go CLI emitted the same 405-member, 13-case receipt with and without `--output` (receipt SHA-256 `0aae5ce79da5211dbf836425b4f8f1ee9d40533e07235133dd5c467c33e15979`). This is N3's CLI evidence, not a command run by N2.

The native `probe.validate_receipt` check accepted this E-CERTIFICATE extraction receipt. A read-only validator also rehashed the receipt's source, raw-log, report, archive, and cross-worker evidence pins; it reported zero mismatches and no native-state write. The exact validation command and output are retained under `portable-coordination/rawlogs/E-CERTIFICATE/`.

## Source pins and limits

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `qualificationarchive/verify.go` | 30,239 | `1999b7b0d693e6e8fc4019b71f727e646a73469d67ed2de805b680426b97a79c` |
| `qualificationarchive/verify_test.go` | 5,755 | `e0362eba245cdbea0ec7fcdcfee4c0b94e80c80925d1279b804cb8ee5533d169` |

The package-test snapshot also included N1's `archive.go`/tests, N4's integration test, N5's policy tests, the existing `backendqualification` implementation, and the local original/complete archive fixtures. Their pins and the retained test logs are listed in the receipt.

This is Go consistency verification of captured files. It does not authenticate the archive producer, replay browser behavior, or establish that the captured runtime observations are true. No Git, application, compiler, renderer, archive fixture, or shared-contract files were changed by N2; the complete archive supplement and its fixtures are root/N4-owned inputs.
