# E-PR17-BROWSER (N4): accept Chrome for Testing version output

**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## CI failure and fix

The task-provided CI witness is run `41222316736`, job `124599281525`, on source base `5662efcd7feb7920e4690d38cc76a297fed69d5a`. Its inherited PR16 chain passed; the publication profile then failed in `tool-versions` because the runner accepted only strings containing `Chromium`, while Playwright reported `Google Chrome for Testing 156.0.8078.4`.

Before editing the runner, I reproduced the old check under Node 22 with that exact string. The `/Chromium/i` condition exited 1 with `Chromium version output is invalid: Google Chrome for Testing 156.0.8078.4`. The existing shared `isChromiumVersionOutput` test passed 2/2: it accepts both Chromium and Google Chrome for Testing version strings, and rejects malformed, suffixed, unsafe, or unrelated browser outputs.

The publication runner now imports `isChromiumVersionOutput` from `compiled-children/browser-version.mjs` and validates the trimmed `--version` output. It adds the existing helper test to its focused Node test list and pins both the helper and its test in source snapshots. The workflow runs the typed-input/publication profile first, then retains the existing full PR16 inherited-chain step unchanged.

## Verification

The focused publication Node suite passed 18/18, including both browser-version tests. I then ran the full local publication profile once, with locked dependency and browser installation skipped and `/tmp/chromium` selected. Unique attempt `attempt-20261031T181141849Z-6` passed all eight stages: tool versions, focused Node/Go tests, native trace, React/DOM builds, native/direct/browser conformance, HTTP demo smoke, source boundary, and archive verification. Its report records 45 native Go updates, 3 seeded schedules (`20261031`, `20261032`, `20261033`), 20 HTTP smoke checks, and an independently verified 363-member archive. The profile used Node 22.23.4, Go 1.24.0, compiler Go 1.27.3, Chromium 153.0.8010.0, React 19.3.1, and Playwright 1.64.1.

The profile's before/after source pin set contains 130 files with zero differences. It records the helper hash as `624fc3369d9f6e47d7d84d23de41e0bdbe07d6ce925c878a8623d08765b4f6ee` and its test hash as `6c465496d274480ad79bf2fd74f4e6566095edc4022f83361b1d9c400a6586e6` before and after. The detailed attempt receipt, report, and archive remain in the publications worktree; their hashes and the exact source-copy verification are recorded in `rawlogs/E-PR17-BROWSER/source-copy-verification.json`.

The fixed `compiled-publications/run.mjs` and `.github/workflows/gobi-compiled-publications.yml` were copied byte-for-byte to the qualification worktree after the profile passed. Both worktrees now have identical hashes:

| File | SHA-256 |
|---|---|
| `compiled-publications/run.mjs` | `11ba693e89123da95717076842e033ce300ce06ba45ef341e39e76e4a8d04698` |
| `.github/workflows/gobi-compiled-publications.yml` | `c82001bd0fed6a3ede155e83e3308f36e5e2bebddcbef75efdad9e25f04aa493` |

The complete command/output for the red reproduction, shared helper suite, focused Node suite, and full local profile is retained in `rawlogs/E-PR17-BROWSER/`.

## Boundaries

The CI run/job and Chrome-for-Testing output above are the task-provided failure context; I did not fetch or rerun that hosted CI job. The local full run was the publication profile only; the inherited PR16 chain remains a separate workflow step and was not rerun locally. No GitHub Action, merge, deployment, or main-branch operation was performed. Only `compiled-publications/run.mjs` and `.github/workflows/gobi-compiled-publications.yml` were changed as source in each worktree; the profile wrote its normal generated attempt/build artifacts. The shared helper and its existing test were reused unchanged.
