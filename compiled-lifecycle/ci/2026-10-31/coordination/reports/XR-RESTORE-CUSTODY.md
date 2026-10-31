# XR-RESTORE-CUSTODY: independent replacement restore review

**Decision: accepted. Outcome: confirmed_reuse.** I independently reassembled the accepted repair archive from its four retained chunks, verified every manifest member, restored it to a new `/tmp` tree, and ran the existing lifecycle demo smoke from source commit `00da54ad0f5a4006b13a5cded18ce291845978bc`. The archive, build identity, full terminal state/view/effect trace, HTTP results, and asset stability matched the pinned final run.

This is a replacement review of N2's E-RESTORE author packet. It supersedes the invalidated XR-RESTORE review for acceptance. The old XR-RESTORE acceptance is excluded. This review does not recover or reconstruct any unavailable historical bytes, and it does not claim hosted CI or hosted-browser verification.

## Custody catalog review

The E-RESTORE report and receipt remain byte-identical to their author pins: report SHA-256 `e8e81c1db9e3f949ab1ee8788299ed90e060c81518497c471877b30d4f0d1100`, receipt SHA-256 `9dcc5282ccc30d4ab8fba0ff4ec52ab01567bc60a2a870dc2dcad27308abd24f`. The catalog and every item it identifies as a retained quarantined capture were independently hashed. Twelve retained capture entries and eight surviving pinned references matched.

Four pre-rerun byte sequences remain unavailable: `review_restore.py` (8,834 bytes), `restore-audit.json` (3,929 bytes), `smoke.json` (853,539 bytes), and `smoke.stdout.log` (1,731 bytes). Their current paths hold the newer quarantined capture, whose hashes match the catalog and differ from the old pins. The catalog's exact frozen XR-RESTORE report and receipt bytes also match their quarantine pins, but the old receipt's review evidence chain is incomplete. Nothing here attempts to restore those bytes from the newer capture.

The frozen `smoke-audit.json` and `verify_smoke.py` remain byte-pinned, but that audit embeds the hash of the unavailable pre-rerun `restore-audit.json`; it cannot close that historical chain on its own. The new archive extraction and smoke comparison below are independent replacement evidence.

## Archive reassembly and identity

The four `local/accepted-repair` chunks matched their recorded lengths and SHA-256 digests. Reassembly produced a 14,757,771-byte archive with SHA-256 `f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf`; the manifest SHA-256 is `27e0ade2164813d3fba831cc44f19b9f9bf56ef862ee68d8f6942dd0e7064c46`. All 719 regular members and 168,200,217 uncompressed bytes matched their manifest entries. There were no duplicate, missing, unexpected, unsafe, link, or special-file entries. The archive was extracted into fresh `/tmp/gobi-lifecycle-xr-restore-custody-2xb26kel`.

The restored site identity matches R-FINAL: component ID `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`; React and DOM AppIR SHA-256 `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d`; React module SHA-256 `e1d1027537b072e45de4ec9257839b7c3b2f02fba74095d89ddebcf5a6ed1594`; DOM module SHA-256 `8998269acf6115a24dfac8f6714bf537de80924c8be6a5b972cc725e73c7fc7e`; React encoder SHA-256 `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`. The five static site files were byte-pinned before and after smoke and remained unchanged.

## Restored-site smoke

The existing `compiled-lifecycle/demo/smoke.mjs` from the separate source worktree at commit `00da54ad0f5a4006b13a5cded18ce291845978bc` ran under Node `v22.23.4` against local Chromium `153.0.8010.0`. It passed all 12 checks in 24 ticks with four renderer swaps. `/`, `/demo.css`, and `/demo.bundle.mjs` each returned HTTP 200. Browser errors, console errors, failed requests, WASM requests, and pending effects at completion were all zero.

The full terminal `finalState`, `finalView`, `finalDOM`, `finalTrace`, and 19 ordered effect records exactly matched the R-FINAL receipt. Parent removal cancelled Grandchild, Child, then Parent; Sibling remained live. Three retired callbacks were rejected, and three stale Go completions left state unchanged. The final remounted Parent/Child/Grandchild generation and Sibling replies match the frozen fixture. The resulting screenshot is 333,057 bytes with SHA-256 `6f366f62a04be4223324602333013b5bfc5c69aaf2c9eeb2edd61e44b8bd8053`, matching R-FINAL.

The smoke's only stderr output was Node's nonfatal experimental `EnvHttpProxyAgent` warning. No Go compilation, npm install, dependency installation, or product rebuild ran. This is local restoration evidence only; hosted CI remains a separate gate.

## Evidence

`compiled-lifecycle/ci/2026-10-31/coordination/receipts/XR-RESTORE-CUSTODY.json` binds the scripts, commands, versions, logs, member-level restore record, complete smoke JSON, screenshot, post-smoke audit, source/build pins, custody catalog, and reassembled `/tmp` archive by size and SHA-256.
