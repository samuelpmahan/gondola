# XR-CI-EVIDENCE: independent review of the hosted CI packet

**Decision: accepted as a faithful, time-bounded capture.** This review accepts the packet’s record of a pending/failed checkpoint only. It does not claim a successful overall CI run or final lifecycle conformance.

## Snapshot and workflow state

The fixed GitHub snapshot is `2026-10-31T07:26:45Z`, head `49cc2b96c8817a47319d5b7bd484184a22fa984b`. The raw and normalized workflow responses agree: 28 runs total (14 push and 14 pull request), 27 terminal (26 success, one failure), and one active. The primary lifecycle pull request run `41178477290` remained `in_progress` at job `124470831563`, step 7 (“Run inherited gates and compiled lifecycle matrix”). The provider status capture has no terminal decoded log for that run. I found no evidence supporting a terminal count of 28 or an eventual conclusion for the active run.

The indexed logs contain the 13 terminal successful PR job logs plus the failed primary push job log. All 14 files strict-decode as UTF-8, and each exact file byte count and SHA-256 matches its log-index entry. The 13 PR log identities and terminal outcomes agree with the captured provider job-status response. The one active PR is separately listed as pending in the log index.

## Primary push and failure boundary

Raw run, job, artifact, download, and retained-chunk metadata agree on push run `41178420647`, job `124470665705`, artifact `13034915662`, head `49cc2b96c8817a47319d5b7bd484184a22fa984b`, compressed size 47,035,803 bytes, and SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`. The provider inventory records 1,272 archive members and 412,381,547 uncompressed bytes; the retained chunks reassemble to the same provider digest. The independent E-CI-DEMO archive audit agrees on those values and recorded CRC success.

The primary run **failed** in `native-direct-browser-matrix`: the conformance invocation passed `--native-go go`, which was resolved as `/home/runner/work/gondola/gondola/go`; spawning it returned `ENOENT`. The independent native CLI probe passed, and the direct-module and React/DOM browser-profile stages completed. Because the native subprocess could not start, the final cross-profile check was withheld. The primary HTTP demo separately passed 12 checks. These successful stages do not change the failed push result or supply the missing final matrix verdict.

## Source and merge lineage

The captured source commit is `49cc2b96c8817a47319d5b7bd484184a22fa984b`, tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`, parent `6b49cc0bd4c9512a041f723c86b632ec506afd9d`. PR #14 uses that head and base. Synthetic merge `d6fe98cd11cb8eb5ba673a449099b170e222b3fa` has the same `d49…` tree and parents `[6b49cc0…, 49cc2b9…]`. Raw commit API responses, lineage JSON, and local Git object tree/parent records agree.

## Toolchain and test counts

The primary attempt records Node `v22.23.4`, npm `10.9.9`, root Go `go1.24.13 linux/amd64`, compiled Go `go1.27.3 linux/amd64`, React and ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2`. The passed HTTP smoke records browser version `156.0.8078.4`.

| Suite | Captured result |
| --- | ---: |
| Compiled frontend Node suite | 99 passed, 0 failed |
| Lifecycle pre-build shared-host/browser/oracle/conformance Node suite | 67 passed, 0 failed |
| Compiled lifecycle runtime integration Node suite | 10 passed, 0 failed |
| Compiled methods owned Node suite | 10 passed, 0 failed |

Each count is verified against its raw test output. These suites overlap and are not a grand total.

The hosted M0 check logs include `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`. The pinned `EXPECTED.json` states seed `20261030` and 5,000 cases. In source commit `49cc…`, `gobi/rules_test.go` has 59 executable composite rows; its SHA-256 matches both the source manifest and the M0 summary. These checks corroborate the reported baseline and table-row count without changing the lifecycle workflow result.

## Reproduction and evidence

The audit script is read-only with respect to source, Git, and CI state. It checked 112 conditions covering the frozen report and receipt hash, snapshot arithmetic, active-run status, log encoding/bytes/hashes, provider metadata/chunks, source and merge objects, failure command, toolchain, suite outputs, M0 inputs, and the existing E-CI-DEMO artifact audit.

- Machine-readable independent audit: [`lanes/review-evidence/audit.json`](../lanes/review-evidence/audit.json), SHA-256 `716aa4056e010ebe778e19fe1a17896f43bf7fb05efd23e4a0c1ce1c35b2baf2`.
- Audit script: [`lanes/review-evidence/audit_review_evidence.py`](../lanes/review-evidence/audit_review_evidence.py), SHA-256 `f0d88c39c23ecd44f8e56ac802c107f892f99f4252cdde06c0eb445fb7d107b9`.
- N6 report reviewed: `coordination/reports/E-CI-EVIDENCE.md`, SHA-256 `dfbe352c0b381a818a376c972e3cde0bb7f3c76f4d7bf35bed1c631375cb93a9`.
- Snapshot response SHA-256: `5877118e538ae0782c57b19384512addfeadd8323264a49b289cff2ceed4d40b`.
- PR job status snapshot SHA-256: `edae1101c40a27c1ce097c175d7a937aee26d553fa61c5f04126aedafe9e267e`.
- UTF-8 job-log index SHA-256: `d5c496eb8927f223deb0576af7dae453c8b3350085a1d5958ced8ca9968be7d4`.
- Hosted primary summary SHA-256: `a3917f0dedd261292c75adbfb8627b2e70a60ab60f7283be27e366d2fc9be07d`.

Any terminal result captured later for the old PR run belongs in a separate supplement. This review preserves the 07:26:45Z state and makes no claim about what happened afterward.
