# E-CI-EVIDENCE — hosted lifecycle CI capture

**Outcome: mixed_change.** This packet records hosted checks for published source commit `49cc2b96c8817a47319d5b7bd484184a22fa984b`. The primary push job failed at the native replay executable path. Its preceding build, unit, direct replay, browser profile, and HTTP demo evidence passed, but the final conformance check was withheld. This is not a full hosted lifecycle acceptance.

## Source and merge identity

- Repository: `samuelpmahan/gondola`
- Source branch/head: `codex/gobi-compiled-lifecycle-20261031` / `49cc2b96c8817a47319d5b7bd484184a22fa984b`
- Source tree: `d49ca35b7eda23837c392bbe0d2363551e4c7bec`
- Source parent: `6b49cc0bd4c9512a041f723c86b632ec506afd9d`
- PR: #14, base `6b49cc0bd4c9512a041f723c86b632ec506afd9d`
- Synthetic merge: `d6fe98cd11cb8eb5ba673a449099b170e222b3fa`; tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`; parents `[6b49cc0bd4c9512a041f723c86b632ec506afd9d, 49cc2b96c8817a47319d5b7bd484184a22fa984b]`.
- Lineage snapshots: `../../lanes/evidence/source-merge-lineage.json`, `commit-source-49cc-current.json`, `commit-merge-d6fe-current.json`.

## Current workflow snapshot

The immutable workflow response and normalized summary are in `../../lanes/evidence/runs-headsha-20261031T072645Z.json` and `../../lanes/evidence/runs-summary-20261031T072645Z.json`. At `2026-10-31 07:26:45 UTC`, GitHub listed all 28 expected runs (14 `push`, 14 `pull_request`): 27 were terminal (26 success, one failure), and primary PR lifecycle run `41178477290` was still `in_progress`. The push matrix was 13 success and one failure; the PR matrix was 13 success and one active. The active job was `124470831563`, still in “Run inherited gates and compiled lifecycle matrix”; the last run update reported by GitHub was `07:04:06Z`. No conclusion is inferred for that active run.

The 14 PR run/job states and step data were captured in `../../lanes/evidence/pr-job-statuses-20261031T072645Z.json`. The run/log inventory under `../../lanes/evidence/logs/job-log-index.json` contains the exact byte lengths and SHA-256 hashes for 13 terminal PR job logs and the primary push log. GitHub did not provide a terminal decoded log for the active PR job at the snapshot time. Earlier interim workflow snapshots are retained alongside this final capture.

## Primary lifecycle push and artifact

Primary push run `41178420647`, job `124470665705`, completed with `failure`. The primary artifact is `gobi-compiled-lifecycle-artifacts`, artifact ID `13034915662`, compressed size 47,035,803 bytes, SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`. The verified archive has 1,272 members and 412,381,547 uncompressed bytes; root extracted it at `../../extracted/`.

The captured attempt is `../../extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z`; source pins matched (122 before and after). Go fixture/native tests, compiler Go tests, Node suites, native CLI probe, React and DOM GoScript builds, compiled runtime tests, backend build comparison, output stability pins, and the inherited `run-compiled-methods.sh` all completed successfully. The HTTP demo passed 12 checks: its three HTTP requests returned 200, with no WASM requests or WASM API attempts. The direct emitted-module replay and React/DOM/swap browser profile stages completed.

The failure was the native subprocess launch: the harness received bare `--native-go go` and resolved it against the checkout, attempting `/home/runner/work/gondola/gondola/go`; `spawnSync` returned `ENOENT`. The independent compiled native CLI probe passed. Since the native conformance stage failed, the final native/direct/browser cross-profile checker was withheld. The build, direct, browser, and demo artifacts prove those stages individually; they do not prove a complete matrix match.

The hosted toolchain inventory was Node `v22.23.4`, npm `10.9.9`, root Go `go1.24.13 linux/amd64`, compiled Go `go1.27.3 linux/amd64`, React and ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2`. The two GoScript builds each passed with 67 output pins and zero diagnostics. The native CLI probe emitted the 26-step lifecycle trace (seven requests and three child-first cancels).

## Test and replay counts

Counts below are separate suites or replay observations. They are not added together as a grand total because suites overlap.

| Evidence | Observed result |
| --- | --- |
| Compiled frontend Node suite | 99 passed, 0 failed |
| Lifecycle shared-host/browser/oracle/conformance pre-build Node suite | 67 passed, 0 failed |
| Compiled lifecycle runtime integration Node suite | 10 passed, 0 failed |
| Compiled methods owned Node suite | 10 passed, 0 failed |
| M0 randomized Go/React compatibility | Same over 5,000 inputs, seed `20261030`; receipt and `SHA256SUMS` matched |
| M0 executable React compatibility rule table | 59 rows, counted from `gobi/rules_test.go` `rules()`; this is a rule-row count, not a test count |
| Interaction parity | 107 scripts / 4,473 ticks, seed `20261030` |
| Backend replacement parity | 103 scripts / 5,249 ticks, seed `20261030` |
| Controlled input parity | 216 scripts / 10,149 observations, seeds `20261030`, `20261031` |
| Async effects parity | 76 scripts / 1,552 observations, seeds `20261030`, `20261031` |
| HTTP effects parity | 82 scripts / 1,572 observations, seeds `20261030`, `20261031` |
| Keyed collection parity | 70 scripts / 1,113 observations, seeds `20261030`, `20261031` |
| Renderer contract parity | 71 scripts / 1,184 observations, seeds `20261030`, `20261031` |
| Multi-root replay | 63 scripts / 1,896 actions / 1,959 ticks / 11,754 actor observations; trace names identify seeds `20261030`, `20261031` |

The M0 count is corroborated by the 59 composite rows in `gobi/rules_test.go` and the README statement; the source hashes are recorded in `hosted-primary-summary.json`. Hosted primary raw logs and extracted attempt files are preserved under `../../extracted/`.

## Inherited child and local evidence boundaries

The hosted primary attempt's inherited `compiled-methods` child passed all 17 commands. Its receipt SHA-256 is `bedc02817c093cd9a25cac3f186330e9cc31eb33b2e8538a4e83b547a8d8a075`; report SHA-256 is `4713dec1b968be7de975fa5ca1ab4b81df5f287d411c6fb16a0bc14a968c3ec5`. This is an independent child pass and does not turn the lifecycle parent into a pass.

Earlier local outcomes remain separate in `../../lanes/evidence/local-prior/index.json`: the first full parent failed (17/18 commands; source pins were not stable, with the compiled runtime test called before fresh builds); the inherited child separately passed 17 commands; a later `--lifecycle-only` run passed 18 commands across 13 stages with stable pins. Those do not combine into one full-parent local pass and are not hosted results.

## Claim boundary and follow-up

At the captured snapshot, one workflow remained active and the primary push lifecycle run had failed. Therefore this evidence establishes neither all-28-run completion nor a complete hosted lifecycle conformance pass. Root assigned a bounded native executable path repair; any repaired source must use a new source head and fresh CI. The active PR run was left running; this report does not claim its eventual result.

Primary machine-readable summary: `../../lanes/evidence/hosted-primary-summary.json`. Exact GitHub job-log hashes and bytes: `../../lanes/evidence/logs/job-log-index.json`.
