# XR-PR17-BROWSER (N5): independent review of the browser-version fix

**Decision: `accepted`**, based on the final author packet. The shared parser is used and tested by the publication runner, both changed source files match across worktrees and the stated parent commit, and the workflow preserves the inherited PR16 step after the publication profile.

## Source and workflow checks

I checked the final N4 packet at `coordination/seals/E-PR17-BROWSER/final-author/`, the corresponding current report and receipt, the publications worktree, and the qualification worktree. The parent commit is `5f624b9a46b56d9610e936360e9da2fe46b99a29`, with tree `e020be3eab3b5e0f67f3e9ea7a73662e7d3bf434`. Both changed files in each worktree are byte-identical to the parent commit blobs:

- `compiled-publications/run.mjs`: `11ba693e89123da95717076842e033ce300ce06ba45ef341e39e76e4a8d04698`
- `.github/workflows/gobi-compiled-publications.yml`: `c82001bd0fed6a3ede155e83e3308f36e5e2bebddcbef75efdad9e25f04aa493`

The runner imports the existing `isChromiumVersionOutput` helper, passes it trimmed Chromium `--version` output, includes the helper and its test in the source-pin list, and includes the test in the focused Node suite. The helper and test have identical bytes in both worktrees: `624fc3369d9f6e47d7d84d23de41e0bdbe07d6ce925c878a8623d08765b4f6ee` and `6c465496d274480ad79bf2fd74f4e6566095edc4022f83361b1d9c400a6586e6`. The helper uses an anchored version pattern for Chromium and Google Chrome for Testing, rejects malformed or suffixed output, and checks numeric components are safe integers. The focused test file covers both accepted browser names and invalid output cases.

The workflow runs the typed-input/publication profile before the full PR16 inherited chain, whose `bash run-compiled-children.sh` step remains present. The two helper tests passed in Node `v22.23.4` from the qualification worktree. Because the helper and test are byte-identical across worktrees, this run exercises the same files in both.

## Local and hosted evidence

The final author packet's local attempt `attempt-20261031T181141849Z-6` has all eight stages passed, zero source-pin differences across 130 inputs, and a 363-member archive. I checked the actual attempt receipt: its status is `passed`, all eight stages are passed, the archive is 7,651,792 bytes with SHA-256 `c449070787424074fc80834c70eb4d79e00f59b1cdccda8aa3879c5b4ffe7783`, and the tar member names match the 363 manifest entries. The archived independent consumer reports `passed` for all 363 members. The final packet's 243,906-byte attempt receipt and report hashes match the files in the publications worktree.

The original supplied CI failure was run `41222316736`, job `124599281525`, where the old Chromium-only check rejected `Google Chrome for Testing 156.0.8078.4` after the inherited PR16 chain passed. A later captured CI observation, run `41228270986` / job `124616896941` at `2026-10-31 18:14:40 UTC`, shows the publication profile succeeded; the inherited PR16 step was still `in_progress`, and backend qualification was queued. That snapshot does not establish completion of the entire hosted workflow.

The root's preliminary seal is preserved and differs from the final author packet. The final-author report/receipt hashes are `e945e309dbfcaf4f470c263d65ff6704d3f84e949e5b916dd3285ad00262b77b` and `5e1ab9a653a6b13ab42c67afaea2f7c778b46188da00570050619779d7178b0a`. The preliminary receipt recorded the attempt-receipt byte count as 0; the final author receipt corrects it to 243,906, matching the actual file. This review is bound to the final-author copy, with the earlier snapshot left unchanged.

## Limits

I did not rerun the local full publication profile, the inherited PR16 chain, or the hosted workflow. The hosted CI status above is a point-in-time observation, not a complete-workflow pass. No source, Git, or scheduler state was changed by this review.
