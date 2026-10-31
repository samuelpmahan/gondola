# E-RESTORE — run the already-built demo from the accepted repair archive

**Outcome: confirmed reuse for archive restoration and local smoke execution.** This verifies that the retained demo site can be restored and exercised. It is not a new build or a hosted CI result.

## Archive verification and safe restore

I concatenated the four retained chunks in order and verified each chunk against `compiled-lifecycle/ci/2026-10-31/local/accepted-repair/retention.json`. The resulting tar.gz is 14,757,771 bytes with SHA-256 `f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf`; its digest, byte count, and manifest digest match the R-FINAL execution receipt. All 719 manifest members and 168,200,217 uncompressed bytes match. No traversal paths, duplicate members, links, special files, or member hash/size errors were found.

| Chunk | Bytes | SHA-256 |
|---|---:|---|
| `artifacts.tar.gz.part-000` | 4,194,304 | `7ff19f81a264e33947379c073f5a4df6d14cb196942340a25062b39d2b0f6a33` |
| `artifacts.tar.gz.part-001` | 4,194,304 | `f0e00755644520e59c7efa25375f5ab922c6f6a9664598cdcad2b7619b2ae49f` |
| `artifacts.tar.gz.part-002` | 4,194,304 | `9e4e0453656793637995a3966122e1224248f3bf0321e374a7ec2c97d88a682b` |
| `artifacts.tar.gz.part-003` | 2,174,859 | `26ba7f946f1b6ea7d54d5759cbe3862189b5972cbf601bb69820020a4964032c` |

The archive was extracted with path and file-type checks into fresh `/tmp/gobi-lifecycle-restore-dlhtki0q`; the served site was `/tmp/gobi-lifecycle-restore-dlhtki0q/demo/site`. The five static site assets were SHA-256 pinned before and after the browser smoke and remained byte-identical.

## R-FINAL and fixture identity

The reviewed R-FINAL receipt is `compiled-lifecycle/ci/2026-10-31/lanes/repair-native-path/green/final-run-receipt.json`, SHA-256 `a6c99407c97e2d6634de14a0a431293309e40d5fcf691a14b6bacaf16791d810`. The restored `demo-build.json` reports component/package ID `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle` and matches the receipt's React AppIR (`341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d`), compiled module (`e1d1027537b072e45de4ec9257839b7c3b2f02fba74095d89ddebcf5a6ed1594`), and encoder (`521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`). The archived DOM AppIR has the same hash; its separate raw compiled module is `8998269acf6115a24dfac8f6714bf537de80924c8be6a5b972cc725e73c7fc7e`.

The existing smoke source hash matches R-FINAL: `compiled-lifecycle/demo/smoke.mjs`, SHA-256 `c64c868341fd8a2e4de18b30403babc246397a08d1cb6f34c1a4f3db5daf5b21`. The frozen headless scenario also matches: `fixtures/compiled/lifecycle/scenario.json`, SHA-256 `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650`. Its 26 events and 13 expected states end in the same Parent/Child/Grandchild/Sibling state recorded by R-FINAL and by this restored-site run.

## Local smoke result

I ran the existing `smoke.mjs` from the locked source worktree against the restored site using Node `v22.23.4` and local `/tmp/chromium` (`Chromium 153.0.8010.0`). It passed all 12 checks with 24 Go trace ticks and four renderer swaps. The page, CSS, and bundle each returned HTTP 200. Browser errors, console errors, failed requests, WASM requests, and WASM API attempts were all zero.

The effect trace recorded seven requests. Removing Parent cancelled Grandchild, Child, then Parent; the independent Sibling remained live. All three retired generation-1 callbacks were rejected, and all three direct stale Go completions left state unchanged. Sibling and all three generation-2 replies completed; the terminal queue was empty. The terminal Go state, View, and ordered effect records match R-FINAL, and the terminal state also matches the headless fixture.

The screenshot is 1440 × 1622 and 333,057 bytes, SHA-256 `6f366f62a04be4223324602333013b5bfc5c69aaf2c9eeb2edd61e44b8bd8053`. It is byte-identical to the screenshot hash in R-FINAL and was visually inspected. Node wrote a nonfatal experimental `EnvHttpProxyAgent` warning to stderr; the smoke's browser and request error arrays remain empty.

## Reproduction and limits

The exact restore, smoke, and comparison commands are retained in `compiled-lifecycle/ci/2026-10-31/lanes/restore/commands.txt`. The restore verifier is `lanes/restore/restore_archive.py`; the post-smoke comparison is `lanes/restore/post_smoke_audit.py`. Structured results, paths, versions, and output digests are in `lanes/restore/run-metadata.json`.

No Go compilation, npm install/ci, or rebuild was run. This proves restoration and execution of the already-built archive on local Chromium 153 only; it makes no hosted-browser or hosted-CI claim.
