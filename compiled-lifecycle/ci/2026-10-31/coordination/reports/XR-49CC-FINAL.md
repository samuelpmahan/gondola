# XR-49CC-FINAL: review of the terminal 49cc supplement

**Decision: accepted as a faithful terminal supplement for historical source `49cc2b9`.** This review preserves both the 07:26:45Z pending capture and the later 07:35:40Z terminal capture as distinct evidence epochs. It does not claim a full hosted lifecycle pass or make a claim about a newer source head.

## Terminal workflow snapshot

The exact API snapshot at `2026-10-31T07:35:40Z` lists 28/28 runs terminal: 14 push and 14 pull request, 26 success and two failures. The only failed runs are lifecycle push `41178420647` and lifecycle PR `41178477290`. The PR run is bound to head `49cc2b96c8817a47319d5b7bd484184a22fa984b`, source tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`, parent `6b49cc0bd4c9512a041f723c86b632ec506afd9d`; PR #14 base/head metadata agrees. Its final job `124470831563` failed at “Run inherited gates and compiled lifecycle matrix.” The workflow’s evidence-preservation step succeeded.

The terminal summary has the same 28 run IDs as the prior 07:26:45Z snapshot. Exactly one run changed: PR lifecycle `41178477290`, from `in_progress` with no conclusion to `completed`/`failure`, updated at `07:29:18Z`. The earlier E-CI-EVIDENCE report and receipt remain byte-identical at their recorded SHA-256 values, and the prior raw 07:26 snapshot still matches the hash recorded in the earlier independent audit. The old pending report is not rewritten to look terminal.

## PR log and artifact evidence

The authoritative exact PR job log is 49,771 bytes, strict-decodes as UTF-8 with its BOM preserved, and matches SHA-256 `13f5ed4e5ed71b81af498553592571d98d03e64a933856e2598db6086ab979ff`. It contains the conformance invocation’s `--native-go go` argument; it does not contain the internal spawn error.

Raw artifact API metadata binds artifact `13034662119` to this PR run and head. Its 47,017,957 bytes match SHA-256 `294ab76c6e0555e4b42f31b747673070ff4982739735eb7f4ad85fbc6a728128`. I verified all 1,272 ZIP member names for path safety, ran the ZIP CRC check across the archive, and compared the three selected saved members byte-for-byte with their archive members.

The PR artifact’s `matrix/lifecycle.failed.json` and `matrix/lifecycle.run.json` reveal the same failure as the push artifact: native replay tried to spawn `/home/runner/work/gondola/gondola/go` and received `ENOENT`; the Go version probe attempted that same path and had no exit code. The full conformance check was withheld because a required evidence stage failed. Direct emitted-module replay, React/DOM/swap browser profiles, source/build pins, and final stability checks completed before the failure; they do not establish a final cross-profile match. The native CLI probe and artifact-preservation step passed, but the PR workflow itself failed.

## Historical boundary

The terminal supplement closes only the 49cc pending snapshot. Together, the push and PR runs show the repeated checkout-relative Go path failure on that source. The other 26 workflow runs passed, but the source’s lifecycle CI remains failed and the final native/direct/browser checker did not run. This review does not evaluate a later source head or its CI.

## Review evidence

The independent audit ran 66 checks over the terminal and pending API snapshots, exact log, full PR artifact, selected extracted members, supplemental hash inventory, and unchanged earlier report/receipt. It did not modify source, Git, or provider state.

- Machine-readable audit: [`lanes/review-old-final/audit.json`](../lanes/review-old-final/audit.json), SHA-256 `efd9730f0e7bebed72b1d1ad18e5c65001094601500b1478caedfb42046ec17d`.
- Audit script: [`lanes/review-old-final/audit_review_old_final.py`](../lanes/review-old-final/audit_review_old_final.py), SHA-256 `187e094a0c52930ec3f099de0b7ecd5ecfaa4d1f476f515b77aeadca4da16521`.
- Reviewed terminal packet: `coordination/reports/E-49CC-FINAL.md`, SHA-256 `2f6f71aeb66404e3c2335d73f4cda73a5a45be7236c938d065d7244006292cf2`; receipt SHA-256 `d1f9ce4f0261de693bd56c1e6ac7e67baa33a5455e4a230233cb525c23dd4564`.
- Prior pending report/receipt: `coordination/reports/E-CI-EVIDENCE.md` and `coordination/receipts/E-CI-EVIDENCE.json`, hashes `dfbe352c0b381a818a376c972e3cde0bb7f3c76f4d7bf35bed1c631375cb93a9` and `f0f0f43e0d1121791422498cd26d732a671c8004bbbadc37f65f5d06f786110c`.
- Prior 07:26 workflow response SHA-256: `5877118e538ae0782c57b19384512addfeadd8323264a49b289cff2ceed4d40b`.
- Terminal 07:35 workflow response SHA-256: `93ba4a13567d823b6d10b49ed9421df0e12f8508517a6900c1267396c2f1d585`.
- Exact PR log and artifact remain under [`lanes/old-final`](../lanes/old-final/); artifact SHA-256 `294ab76c6e0555e4b42f31b747673070ff4982739735eb7f4ad85fbc6a728128`.
