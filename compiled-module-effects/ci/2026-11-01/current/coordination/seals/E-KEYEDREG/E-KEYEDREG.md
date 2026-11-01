# E-KEYEDREG inherited keyed aggregate

**Outcome:** `confirmed_reuse`  
**Status:** `passed`  
**Worker / job:** N4 / E-KEYEDREG

## Source and isolation

Ran the inherited `run-keyed-modules.sh` aggregate from the root-provisioned detached worktree at source commit `88e7937e66fd1c8f36e5b5dd3224209b07c6eb33` (tree `fb4a44ad63eea969f1ae655e2d58f531b56a94fe`). Git status was clean before and after. The runner pinned 161 source files; the before and after maps were identical, all matched the requested commit, and the raw pin-map SHA-256 was `f596281c58790439596611ab39b67297dcc2e8ec044b3b362f1b7b247d59e308`.

To avoid modifying shared dependencies, I copied the existing root, `interaction`, and `compiled-frontend` `node_modules` trees into the detached worktree. Their shared-tree inventories before and after the run are identical. The run wrote only its ignored evidence and output directories in that worktree; there are no source edits.

The existing `EXPECTED.json` and `SHA256SUMS` hashes match their preserved Milestone 0 values. This lane ran the keyed aggregate only; it did not rerun the already accepted Milestone 0 or counter interaction regressions.

## Command and environment

```sh
PATH=/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
GOBI_GO_BIN=/tmp/gondola-go/go/bin/go \
GOBI_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node \
GOBI_PYTHON_BIN=/tmp/rebalancer-env/bin/python \
GOTOOLCHAIN=go1.27.3 GIT_OPTIONAL_LOCKS=0 \
bash run-keyed-modules.sh \
  --source-commit 88e7937e66fd1c8f36e5b5dd3224209b07c6eb33 \
  --chromium /tmp/chromium-portable \
  --output-root /tmp/module-effects-keyed-regression-output/E-KEYEDREG
```

Go was `go1.24.0 linux/amd64`; the compiler toolchain was Go `1.27.3`; Node was `v22.23.4`; Python was `3.12.14`; Chromium was `153.0.8010.0`; Playwright was `1.64.1`. The run exited 0. Stderr contains only the Node experimental proxy-agent warning.

## Results

Four independent builds completed: React and DOM each built the keyed parent (71 outputs) and reused child (70 outputs). The build index matched both backend identities, and all 17 build identity mutation controls were rejected. Five focused Go packages passed; the focused Node suite passed 5/5 tests with no skips.

| Scenario | Seed | Events | Native snapshots | Direct React / DOM | Browser React / DOM / swap |
|---|---:|---:|---:|---:|---:|
| Literal | — | 18 | 19 | 18 / 18 | 18 / 18 / 18 |
| Seeded | 20261101 | 36 | 37 | 36 / 36 | 36 / 36 / 36 |
| Seeded | 20261102 | 36 | 37 | 36 / 36 | 36 / 36 / 36 |
| Seeded | 20261103 | 36 | 37 | 36 / 36 | 36 / 36 / 36 |
| **Total** |  | **126** | **130** | **8 captures** | **12 captures** |

All native checks and all direct/browser parity checks matched. Each browser capture reported zero page errors. The literal capture oracle rejected all 11 semantic mutations.

The built demo passed its six HTTP smoke steps: initial two-key mount, independent counter adds, step propagation, lock propagation and child guard, reorder preservation, and remove/remount generation fencing. HTTP returned 200; page errors and failed requests were zero; the renderer round trip preserved keyed state.

The archive contains 604 members and is 25,706,937 bytes. The independent Python consumer verified every archive member against the manifest. Archive SHA-256: `76185b06ae9b8932d95bbbba94db4f4204b1fb85b44caf306d6c561449fab0f4`; manifest SHA-256: `6f10da788de62fdc0e3b43025ace1ea2def63afa76598389b40a2491cadb6d93`. The archive remains at the path in the indexed rawlog reference so the full traces are preserved without a second archive copy.

## Evidence and limits

The exact runner receipt, source pins before and after, scenario inputs, conformance/oracle summaries, build index, archive manifest, dependency inventories, command, versions, and logs are indexed in `rawlogs/E-KEYEDREG/index.json`. Its SHA-256 is `8c3f32b76f4b4f038f1410c94659014ba7c3711cbc53db29a0b286b82788d9cd`. The source pin manifest is `rawlogs/E-KEYEDREG/source-pins-before.json`; it records the 161-file closure tested at commit 88. Binding that closure to any later final source is a separate step.

The browser harness uses programmatic `HTMLElement.click()` dispatch. This evidence covers the finite two-key keyed-module profile and does not extend the already documented profile limits.
