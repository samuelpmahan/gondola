# XR-ACCEPT-GO: independent review of N1's source-bound Go evidence

**Decision: accepted.** N1's E-ACCEPT-GO receipt and report are internally consistent with the raw current-source counter logs, the exact source and pull-request merge binding, the terminal 30-run catalog, the primary hosted full artifact, and the separately rejected local archive container. This review accepts the Go evidence packet only; it does not claim overall milestone closure.

## Receipt and source binding

The reviewed receipt is `compiled-capabilities/coordination/receipts/E-ACCEPT-GO.json` (SHA-256 `3ea3652fe8778cc33ca972a66aaca77a08e9606d8d728a96efc81e238add87e6`), and its report hash matches `compiled-capabilities/coordination/reports/E-ACCEPT-GO.md` (SHA-256 `51ca25f0b3967f653fab8df015c9e292cfeb1c65d697b2bb6b3ca0359a8c0d6f`). The receipt uses the allowed extraction outcome `mixed_change`, names source commit `60b5aeff3172837ad7831c2b78b210454a3d81a2` / tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`, and accurately describes the local archive as rejected with cause unknown. The report and receipt both leave the overall milestone gates open.

Push log `counter-push-run-41193504118-job-124514912770.log` records checkout of the source commit. PR log `counter-pr-run-41193506615-job-124514920058.log` records checkout of merge commit `07fc827212889af17524eadfe8c5c9da75d26850`, merging the reviewed source into base `00da54ad0f5a4006b13a5cded18ce291845978bc`. The source-preflight and counter-pair records bind the same source commit/tree/parent.

The terminal catalog `compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/source-60b5aeff-terminal-runs-jobs-20261031T111444Z-v2.json` (SHA-256 `b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc`) parses and contains 30 unique runs and 30 unique jobs: 15 push and 15 pull-request. All runs and jobs are completed-success and every workflow head SHA matches the source commit. The receipt's catalog counts and hash match the file.

## Counter, Go, static, and M0 evidence

Both current-source counter jobs completed successfully. The raw logs match their claimed hashes and show Go `1.24.13 linux/amd64`, Node `v22.23.4`, npm `10.9.9`, passing `compilercontract` and `gobi` package tests, 5,000 static comparison inputs, the `SHA256SUMS ok` result, and interaction parity for 107 scripts over 4,473 ticks with seed `20261030`. The PR log also confirms the tested merge commit above. `run.sh` is pinned by the preflight hash and uses `set -euo pipefail` before `go vet ./...` and `go test ./...`.

The 59-rule count is independently reproducible from the pinned `gobi/rules_test.go` source bytes; the hosted logs show the package tests passing but do not print that row count. `SHA256SUMS` has 24 rows (23 tracked rows plus one generated row), and its hash and the `EXPECTED.json` hash match the receipt. Both counter logs report the checksum verification passed. These checks support N1's distinction between source-counted rules and values printed in the job logs.

The bounded independent checks are recorded in `compiled-capabilities/coordination/reviews/XR-ACCEPT-GO/cross-checks-final.json` (SHA-256 `9480b446cdafc36f5b3a6e28409612236829fd4bb2d75f5804ecc5f6026ac2ce`). A separate readback confirmed all 23 assertions passed.

## Hosted artifact and local archive disposition

N1's primary artifact references match N4's independent verification records. The hosted full E-BUILD receipt passed with zero failures and matching 163 source pins. The 76,786,265-byte ZIP matches the provider SHA; all 1,476 outer members were verified. The 14,960,460-byte inner tar matches its manifest across 189 regular files and the gzip stream reached a valid EOF/trailer. These records support using the hosted archive as source-proof evidence under `ACCEPTANCE-SCOPE.json`.

N1 does not claim the local container is intact. The local receipt and CLI exit were successful, but the local tar has 12,845,056 observed bytes versus 14,983,690 receipt-bound bytes, and the integrity log records gzip EOF failure. Root's scope marks this local container rejected and its cause unknown. I found no inconsistency in how N1 reports this exception or in the decision not to treat the local archive as a pass.

## Review trace and limitations

I did not rerun the Go suite, change source, alter native state, or run Git operations. I checked the N1 receipt/report, their hash bindings, counter logs and source evidence, terminal catalog contents, hosted artifact verification records, and root's local archive scope record. A first import of `probe.py` stopped because the optional `rebalancer` module is not installed. I did not install dependencies: the native `validate_receipt` function does not call the solver, so the final read-only invocation supplied a no-op `ProblemSolver` symbol only to satisfy the module-level import, then called the repository's actual validator on the final review receipt. Its output is preserved at `compiled-capabilities/coordination/reviews/XR-ACCEPT-GO/nativevalidate_receipt-final-02.log`.

The first review cross-check file is preserved at `cross-checks.json`; one report-wording assertion used a phrase that the report does not use and produced a false negative. I corrected the assertion against the actual report and receipt wording and preserved the passing result separately in `cross-checks-final.json`. An earlier summary helper also referenced a nonexistent `localRun` key; reading the actual `localAttempt` field resolved it, and the substantive local-rejection checks pass. Neither checker issue changed N1's packet or any source evidence.

**Scope limit:** This review validates N1's Go evidence packet. Overall milestone closure remains pending the other independent reviews and root's remaining native acceptance checks.
