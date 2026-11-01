# XR-FRESH — N5 independent review

**Decision: accepted.** The sealed E-FRESH packet’s actual producer, native archive consumer, explicit fresh-input Go suite, and isolated M0 run have matching source, input, and output evidence. The recorded run commands exited 0. The report names five legacy `modulequalification` skips and explicitly says GitHub Actions was not run; this review makes no all-green CI claim.

## Packet integrity

The sealed report, receipt, raw-log index, and source inventory match their `seal.json` hashes. The sealed index copy is byte-identical to the coordinator copy, and all 152 indexed raw-log files match their recorded sizes and SHA-256 values. The verification output and command are preserved under `rawlogs/XR-FRESH/`.

The current checkout remains at source `4338255bf8800d521b7f932fb530fe2cedebbf72`, tree `146daa2199e0c2ee679c622b6c765a2c0ff5b356`, with clean status. The publication record says the API, staged, and fetched trees are equal. The producer source pin inventory has 236 files / 2,700,650 bytes and matches before and after execution.

## Fresh E17 execution

The archived command ran the wrapper with `--fresh --source-commit 4338255bf8800d521b7f932fb530fe2cedebbf72`, writing to `/tmp/effectsqual-fresh-4338255bf8800d521b7f932fb530fe2cedebbf72-E17`. It produced attempt `attempt-20261101T055628369Z-128-0d7fde3c`. The recorded toolchain is Go 1.24.0, compiler Go 1.27.3, Node 22.23.4, Python 3.12.14, Playwright 1.64.1, and Chromium 153.0.8010.0.

`fresh.exit-code` is 0. The 130,049-byte stdout is byte-identical to the native qualification report (SHA-256 `75ad37fd4ed1d84926bae3957848871e7e70a63899999733704c95defd054469`). Stderr is 6,623 bytes and contains the two recorded Node `UNDICI-EHPA` experimental-agent warnings; the wrapper still exited 0 and its summary status is `passed`.

The fresh archive is 8,789,735 bytes, SHA-256 `aa55ace290027a44ed772d755d10071d15f1067ab3eae1d49cc2bbbf18c59a71`; its 676-member manifest is SHA-256 `a8bd7bbe412cc1fca4af1def49356db411a4fa120ce45c66b5d34ee58ab15a7c`. The independent archive consumer reports `passed` for the same byte count, digest, and member count. The native report identifies source `4338255`, 236 archived source checks, 4 builds and 2 ABI pairs, 4 scenarios and 20 profiles. It records 178 events, 182 states, 58 effects, and 116 transport events. The producer separately records 890 profile events and 910 snapshots; its scenario event counts are literal 31, seed 20261104 49, seed 20261105 50, and seed 20261106 48.

The explicit Go suite used the fresh attempt path and `GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT=4338255...`; its `goSuite.exitCode` is 0. All four package outputs are `ok`. Five unrelated legacy tests visibly skipped: `TestCapturedFixtureIsActuallyAccepted`, `TestRealCaptureMutationControls`, `TestVerifyArchiveCleansStageWhenDestinationAppearsDuringVerification`, `TestVerifyArchiveActualPublishedRuntime`, and `TestCheckCapturesRejectsCoherenceAndMissingTypedFields`. No pass is attributed to those skipped cases.

## M0 replay and historical input stability

The M0 run used `git archive` of the accepted 4338255 source. Its archive hash is `9fb89d4d2a5445bc40d008098f3578a1bcfdbeb8e468e873ca3eb7104a50326b` before and after. The isolated `bash run.sh` received the prior PR23 attempt explicitly at `/workspace/scratch/39a56936f173/gondola/compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a`; the expected-source override was unset, so the fixture test used its pinned `e0933465725e470dc610e3f81b4bbee95538c1d0` default. `m0-run.exit-code` is 0, with the recorded seeded comparison, receipt comparison, and `SHA256SUMS` checks passing. A separate `TestPR23DirectoryIsAccepted` run with the override unset also exited 0.

The old PR23 attempt fingerprint is identical before and after: 643 files, 135,945,618 bytes, tree SHA-256 `bd561fe191ecfb5f9fbd5e1742790dd0f04ef176f97cf42338ef867b7b9a9edf`. The packet’s input-integrity comparison confirms its archive and manifest hashes, the producer source pins, and the isolated source archive were unchanged. The explicit test stdout is 153 bytes, stderr is empty, and its exit status is 0.

## Limits and review boundary

This is a read-only review of the sealed execution evidence; I did not rerun the producer, browser, Go suite, or M0 shell. I did not repeat the separately cited N3 source-closure audit. The packet does not claim that GitHub Actions ran, and it does not establish pixel equivalence, arbitrary application/backend support, network/auth behavior, or live cross-module fault injection. No production files or Git state were changed.

## Review evidence

- Sealed packet hash and raw-log audit: [`check-sealed-packet.py`](../rawlogs/XR-FRESH/check-sealed-packet.py), `sealed-packet-check.stdout.txt`
- Selected raw report values: [`summarize-sealed-results.py`](../rawlogs/XR-FRESH/summarize-sealed-results.py), `sealed-results-summary.txt`
- Actual output streams and checksums: `stream-bytes.txt`, `stream-hashes.txt`, `archive-manifest-hashes.txt`
- Input stability evidence: `input-integrity-comparisons.txt`, `input-stability-hashes.txt`
- Original E-FRESH report, receipt, and complete source logs: [`E-FRESH.md`](E-FRESH.md), [`E-FRESH.json`](../receipts/E-FRESH.json), and [`rawlogs/E-FRESH/`](../rawlogs/E-FRESH/)
