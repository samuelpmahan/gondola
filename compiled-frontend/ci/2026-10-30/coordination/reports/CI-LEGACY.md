# CI-LEGACY — PR #11 inherited workflow audit (head 408e330)

**State: complete for the frozen historical head.** This report covers PR #11 head `408e330517b1dd5e5f865e2ff1914465f98bcf66` (tree `cd615e4bd0e83e31dd87232207afb2bf6416ccff`, parent/base `42df6883337605d901a23e9fed874768c7ce1824`). This is not an all-CI pass: 10 of the 11 workflows succeeded and the compiled-frontend workflow failed. The conclusion is limited to inherited CI reuse and preservation on this head; any repaired head requires a separate CI2-LEGACY packet and fresh run evidence.

## Workflow outcomes

The 11 workflow runs below were PR #11 runs for the stated head. I fetched each completed job log read-only and retained it under `audits/CI-LEGACY/`. The final API snapshots are `workflow-runs.snapshot-3.json`, `workflow-jobs.snapshot-3.json`, and `workflow-run-details.snapshot-3.json` (observed 2026-10-30 23:12:46 UTC). All 11 jobs executed the inherited root baseline; successful logs include `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`.

| Workflow | Run / job | Result on head 408e330 | Added parity or failure evidence |
|---|---:|---|---|
| Counter interaction parity | 41140265272 / 124352550814 | success | 107 scripts, 4,473 initial/action ticks |
| Gobi backend replacement | 41140265291 / 124352551053 | success | 103 scripts, 5,249 ticks; inherited interaction 107 / 4,473 |
| Gobi controlled input | 41140265370 / 124352551461 | success | 216 scripts, 10,149 observations |
| Gobi async effects | 41140265247 / 124352550945 | success | 76 scripts, 1,552 observations |
| Gobi HTTP effects | 41140265315 / 124352551127 | success | 82 scripts, 1,572 observations; real held-request/error/retry/abort smoke passed |
| Gobi keyed collection editor | 41140265209 / 124352550694 | success | 70 scripts, 1,113 observations; keyed real-HTTP smoke passed |
| Gobi renderer conformance | 41140265325 / 124352551381 | success | 71 scripts, 1,184 observations; renderer real-HTTP smoke passed |
| Gobi multi-root sessions | 41140265349 / 124352550921 | success | 63 scripts, 1,896 actions, 1,959 ticks, 11,754 actor observations |
| Gobi nested session tree | 41140265396 / 124352551316 | success | 63 scripts, 1,591 actions, 1,654 global ticks, 5,176 native frame pairs, 0 mismatches; browser smoke passed |
| Gobi typed parent and child composition | 41140265323 / 124352550959 | success | 63 scripts, 2,463 actions/native frames, 4,926 actor comparisons, 0 mismatches |
| Gobi compiled Go frontend | 41140265213 / 124352550636 | **failure** | root and compiled Go tests/race/vet passed; Node suite 79/81, 2 failed No-WASM guard tests; see detail below |

For the primary failed run, the CI log records `node-tests failed` and exit code 1. The single primary artifact was downloaded and materialized by root (not by N5): artifact `13019432197`, archive SHA-256 `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`, 119,128,377 bytes. Its `compiled-frontend/artifacts/logs/node-tests.stdout.log` reports failures in `conformance/no-wasm.test.mjs` tests 26 and 27: “browser guard detects compilation and instantiation attempts instead of allowing fallback” and “browser guard rejects WASM asset requests.” Both attempted to launch `/tmp/chromium`, which does not exist in this runner. The artifact execution manifest records `CHROMIUM_PATH: null`; the managed Chromium configuration test passed. Root’s artifact inspection attributes the two failures to those tests hardcoding `/tmp/chromium` while CI installs Playwright-managed Chromium. The Node suite stopped the compiled-frontend pipeline before its later build/trace/demo stages; those stages are not claimed as run for this head.

## Inherited baseline, toolchains, and source preservation

All 11 workflow YAML files declare Go `1.24.x` and Node `22`. All completed logs observed Go `1.24.13 linux/amd64`, Node `v22.23.4`, npm `10.9.9`. The baseline `run.sh` executes `npm ci --no-audit --no-fund`, React emission, `go vet ./...`, `go test ./...`, the seeded HTML comparison (`--cases 5000 --seed 20261030 --expect EXPECTED.json`), then `sha256sum -c --quiet SHA256SUMS`. Each workflow log confirms the 5,000-case verdict, receipt, and 24 pinned checksums. The rule inventory is 59 React rules (README table and 59 executable literals in `gobi/rules_test.go`).

The failed primary workflow’s uploaded execution manifest records these additional successful commands before the Node failure:

- Go 1.24.13 root package scope: `GOTOOLCHAIN=local go test ./compilercontract ./fixtures/compiled/... ./cmd/compiled-native`, the same scope with `-race`, and `go vet` on the same packages; each exit code was 0.
- Go 1.27.3 compiled-frontend scope: `go test ./analyze ./build ./cmd/... ./emit`, the same scope with `-race`, and `go vet` on the same packages; each exit code was 0.
- The primary manifest identifies Go `1.27.3 linux/amd64`, root Go `1.24.13 linux/amd64`, Node `22.23.4`, React/React DOM `19.3.1`, esbuild `0.28.2`, and Playwright `1.64.1`.

These are bounded package race scopes. They do not imply a root-wide `go test -race ./...`; the inherited baseline does run root-wide `go test ./...` and `go vet ./...`.

Independent Git comparison of the frozen base and head found 1,228 paths at the parent and 1,830 at the head; the diff has 602 additions, 0 modifications, and 0 deletions. This matches the frozen PR metadata (`changed_files: 602`) and preserves all 1,228 predecessor paths unchanged. The initial PR was draft and unmerged when recorded. Workflow run metadata identifies the exact PR head/tree and base; successful job logs check out GitHub’s synthetic PR merge commit `2dc5918b4401d54bd991303c5b345f6491288016`, so these results are attributed to the PR run rather than described as a direct-head checkout.

## Raw job-log hashes

All paths below are relative to `compiled-frontend/ci/2026-10-30/`.

| Raw log | SHA-256 |
|---|---|
| `audits/CI-LEGACY/interaction-run-41140265272-job-124352550814.log` | `98a21d8103aa10aa12559b8263dce99b928c9d7aaa16f47c7b57ab73122f4811` |
| `audits/CI-LEGACY/backend-replacement-run-41140265291-job-124352551053.log` | `64d1ecdcb131c9eb566f509ab942054b754056345f96dba65279dc4f3a2c0503` |
| `audits/CI-LEGACY/controlled-input-run-41140265370-job-124352551461.log` | `c8a53e0c3929d0b9afacc5ad0bcab45dbe8a53abef01cb13e814ff4ede3f44de` |
| `audits/CI-LEGACY/async-effects-run-41140265247-job-124352550945.log` | `4d186a1a53fcdeb5057bd06b6ad8209fd86fe8b6a9d86aa7831e91f3382ca03b` |
| `audits/CI-LEGACY/http-effects-run-41140265315-job-124352551127.log` | `92df5242b5ef38448520c715ff91950420f2f42482c6512c8cfb0f4c3aea8c37` |
| `audits/CI-LEGACY/keyed-editor-run-41140265209-job-124352550694.log` | `d34623d85787d4c47e5ff1df6e00ff385006440794a2b65f9f373cbefee08a2c` |
| `audits/CI-LEGACY/renderer-conformance-run-41140265325-job-124352551381.log` | `fdcd572068477530d69913fec59c3aa8f33f6e80f75d28e792ce461618108508` |
| `audits/CI-LEGACY/multi-root-run-41140265349-job-124352550921.log` | `490cb2c3f660d8e69d3b33516be7e935b13a7be37d0af8c8023ddefff8aa97d9` |
| `audits/CI-LEGACY/session-tree-run-41140265396-job-124352551316.log` | `5d6ccd73b01c8ca7d75779ac85c0bbe5da4791a1079beba03e6683c8a65acb4d` |
| `audits/CI-LEGACY/typed-composition-run-41140265323-job-124352550959.log` | `1334ea2e344518b1f68e4c5e208fb47c3b5a11c6c3e129dde6951fc18e78a338` |
| `audits/CI-LEGACY/compiled-frontend-run-41140265213-job-124352550636.log` | `de4414998b422c078ed7e2d6cb3cbc99551ac9d25911f9b164e14950ba9405e2` |

The source/workflow inventory and earlier status snapshots are also retained in `audits/CI-LEGACY/`. This packet closes on the frozen old head only. It does not transfer its primary failure or the ten successful statuses to a later head.
