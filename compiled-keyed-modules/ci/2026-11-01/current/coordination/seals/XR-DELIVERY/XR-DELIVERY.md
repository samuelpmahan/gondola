# XR-DELIVERY — independent N5 review of E-DELIVERY

**Decision: accepted, with the separately recorded snapshot-count correction.** The sealed author packet is intact; I did not edit production files or the author report/receipt. This review accepts the author-only diagnostic and archive evidence only. It does not claim clean-source acceptance; root E-RUN remains the clean-source gate.

## Seal and source review

I verified the seal hashes for the author report (`3d53de84…73bef45`) and receipt (`4faae373…a6f1b2`). All nine N6-owned files in the sealed source inventory match their byte counts and SHA-256 values, and those same pins match the retry archive.

I restored the 25,695,136-byte archive using its manifest file paths into `/tmp/xr-delivery-restored-e-delivery`. The archive SHA-256 is `391663321730428cce58dffd415d06947389930413a5ab61d9e42b1723e5f771`. The restore verified the exact 600-member inventory, rejected non-regular or unsafe paths, and checked every member’s size and digest. It also verified every one of the 157 source pins against the archived `source/` tree.

I independently reconstructed the source closure from the sealed runner’s directory/file lists. It matches the manifest exactly: 157 of 157 source paths, including 45 Go/Node test sources. The source pin maps before and after the successful retry are byte-for-byte identical. This establishes source stability during the author retry, even though the tree was dirty and the pins did not match Git HEAD.

## Independently rerun checks

Using the restored source and compiled outputs, I reran the five Go packages and focused Node tests. Go passed in all five packages; Node passed 5/5 tests with 0 failures and 0 skips. I also replayed the archived native, direct and browser captures through the archived oracle and build index: all four scenarios matched, 8 direct profiles matched, 12 browser profiles matched, and all 17 build plus 11 capture mutations were detected.

The native checkpoint count in the sealed E-DELIVERY report/receipt is incorrect: it says 148. The pinned captures and oracle summary show 19 checkpoints for the 18-event literal scenario and 37 each for the three 36-event seeded scenarios, for **130 total checkpoints** and 126 unique input events. Root’s additive correction `corrections/E-DELIVERY-snapshot-count.json` is tied to the original sealed receipt hash (`4faae373…a6f1b2`), carries the four actual native capture hashes, and has SHA-256 `c982d4b6b46f6646bfc3020dd0e2ae318774e66abb83f9ff15881e7a9af1d3a2`. I verified those hashes against the restored archive. The author’s 148 claim remains preserved; use 130 in any guide or PR summary.

## Builds and mounted demo

The archived build integrity record contains exactly four fresh independent builds: React parent/child (71/70 outputs) and DOM parent/child (71/70 outputs). The demo bundle and site are part of the verified archive. I served the restored site over local HTTP and loaded it in Chromium. The DOM began ready with `a:g1` and `b:g1`; independent counts, step propagation, lock guard, reorder preservation, removal/remount to `a:g2`, and rejection of the retired publication all behaved as expected. A DOM→React→DOM round trip also preserved the keyed membership. The independent browser run returned HTTP 200 with no page errors or failed requests.

## Runner and CI checks

- The wrapper passed `--help` using PATH discovery with no `GOBI_*_BIN` overrides, and passed with explicit absolute Go, Node and Python overrides.
- Invalid Go and Python paths exited 127; an invalid Node executable exited 1; an invalid Chromium path in a temporary restored source copy exited 1 at `toolchain-and-source-snapshot`, before builds started.
- The preserved first N6 run demonstrates the source-change guard rejecting a changed source set at `final-source-pin-comparison`. That attempt failed because N5 was still changing `oracle.mjs` and `oracle.test.mjs` after an informal freeze notice. I acknowledge that notice was superseded. The first attempt is not accepted; it remains preserved. N6’s separate retry then held all 157 pins stable through archive creation and consumption.
- `actionlint` v1.7.12 passed on `.github/workflows/gobi-keyed-modules.yml` with Go 1.27.3. Its first invocation under Go 1.24 exited because actionlint requires Go 1.25 or newer; the tool was rerun with the repository’s compiler toolchain. The workflow pins Go 1.24 and Node 22, installs locked dependencies and Chromium, runs the keyed profile, and preserves artifacts; a separate job runs Milestone 0 and counter regressions.

## Limits and evidence

This is a dirty-tree author diagnostic, not a clean Git checkout result. Root E-RUN must supply clean-source acceptance. Browser evidence is programmatic `HTMLElement.click()` dispatch, not trusted pointer/OS input. The profile is bounded to two keys and synchronous transitions; no asynchronous-effects claim is made.

Exact commands, tool versions, failures, source/archive pins and rerun outputs are recorded in `rawlogs/XR-DELIVERY/commands.json`, `attempts.json`, `restore-summary.json`, `independent-review.json`, `restored-replay.json`, `demo-restore-smoke.json`, and the associated command logs.
