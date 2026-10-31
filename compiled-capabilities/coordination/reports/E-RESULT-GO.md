# E-RESULT-GO: Go and inherited CI evidence

## Status

Partial evidence only. The completed inherited counter/M0 push and pull request CI jobs passed. The source-pinned local full capability run completed with a failed acceptance status caused by an inherited-lifecycle wording gate. The primary hosted capability push and pull request runs were still in progress at the latest status check. This report does not claim capability acceptance.

## Source identity

The evidence concerns PR 15, branch `codex/gobi-backend-capabilities-20261031`, published head `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`, tree `d22b75e18c7bea70a743cc79d53461b287c7d045`, based on `00da54ad0f5a4006b13a5cded18ce291845978bc`. Root verified the publication binding: local tested commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c` has the same tree and direct base parent. The PR workflow checked out merge commit `b717449a8844ee695a8f1facd20d41a6b4bcf097` while retaining the same PR head.

## Completed inherited CI jobs

| Event | Run / job | Result | Tested revision |
| --- | --- | --- | --- |
| Push | [41190743798](https://github.com/samuelpmahan/gondola/actions/runs/41190743798) / `124506858263` | completed, success | published head `a2e1164d68abaaa7d028bdaf6a20bea842a131ae` |
| Pull request | [41190759554](https://github.com/samuelpmahan/gondola/actions/runs/41190759554) / `124506904642` | completed, success | head `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`; workflow merge commit `b717449a8844ee695a8f1facd20d41a6b4bcf097` |

Both job logs show Go `1.24.13 linux/amd64`, Node `v22.23.4`, npm `10.9.9`, successful `go test ./...` package output including `compilercontract` and `gobi`, 5,000 static comparison inputs with seed `20261030`, a matching receipt, and `SHA256SUMS ok`. The source script `run.sh` runs `go vet ./...` followed by `go test ./...` with `set -e`; the completed job progression therefore confirms both commands passed. The M0 manifest check covered 24 entries; its SHA256SUMS manifest is `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`, and `EXPECTED.json` is `639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2`.

The counter interaction step matched 107 scripts over 4,473 initial/action ticks using seed `20261030`; the native comparator matched. The source table `gobi/rules_test.go` contains 59 rule entries (static count, source SHA256 `dd1b8445ef29a3f2e507acca7a4e64c27fe8d4bb7ce446cc22a54e373b11d57a`). The CI log confirms package tests passed but does not print the table row count.

Raw logs are preserved in `compiled-capabilities/ci/2026-10-31/lanes/go/logs/`:

- Push log SHA256: `d6dc8b2201d79eeab1f21cbfe62a93235c9740889b511cdfee55493766ec3692`.
- Pull request log SHA256: `7f76b8b7dd79bf68bed24295db2bc40760bed241e080c91daddf1241c4bd7bcd`.

## Local full capability attempt

Root's full E-BUILD attempt `attempt-20261031T095356051Z` finished at `2026-10-31T10:16:59.067Z` with `status: failed`, `mode: full`. Its execution receipt SHA256 is `ceb82b7e2bcbb5f42a4620c3a5076fbe2803aa637b20d622e01096b1de5c1df7`. All 161 `sourceBefore` and all 161 `sourceAfter` entries matched; their canonical JSON hashes are both `92ae97820e54af47526ba1773dbbe49aa6f23b2d6ad81cda391bf2c342baafca`. The M0 preservation stage passed all 24 entries.

The runner CLI exited 0 even though the recorded execution status is failed (confirmed by root). The failed status is authoritative for this audit. The only failed stage was `inherited-static-and-interaction-lifecycle`, with error `fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain`. The fresh nested lifecycle execution itself passed, including source pins and `inheritedRun.status: passed`; its successful check text is `fresh full run-compiled-methods.sh completed before lifecycle-specific tests and matrix`. The capability runner guard currently searches for the literal substring `inherited compiled-methods`, so this successful check wording does not satisfy that guard. The nested methods execution also passed. Both execution receipts are preserved at:

- `compiled-lifecycle/builds/attempts/attempt-20261031T095356593Z/execution.json` — SHA256 `3279277688f3bd8d475a2b6cd91291bfa4cc71dc579c5883ff747cf48673cccd`.
- `compiled-methods/artifacts/attempts/attempt-20261031T095356677Z/execution.json` — SHA256 `b83a55b7130700310d67b01689b4d63e7aa495b669a88f23ad3be7226812e671`.

All other capability stages in this attempt passed: toolchain/dependency inventory, archive helper/startup regressions, M0 preservation, React and DOM GoScript builds, backend build comparison, independent literal oracle, compiled conformance, HTTP demo, and output stability. This does not turn the overall failed attempt into a pass. No replacement full E-BUILD result is recorded here.

The local attempt used Go `1.24.0` and compiled Go `1.27.3`, Node `v22.23.4`, npm `11.9.0`, and Chromium `153.0.8010.0`.

## Hosted capability workflow status

At `2026-10-31T10:19:46Z`, the primary capability push run `41190743932` and PR run `41190759391` were both `in_progress`. Their hosted artifacts and capability results were not available in this evidence packet. A read-only status refresh confirmed those states; N4 owns the artifact download and verification.

## Scope

N1 recorded completed inherited Go/counter/M0 CI evidence and reviewed the final local full-run receipt. No duplicate suites were run. Acceptance remains gated on the completed hosted capability runs and a source-bound full run whose overall status passes.
