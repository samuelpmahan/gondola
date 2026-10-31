# E-FIXED-EVIDENCE — hosted CI terminal capture

**Decision: accepted (`confirmed_reuse`).** The final GitHub Actions snapshot lists all 28 expected workflows for the repaired source as completed successfully: 14 `push` runs and 14 `pull_request` runs, with no failures, cancellations, or active runs. The successful primary push artifact contains the full lifecycle runner execution, and the corresponding PR lifecycle workflow also passed.

## Source and synthetic-merge identity

- Repository: `samuelpmahan/gondola`
- Branch/source head: `codex/gobi-compiled-lifecycle-20261031` / `00da54ad0f5a4006b13a5cded18ce291845978bc`
- Source tree: `51b64a89b5f7e0edd4792becbed9adad6a27a698`
- Source parent: `49cc2b96c8817a47319d5b7bd484184a22fa984b`
- PR #14 base: `6b49cc0bd4c9512a041f723c86b632ec506afd9d`
- Hosted synthetic merge: `527cd2970435b913a7054f6ad796abfadf2bb56a`, same tree as source, parents `[6b49cc0bd4c9512a041f723c86b632ec506afd9d, 00da54ad0f5a4006b13a5cded18ce291845978bc]`.
- Raw source, synthetic-merge, and PR snapshots are retained under `../../fixed/lanes/evidence/lineage/`.

This packet covers the repaired `00da54a` head. The earlier `49cc2b9` evidence packet is preserved separately and is not used in the 28-run totals below. The PR's synthetic merge was tested; this evidence does not record a Git merge or deployment.

## Terminal workflow inventory and raw logs

The final API response was captured at `2026-10-31T08:15:09.541Z`. The parsed counts are 28/28 completed success, split evenly between push and pull-request events. The primary lifecycle push was run `41181505234`; its lifecycle PR run was `41181508994`. The previously active typed-composition PR run `41181508944` also completed successfully.

- Final raw API response: `../../fixed/lanes/evidence/snapshots/workflows-20261031T081509Z.json` — 360,002 bytes, SHA-256 `d6a4fa32f68d50445fb1e388a81f211cde795e47ea548028dfaeaa59f3955d71`.
- Parsed run summary: `../../fixed/lanes/evidence/snapshots/workflows-summary-20261031T081509Z.json` — SHA-256 `f416b9c448958743c6e489b2ca3afa535292096ed90ebad61f50787e7db2c6ed`.
- Final PR job list: `../../fixed/lanes/evidence/jobs/pull-request-jobs-final-20261031T081509Z.json` — SHA-256 `cbddcf4de9c9778ffe244a908d14043975a09acc36ba62c46367299006517c1d`; all 14 jobs completed successfully.
- Exact decoded log index: `../../fixed/lanes/evidence/logs/job-log-index-final.json` — SHA-256 `ffc463b2f0b1d7592627d838fbe7a6b7c81c87090b5e67915798368adac48d65`. It lists all 14 terminal PR job logs and the primary push log with byte counts and SHA-256 values. The primary push log is 50,162 bytes, SHA-256 `77996bcf53e202f4cf9fcfb943eea1ce74c42d64e6d209648ac4c8afb2c6c9c1`.

The last PR log is for typed-composition run `41181508944`, job `124479693802`: 253,405 bytes, SHA-256 `85a5994cdfb32850b23c6a37e41b4a17d519b32ed1f27f66ce7ff7debe9dbbf2`. Its artifact metadata is retained in `../../fixed/lanes/evidence/jobs/pr-41181508944-artifacts.json`; the artifact was not downloaded because the verified primary push ZIP already contains the full parent run, and no distinct issue required a duplicate ZIP.

I verified the PR log index against the final 28-run response and all 14 terminal PR job records: each run ID and job ID binds to the matching archived log, and each file's byte length and SHA-256 match the index.

## Successful primary lifecycle artifact

Primary push run `41181505234` produced artifact `13035044166` (`gobi-compiled-lifecycle-artifacts`). Its ZIP is 47,072,021 bytes with SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`; the verified archive has 1,270 members and 413,394,195 uncompressed bytes. Root retained and CRC-checked the ZIP and extracted it at `../../fixed/extracted/`.

The artifact's `compiled-lifecycle/coordination/receipts/E-BUILD.json` reports `mode: full`, `status: passed`, 18 completed commands, and 123 source pins matching before and after execution. The inherited `run-compiled-methods.sh` child completed its full 17-command execution. The source-bound runner records successful Go fixture/compiler tests, Node tests, native CLI, React and DOM GoScript builds, native/direct/browser conformance, and the HTTP smoke.

### Tool versions and test counts

The current artifact records Node `v22.23.4`, npm `10.9.9`, root Go `go1.24.13 linux/amd64`, compiled Go `go1.27.3 linux/amd64`, React and ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, and managed Chromium `156.0.8078.4`.

Test counts are separate suites and are not added together because the suites overlap:

| Evidence in the current artifact | Result |
| --- | --- |
| Lifecycle pre-build Node suite | 71 passed, 0 failed |
| Compiled lifecycle runtime integration Node suite | 10 passed, 0 failed |
| Inherited compiled-frontend Node suite | 99 passed, 0 failed |
| Inherited compiled-methods owned Node suite | 10 passed, 0 failed |
| M0 Go/React compatibility | Same over 5,000 inputs; seed `20261030`; receipt and `SHA256SUMS` matched |
| M0 executable compatibility table | 59 rule rows in `gobi/rules_test.go`; this is a row count, not a test count |

The inherited full-runner log also reports: interaction parity, 107 scripts / 4,473 ticks (seed `20261030`); backend replacement, 103 / 5,249 (seed `20261030`); controlled input, 216 / 10,149; async effects, 76 / 1,552; HTTP effects, 82 / 1,572; keyed collection, 70 / 1,113; renderer contract, 71 / 1,184; and multi-root, 63 scripts / 1,896 actions / 1,959 ticks / 11,754 actor observations. The relevant two-seed traces identify `20261030` and `20261031`. These values were read from the current primary artifact's inherited log, not carried forward from the prior PR13 capture.

### Lifecycle matrix and demo

The primary lifecycle matrix status and check status are `matched`. Native Go, direct GoScript, React, DOM, and alternating-renderer profiles match across 26 events/ticks, 16 clicks, and 17 renderer swaps. The run records seven request effects, three child-first cancellations (`grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`), and all eight mutation controls detected. The managed HTTP smoke passed all 12 checks; its three observed asset requests returned HTTP 200, with zero browser errors, failed requests, or WASM requests/API attempts.

The detailed artifact audit receipts are retained alongside this packet. AppIR v1 advertises the coarse `effect.request-reply` capability; this experiment explicitly mounts the closed lifecycle effect policy/driver to support cancellation. An ordinary default host still rejects `lifecycle.cancel`. These checks do not establish generic cancellation negotiation or pointer-Manager compilation.

## Retained anomalies and limits

- The earlier raw snapshot `../../fixed/lanes/evidence/snapshots/workflows-20261031074228T.json` is invalid JSON because it contains an unescaped newline in a URL at character 7000. It remains unchanged (359,954 bytes; SHA-256 `3611879716d0d6dd04dceccddbf23482921739efb536933a61be20106fbd6ca0`) and is excluded from parsed counts. The final valid snapshot above supersedes it. This is catalogued in `../../fixed/extraction-anomalies.json`.
- Root's extraction audit found an extra 48,496,640-byte file outside the provider ZIP that is an exact prefix of the archived 66,817,124-byte `matrix/lifecycle.browser.json`, SHA-256 `4888479ee2bcf9d514698b27677d027799b4cdbca02d9fbee8fda39d209120a2`. Its origin is not established; it is not a provider member and is excluded from application acceptance. The authoritative ZIP remains the evidence source. The anomaly is catalogued in `../../fixed/extraction-anomalies.json`.
- This collector did not create that extraction-only file. No source, Git, workflow, or hosted state was changed during evidence capture; the work here was limited to read-only API collection, log/snapshot verification, and this dated evidence packet.

The result establishes terminal success for this 28-workflow CI set and a passing, source-pinned full primary lifecycle run. It makes no claim beyond the pinned tree, run set, and retained artifacts.
