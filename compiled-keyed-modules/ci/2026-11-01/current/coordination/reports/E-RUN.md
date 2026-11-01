# E-RUN acceptance report — N6

**Outcome:** `mixed_change`  
**Status:** `passed` — clean-source profile and requested regressions  
**Worker / job:** N6 / E-RUN

## Source identity and stability

Ran against published source commit `f4c8f70199a8ca896c13e225a85901abe658d0de`, tree `9539b600d72927641217b77a20a38955350eec49`. The worktree was clean before the profile and after all three commands. The keyed runner pinned 157 source files, including Go and Node test sources. Its before/after source-pin maps were identical (SHA-256 `0ad1fc4af4bc7fba1fcea09b6e89a081e53775b035b9e874adccf6fa8ee7d912`); all pins matched the commit, with zero mismatches.

## Keyed profile

Command:

```sh
PATH=/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
GOBI_PYTHON_BIN=/tmp/rebalancer-env/bin/python \
CHROMIUM_PATH=/tmp/chromium-portable \
bash run-keyed-modules.sh \
  --source-commit f4c8f70199a8ca896c13e225a85901abe658d0de
```

The runner completed four independent builds: React and DOM parent outputs (71 files each) and child outputs (70 files each). Both compiled parent/child pairs were admitted. Build-index SHA-256: `52941cb76f2408c2d9b3614e92ebd6e334235409ead6abd943d6c72b76ef125c`. The build identity oracle matched both pairs and rejected all 17 build/helper mutation controls.

Five focused Go packages passed with `-count=1`. The runtime, module-loader, and oracle Node suites passed 5/5 tests with 0 skips. Native, direct, browser, and renderer-swap checks matched for four scenarios:

| Scenario | Events | Native checkpoints including initial |
|---|---:|---:|
| Literal | 18 | 19 |
| Seed 20261101 | 36 | 37 |
| Seed 20261102 | 36 | 37 |
| Seed 20261103 | 36 | 37 |
| **Total** | **126** | **130** |

The profile ran 8 direct backend captures and 12 mounted browser captures. Each of the four swap captures checked 8 identity checkpoints. The capture oracle rejected all 11 mutation controls. The earlier E-DELIVERY manual report's 148-checkpoint statement was a reporting error: [the correction record](../corrections/E-DELIVERY-snapshot-count.json) derives 130 from the four native files and confirms no execution mismatch (SHA-256 `c982d4b6b46f6646bfc3020dd0e2ae318774e66abb83f9ff15881e7a9af1d3a2`). This E-RUN count is derived from its own fresh native captures.

The built demo was served over HTTP in Chromium and passed all six mounted interaction steps: initial `a`/`b` mount, independent adds, step propagation, lock enforcement, reorder preservation, and remove/remount generation fencing. The DOM→React→DOM round trip retained keyed membership and generation; page errors and failed requests were both zero. Browser interaction uses programmatic `HTMLElement.click()` DOM dispatch, not trusted pointer or OS input.

The 600-member attempt archive is 25,697,770 bytes, SHA-256 `1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7`. The independent Python consumer verified all member hashes. Its manifest SHA-256 is `0f8f5b15c36442d54412ad6480f4dbbb475b4cabec45ef800a01498a312f064b`.

## Existing regressions

Command:

```sh
PATH=/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH bash run.sh
```

It exited 0 and reported “same over 5000 inputs” for seed `20261030`, “receipt matches,” and “SHA256SUMS ok.” `EXPECTED.json` and `SHA256SUMS` retain the same hashes as the baseline.

Command:

```sh
PATH=/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium-portable bash run-interaction.sh
```

It exited 0. All 8 Node tests passed with 0 failures or skips. Native/browser parity matched 107 scripts over 4,473 initial/action ticks with seed `20261030`; the native comparator matched.

The emitted full interaction trace is 49,491,627 bytes with SHA-256 `bc647b4a36311d2d19e32afa9686df74bfed46bc408a4d17c108c7c74a0bd934`, matching the preserved baseline trace. Its gzip copy is SHA-256 `4f5c49b7a22f83fce0765120490c0ffa1487718f970b5e96d500c5a5c0a5a2e2` in `rawlogs/E-RUN/`.

## Tool versions and evidence

Go `go1.24.0 linux/amd64`; compiler Go `go1.27.3`; Node `v22.23.4`; npm `11.9.0`; Python `3.12.14`; Chromium `153.0.8010.0`; Playwright `1.64.1`; esbuild `0.28.2`; GNU tar `1.35`.

The complete keyed archive, manifest, exact attempt receipt, command logs, source pins before/after, native captures, harness/oracle summaries, build index, and demo smoke capture are preserved under `rawlogs/E-RUN/`. `SHA256SUMS` covers the copied evidence. No source files or original Milestone 0 receipts were changed.

## Limits

This evidence covers a finite synchronous two-key profile. It makes no asynchronous-effect claim and does not establish trusted pointer input, unbounded membership, arbitrary module graphs, hostile-code containment, or a generic third-renderer admission claim.
