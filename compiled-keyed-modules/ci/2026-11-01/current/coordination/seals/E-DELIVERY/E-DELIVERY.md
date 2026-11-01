# E-DELIVERY author report — N6

**Outcome:** `mixed_change`  
**Diagnostic status:** `author-only`, complete against stable in-run source pins  
**Worker / job:** N6 / E-DELIVERY

## Delivered

- Added a browser demo that independently builds the keyed parent and existing counter child for DOM and React. It mounts keys `a` and `b` and exposes child counter controls, parent membership/order controls, snapshots, trace, and renderer switching.
- Added an environment-driven wrapper and reproducible runner. It pins source files including test files, captures tool versions and command logs, independently builds four parent/child artifacts, runs focused Go and Node tests, captures native/direct/browser results, invokes build and capture oracles, runs the demo in Chromium, and creates an archive with an independent Python consumer check.
- Added CI for this keyed profile and separate jobs for the existing Milestone 0 and counter interaction regressions. Documentation records the finite profile and evidence limits.

## Author diagnostic

Command:

```sh
GOBI_GO_BIN=/tmp/gondola-go/go/bin/go \
GOBI_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node \
GOBI_PYTHON_BIN=/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
CHROMIUM_PATH=/tmp/chromium-portable \
./run-keyed-modules.sh \
  --source-commit 4395d41ade7e4196878b6885d4c46dd4d8ec85f1 \
  --allow-dirty
```

Tool versions: Go `go1.24.0 linux/amd64`, compiler Go `go1.27.3 linux/amd64`, Node `v22.23.4`, Python `3.12.14`, Chromium `153.0.8010.0`, Playwright `1.64.1`, GNU tar `1.35`.

The completed attempt is `attempt-20261101T003328102Z-2-d74bc355`. It ran four fresh builds; five Go packages with `-count=1`; five focused Node tests with zero skips; four scenarios (literal 18 events, seeds 20261101/2/3 with 36 events each); 8 direct profiles; 12 browser profiles; and 148 native-aligned snapshots. All 17 build/helper mutation controls and all 11 capture mutation controls were detected.

The actual HTTP-served demo passed six interaction steps: initial two-key mount, independent counters, step propagation, lock propagation and child guard, reorder preservation, and remove/remount generation fencing. The DOM→React→DOM round trip preserved the keyed membership and generation.

The runner exited 0, created a 600-member archive (25,695,136 bytes; SHA-256 `391663321730428cce58dffd415d06947389930413a5ab61d9e42b1723e5f771`), and the independent Python consumer verified all member hashes. Its receipt is marked `author-only` because this was a dirty-tree diagnostic: source pins were stable during the run, but the source set was not the clean `HEAD` tree. Root owns the integrated clean-source run and acceptance.

## Preserved initial source-stability failure

The first diagnostic exited 1 at the final source-stability gate while the unsealed Oracle files were still changing. Its full attempt, failure receipt, and before/after pins remain preserved in `rawlogs/E-DELIVERY/`. The exact original report and receipt are preserved under `rawlogs/E-DELIVERY/preliminary-source-guard-packet/`; this successful retry is a separate attempt and does not overwrite that evidence.

## Scope

Browser interactions use programmatic `HTMLElement.click()` DOM dispatch; no trusted pointer or OS-level input is claimed. The profile covers two keys and synchronous transitions. It makes no asynchronous-effect claim and does not establish a generic third-backend admission claim.
