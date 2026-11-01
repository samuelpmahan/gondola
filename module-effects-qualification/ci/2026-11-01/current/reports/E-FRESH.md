# E-FRESH: fresh native qualification and M0 replay

Outcome: `confirmed_reuse`.

The rawlog manifest lists 151 files (excluding itself), including the primary archive and full producer command streams. SHA-256: `f1d40a40996c63960a5f4c397bd54c681a58121c39fdd057dfc821dd2bc3ae2b`.

## Accepted source and producer identity

The run used accepted source commit `4338255bf8800d521b7f932fb530fe2cedebbf72`, tree `146daa2199e0c2ee679c622b6c765a2c0ff5b356`. The source-publication record marks that API tree, staged tree, and fetched tree equal and clean; the execution gate authorizes runtime execution. Git HEAD and status were checked before and after the runs. The checkout remained clean, and `git archive HEAD` had the same SHA-256 before and after: `9fb89d4d2a5445bc40d008098f3578a1bcfdbeb8e468e873ca3eb7104a50326b`.

The fresh producer source and fresh capture both identify commit `4338255bf8800d521b7f932fb530fe2cedebbf72`. This is separate from the historical PR23 input used for M0, whose producer source is `e0933465725e470dc610e3f81b4bbee95538c1d0`.

Independent N3 source audit subsequently confirmed all 62/62 Go closure inputs and 44/44 application/runner inputs against this source and producer archive, with stable before/after pins. The audit reported no source mismatch.

## Fresh producer, archive acceptance, and Go controls

The full fresh command ran with Go 1.24.0, compiler Go 1.27.3, Node 22.23.4, Python 3.12.14, Playwright 1.64.1, and Chromium 153.0.8010.0. It wrote to the new external output root `/tmp/effectsqual-fresh-4338255bf8800d521b7f932fb530fe2cedebbf72-E17`.

The producer completed one attempt: `attempt-20261101T055628369Z-128-0d7fde3c`. It pinned 236 source files (2,700,650 bytes), including 73 test source files in the captured verifier and producer test closure. Producer tests passed: 3 Go packages, 36 Node tests across 7 files, 4 compiler regression tests, 1 build-stage regression, and 1 module ABI regression. It produced 20 profiles over 4 scenarios: 890 profile events, 910 snapshots, 580 profile transport events, and the four native scenarios/events described below.

The Go archive consumer accepted the new archive and then reran the explicit fixture-backed suite with `GOBI_EFFECTS_QUALIFICATION_INPUT` set to this attempt and `GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT=4338255bf8800d521b7f932fb530fe2cedebbf72`. Both steps passed. The native report verifies 676 archived inputs, 236 source pins, 4 builds, 2 ABI pairs, 4 scenarios, 20 profiles, 178 events, 182 states, 58 effects, and 116 transport events. The native verifier checks the saved capture; the producer separately ran the Chromium-backed profiles.

Primary artifacts:

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| Attempt directory | `/tmp/effectsqual-fresh-4338255bf8800d521b7f932fb530fe2cedebbf72-E17/attempt-20261101T055628369Z-128-0d7fde3c` | Fingerprint after run: `7aa7ff0ae9827b5ba45ad363749ebb9643d367afea817e6a55e255bb1538599d` |
| Archive, 8,789,735 bytes | `/tmp/effectsqual-fresh-4338255bf8800d521b7f932fb530fe2cedebbf72-E17/attempt-20261101T055628369Z-128-0d7fde3c.tar.gz` | `aa55ace290027a44ed772d755d10071d15f1067ab3eae1d49cc2bbbf18c59a71` |
| Manifest, 676 members | `/tmp/effectsqual-fresh-4338255bf8800d521b7f932fb530fe2cedebbf72-E17/attempt-20261101T055628369Z-128-0d7fde3c.manifest.json` | `a8bd7bbe412cc1fca4af1def49356db411a4fa120ce45c66b5d34ee58ab15a7c` |
| Native qualification report | `rawlogs/E-FRESH/qualification-report.json` | Included in the raw-log manifest |
| Go test log | `rawlogs/E-FRESH/qualification-go-tests.log` | Included in the raw-log manifest |

The producer omitted exactly four regenerable browser bundles from the archive; the native archive verifier accepted the resulting closed member inventory. The producer receipt, manifest, pre/post source pins, source-closure records, all per-command raw streams, and archive/consumer logs are copied into `rawlogs/E-FRESH/`.

Five unrelated legacy `modulequalification` tests visibly skipped because they require separate compiled-module capture/archive inputs: `TestCapturedFixtureIsActuallyAccepted`, `TestRealCaptureMutationControls`, `TestVerifyArchiveCleansStageWhenDestinationAppearsDuringVerification`, `TestVerifyArchiveActualPublishedRuntime`, and `TestCheckCapturesRejectsCoherenceAndMissingTypedFields`. No pass is attributed to those tests. The new effects acceptance and controls had their explicit fresh attempt and expected source commit configured.

## Isolated M0 replay

I created an isolated source tree using `git archive 4338255bf8800d521b7f932fb530fe2cedebbf72`; the archive SHA-256 is the same `9fb89d4...` recorded above. `bash run.sh` ran only under `/tmp/effectsqual-m0-4338255bf8800d521b7f932fb530fe2cedebbf72-E17/source`. Its pinned `npm ci` populated that isolated tree's `node_modules`; live checkout dependencies were not changed.

The run received the old PR23 attempt explicitly through `GOBI_EFFECTS_QUALIFICATION_INPUT`. `GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT` was unset, so the integration test used its default `e0933465725e470dc610e3f81b4bbee95538c1d0`. `bash run.sh` passed `go vet ./...`, `go test ./...`, the 5,000 seeded comparison, receipt comparison, and `SHA256SUMS`. A separate visible `TestPR23DirectoryIsAccepted` run also passed with the override unset.

## Input integrity and limits

The producer's before/after source-pin inventory files are byte-identical (236 pins); source closure head/dirty/status values match. The old PR23 attempt directory fingerprint remained `bd561fe191ecfb5f9fbd5e1742790dd0f04ef176f97cf42338ef867b7b9a9edf` across the fresh and M0 runs (643 files, 135,945,618 bytes), and its archive/manifest digests also matched before and after. The M0 Git archive bytes matched before and after execution. The final source worktree remained clean. The producer wrote its normal ignored per-attempt logs under `compiled-module-effects/evidence/attempts/`; these logs were copied to E-FRESH rawlogs.

The fresh run exercises the captured fixed/seeded profiles and the declared Go ABI, artifact, lifecycle, effect, correlation, state, tree, DOM, and disabled-control contracts. It does not establish pixel equivalence, arbitrary backend or application support, network/auth behavior, or live cross-module error/timeout/cancellation fault behavior. The Go native acceptance does not launch a browser. The GitHub Actions workflow was not run in this local execution.

## Evidence-collection corrections

The preparation corrections and the initial comparison-shape issue are recorded in [preparation-errors.md](../rawlogs/E-FRESH/preparation-errors.md). None was a fresh producer, native archive, Go control-suite, or M0 failure; all final runtime commands exited 0.
