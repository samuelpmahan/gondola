# 49cc terminal PR supplement

Captured at `2026-10-31T07:35:40Z` after PR lifecycle run `41178477290` completed. The head-filtered API snapshot contains 28 terminal workflows: 26 success and two failure. The two failures are primary push `41178420647` and primary PR `41178477290`.

Authoritative decoded job log: `pr-41178477290-job-124470831563-20261031T073540Z-exact.log` (49,771 UTF-8 bytes, SHA-256 `13f5ed4e5ed71b81af498553592571d98d03e64a933856e2598db6086ab979ff`). The job log preserves the conformance command and bare `--native-go go`, but omits the internal spawn error. The PR artifact was downloaded to resolve that gap; its internal failure JSON confirms the same checkout-relative `/home/runner/work/gondola/gondola/go ENOENT`, and the full checker was withheld.

`artifact-13034662119.zip` is the PR artifact (47,017,957 bytes, SHA-256 `294ab76c6e0555e4b42f31b747673070ff4982739735eb7f4ad85fbc6a728128`). `artifact-members/` retains only the selected lifecycle failure, run, and attempt report files; the ZIP retains the complete workflow artifact.

The `superseded/` logs are incomplete intermediate captures created during transfer. They are not evidence and are excluded from the final log hash record. The earlier E-CI-EVIDENCE 07:26 pending snapshot remains unchanged and is linked from the supplement report.
