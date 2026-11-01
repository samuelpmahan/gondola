# E-CIFINAL: no-fixture M0 and corrected-source fresh recovery

Outcome: `confirmed_reuse`.

The rawlog index records 133 files (excluding itself), including the primary archive and full producer streams. SHA-256: `32707d8445a05c4c0443eab1c05e5ea5ab900ba0a8b097d0e41a02bd3445deb3`.

## Source and gate

The corrected source is commit `8632f139354c0863482eb625c3ba99b4f607ea0c`, tree `25af3c13551870e10873f74722cabd2e4e38b0fa`, parent `4338255bf8800d521b7f932fb530fe2cedebbf72`. The corrected publication proof marks the source clean and says only `effectqualification/fixture_selection_test.go` and `effectqualification/integration_test.go` changed; no production Go files changed. The checkout was clean before and after the local runs. `git archive HEAD` hashed to `ee27e141326f9a959b09ec2258d8fa264afd3ea2a007ef6a8ffce0cba1607bd6` both times. N5's XR-CIFIX review accepted the test-only behavior and its explicit-path, missing-path, default-fixture, and real-fixture controls.

The hosted native workflow run `41278451068` passed. The inherited M0 run `41278451076` had failed when optional fixture checks treated an absent PR23 attempt as fatal. E-CIFINAL reran M0 from the corrected source with all `GOBI_EFFECTS_*` variables absent and reran the fresh wrapper with its generated attempt passed explicitly to Go tests.

## M0 with no fixture available

The isolated source archive came from commit `8632f139354c0863482eb625c3ba99b4f607ea0c` and has SHA-256 `ee27e141326f9a959b09ec2258d8fa264afd3ea2a007ef6a8ffce0cba1607bd6`. It was extracted under `/tmp/effectsqual-cifinal-m0-8632f139354c0863482eb625c3ba99b4f607ea0c-E35/source`. The archive contained neither `compiled-module-effects/output` nor `compiled-module-effects/evidence` before the run; `compiled-module-effects/output` remained absent afterward.

`bash run.sh` ran in that isolated source tree with `env -i`; the captured environment contained no `GOBI_EFFECTS_*` variables. Its offline `npm ci` populated only the isolated archive's `node_modules`. The M0 script passed `go vet ./...`, `go test ./...`, the 5,000 seeded comparison, receipt comparison, and `SHA256SUMS` verification. The output includes `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`.

A separate verbose `go test -v -count=1 ./effectqualification` under the same no-fixture environment exited 0. `TestResolveEffectsQualificationInput` passed all five subcases, including absent default fixture, explicit missing path, and explicit non-directory handling. Fixture-dependent PR23 checks visibly skipped because no fixture was requested or present; no helper emitted a fatal error. The full skip list is preserved in `rawlogs/E-CIFINAL/m0-no-fixture-verbose.stdout.log`.

## Fresh corrected-source qualification

The fresh wrapper ran against source commit `8632f139354c0863482eb625c3ba99b4f607ea0c` with Go 1.24.0, compiler Go 1.27.3, Node 22.23.4, Python 3.12.14, Playwright 1.64.1, and Chromium 153.0.8010.0. The output root was `/tmp/effectsqual-cifinal-fresh-8632f139354c0863482eb625c3ba99b4f607ea0c-E35`.

The producer emitted attempt `attempt-20261101T062545178Z-121-4b515620`. It pinned 237 source files (2,704,872 bytes), including 74 test source files. Producer checks passed: four builds, three Go test packages, 36 Node tests across seven files, four compiler regression tests, one build-stage regression, and one module ABI regression. It executed 20 profiles across four scenarios, recording 890 profile events, 910 snapshots, 580 profile transport events, 178 native events, 182 native states, 58 native effects, and 116 native transport events.

The native archive consumer and explicit Go suite passed. The Go suite used the new attempt path and expected source SHA explicitly. `effectqualification` passed with no skips; `TestPR23DirectoryIsAccepted` passed against the fresh source identity. Five unrelated legacy `modulequalification` tests visibly skipped because their separate compiled-module fixture/archive variables were not configured; no pass is attributed to them.

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| Fresh attempt | `/tmp/effectsqual-cifinal-fresh-8632f139354c0863482eb625c3ba99b4f607ea0c-E35/attempt-20261101T062545178Z-121-4b515620` | after-run fingerprint `7aa7ff0ae9827b5ba45ad363749ebb9643d367afea817e6a55e255bb1538599d` |
| Archive, 8,792,006 bytes, 677 members | same output root, `attempt-20261101T062545178Z-121-4b515620.tar.gz` | `d1503bec6ac4f280f5576670eac3b6c5c7de143b4d0bc32a0dd79a634125c272` |
| Manifest, 677 members | same output root, `attempt-20261101T062545178Z-121-4b515620.manifest.json` | `d8f7f6a1f8ab17762e56bfae838772f95cae01ddd815094b48b6dabfaa2ce51e` |

Native archive acceptance reports source commit `8632f139354c0863482eb625c3ba99b4f607ea0c`, 237 source pins, four builds/two ABI pairs, and four scenarios, 20 profiles, 178 events, 182 states, 58 effects, and 116 transport events. The producer omitted only its four regenerable browser bundles from the 677-member archive.

## Input integrity, evidence, and scope

Producer source-pin snapshots before and after are byte-identical (SHA-256 `ab3e2b96b67a20fd81a8c10edfbda72114c6af090bd67f05d133248a1f45bc9d`), and the native report marks all 237 archived source checks matched. The isolated M0 source archive hash is identical before and after execution. The earlier E-FRESH rawlog manifest remains unchanged at SHA-256 `f1d40a40996c63960a5f4c397bd54c681a58121c39fdd057dfc821dd2bc3ae2b`.

All E-CIFINAL report, receipt, and raw command streams are under the outer `effects-qualification-coordination` tree. The producer also wrote its standard ignored per-attempt command evidence under `compiled-module-effects/evidence/attempts/`; those command streams were copied into E-CIFINAL rawlogs. No production or tracked Git files were changed.

This validates the corrected no-fixture skip behavior and the fresh saved capture/ABI/artifact controls. The native verifier checks the saved capture and does not relaunch a browser. This does not establish pixel equivalence, arbitrary applications, network/auth behavior, or live cross-module runtime fault behavior. The corrected source's hosted workflow was not rerun by E-CIFINAL.

Two setup-only command errors occurred before testing: a redundant second `mkdir` (exit 1) and an unmatched quote in a follow-up evidence command (exit 2). Their notes and raw outputs are preserved. Neither affected the source archive or either runtime result.
