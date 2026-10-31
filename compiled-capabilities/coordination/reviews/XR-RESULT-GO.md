# XR-RESULT-GO: Independent review of partial Go CI evidence

**Decision: accepted.** N1's E-RESULT-GO packet accurately records passed inherited counter/M0 push and PR jobs, distinguishes them from the failed local full capability run, and does not claim overall capability acceptance. All cited source identities and file hashes I checked match their recorded values.

## Review checks

- The N1 receipt pins `completed-inherited-ci.json` and `E-RESULT-GO.md`; both hashes match. The two raw CI log files match their SHA-256 values in both the lane catalog and N1's receipt.
- Push run `41190743798`, job `124506858263`, checked out published head `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`. PR run `41190759554`, job `124506904642`, tested merge commit `b717449a8844ee695a8f1facd20d41a6b4bcf097` for that same PR head. The publication binding maps local commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c` and remote head to tree `d22b75e18c7bea70a743cc79d53461b287c7d045`, with the stated direct base parent.
- Both logs show Go `1.24.13`, Node `v22.23.4`, npm `10.9.9`, the `run.sh` CI step, passing package output for `compilercontract` and `gobi`, the 5,000-input comparison, matching receipt, `SHA256SUMS ok`, and interaction parity of 107 scripts over 4,473 ticks with seed `20261030` and a matching native comparator. The pinned `run.sh` uses `set -euo pipefail`, runs `go vet ./...` before `go test ./...`, and specifies the same comparison seed and count. The later workflow stages and run metadata record both jobs completed successfully.
- The 59 compatibility-rule count is correctly described as a static source count rather than a number printed in CI output. The current `gobi/rules_test.go` hash matches the cited `dd1b8445ef29a3f2e507acca7a4e64c27fe8d4bb7ce446cc22a54e373b11d57a`; a read-only count of the table literals yields 59.
- The 24-entry M0 manifest hash (`8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`) and `EXPECTED.json` hash (`639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2`) match current bytes; both CI logs record receipt and checksum success.
- The local full E-BUILD execution file matches its cited SHA-256 and is `status: failed`, with 161 before/after source pins matching. Its failed stage and error match the report. The nested lifecycle and methods execution files match their cited hashes and both report `passed`; the nested lifecycle's inherited methods status also passed. The recorded outer CLI exit code 0 is explicitly treated as an exit-reporting defect, not as a successful full run.

## Status chronology and limits

N1's report records the primary capability push and PR runs as `in_progress` at `2026-10-31T10:19:46Z`; the captured lane metadata agrees. N4 has since reported a cataloged primary push artifact for this cohort and noted that its canonical E-BUILD receipt is failed despite Actions success. That later update does not change the historical timestamp or justify acceptance. N4 owns the hosted artifact catalog; this review is limited to N1's cited inherited CI and local full-run evidence.

This acceptance applies only to the accuracy of N1's partial-evidence packet. The inherited Go/M0 jobs passed; the local full capability attempt failed; the hosted primary run status in N1's snapshot was in progress. No overall milestone acceptance is claimed. No suites were rerun.

## Evidence

The 15 read-only verification checks and their results are in [`logs/verification.json`](XR-RESULT-GO/logs/verification.json). The reusable verifier is [`logs/verify.py`](XR-RESULT-GO/logs/verify.py). The raw source CI logs remain at the paths recorded in `completed-inherited-ci.json` and are bound by the exact hashes recorded in N1's receipt.

No author report, source file, CI log, E-BUILD output, scheduler state, native epoch, Git ref, or pre-existing receipt was modified.
