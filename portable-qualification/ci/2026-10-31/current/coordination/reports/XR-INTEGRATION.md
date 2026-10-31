# XR-INTEGRATION — independent N1 review

## Decision: amend (metadata only)

The integration implementation and captured archive evidence pass this review. One report/receipt metadata value should be corrected through a superseding packet: N4 records the final attempt-006 test duration as `4.725s`, but attempt-006's pinned stdout says `4.540s`. `4.725s` is the result recorded in attempt 005, which ran before the last assertion tightening. The captured command and exit code for attempt 006 are still correct (focused `TestIntegration` prefix, exit 0). This does not indicate a source, fixture, or runtime behavior problem. Keep the original N4 packet unchanged and record a correction separately.

## Findings

- The original archive and manifest still match their published SHA-256 pins. The archive has 397 unique regular members and is not changed by the source supplement.
- The completed archive has 405 unique regular members. Comparing its extracted member bodies with the original confirms all 397 originals are byte-identical. The only eight additions are exactly the entries in `runtime-complete.augmentation.json`; each added entry's byte count, SHA-256, and computed Git blob object ID match its record.
- Both original and completed manifest inventories match every tar member's path, size, and SHA-256. N4's tests preserve the original strict source-pin rejection and check that the completed bundle verifies as qualified with all 13 registry-ordered cases passing.
- The three semantic mutation tests rebuild the tar and manifest after mutation. The changed healthy event count also refreshes evidence digests and provenance references and is expected to fail during Go certificate recomputation. The altered archived certificate refreshes its snapshot reference and is expected to fail on recomputed-certificate disagreement. The changed source bytes have a recomputed outer archive/manifest and are expected to fail against preserved source pins. A separate structural corruption and omitted-member case fail at extraction, as intended.
- N4's rawlog index hash and all 24 indexed attempt files' byte counts and hashes match. Attempts 001–004 preserve earlier failure history; attempts 005 and 006 preserve successful runs, with attempt 006 the last focused run.

## Independent checks

Toolchain: `go version go1.24.0 linux/amd64`.

I ran only the semantic mutation test, not the full package or browser suite:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./qualificationarchive -run '^TestIntegrationRejectsWellRehashedSemanticCertificateAndSourceMutations$' -count=1 -v
```

It passed the semantic raw capture, certificate disagreement, and source-pin disagreement subtests (exit 0, 2.051s). The independent fixture/custody checker also passed archive/manifest inventory checks, all 397 member comparisons, all eight supplement hashes/Git blob IDs, and N4 packet rawlog-index checks. Outputs and exit status are under `portable-coordination/rawlogs/XR-INTEGRATION/`.

## Pins reviewed

| Evidence | SHA-256 |
|---|---|
| N4 report `reports/E-INTEGRATION.md` | `d88ed654db23c957a24eb03a59653ea4fb9ad3dc12a0bf6a3ecd29b4e433cd8b` |
| N4 receipt `receipts/E-INTEGRATION.json` | `f6f63839da664843c5881a29443c3cfa79cdaf1c553c73d6c1b7e89ce028ccb8` |
| N4 rawlog index | `e241bb93d9631c580c9174ffde334ef21065ad46c793eeb14bca1c8b6fe4298d` |
| `qualificationarchive/integration_test.go` | `f2eac6b861450342f85dc8ffef0f099ca8d3fa46c6005c685298be88fb4b7541` |
| Original `runtime.tar.gz` | `61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca` |
| Completed `runtime-complete.tar.gz` | `5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1` |
| Augmentation record | `343ef3164ebad3f53d32fb05dad2c276ed0ff5cc3bc166aa1af5d37a4704b31c` |

No source, fixture, Git, or shared state was changed during this review. This bounded review establishes consistency of the captured archive and its tests; it does not establish fresh browser execution or producer authenticity.
