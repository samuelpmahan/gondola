# E-REG — isolated M0 and counter regression rerun

**Worker:** N3  
**Outcome:** `verified_inputs_copy_precommit`  
**Score:** 100/100; broken items: 0  
**Execution copy:** `/tmp/module-effects-regression-source`  
**Worktree HEAD at copy time:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Source copy and pin stability

The isolated copy contains 295 pinned inputs (7,046,852 bytes), including all 190 Go source files present in the current sparse worktree, the current module ABI and effect fixture Go changes, Go module files, all original M0 signed sources and receipts, and the counter interaction source, tests, and package locks. It excludes Git metadata, generated output trees, `node_modules`, CI, and unrelated new-profile JavaScript. Dependencies were installed only in the copy.

The input map matches the source worktree and the isolated copy both before and after the runs. `EXPECTED.json` remains SHA-256 `639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2`; `SHA256SUMS` remains `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`, matching the prior E-RUN baseline. The runner regenerated `react-map.gen.mjs`; its output hash matches the original signed checksum.

The checkout’s sparse patterns omit 31 tracked Go paths under coordination, evidence, and CI directories. Those files were not present in the worktree or copied. The source manifest lists those paths and the sparse patterns explicitly.

## Milestone Zero

`bash run.sh` exited 0 in the isolated copy. `go vet ./...` and `go test ./...` completed successfully, the seeded comparison reported **same over 5,000 inputs** with seed `20261030`, the receipt matched `EXPECTED.json`, and `SHA256SUMS ok` was reported. The regenerated cases and verdict hashes match the original receipt: cases SHA-256 `36be8659504a42e3d50c224323d9117a1cb9fa858e4d02bc2a03b0077ab42260` and verdict SHA-256 `180297809767b3d65c35b64abeb23ad53775d961128d9a235cb273bbc955ec23`.

The M0 Go table has 59 rows. The successful `go test ./...` run executed the `gobi` package uncached (0.085s), with root `npm ci` installing React 19.3.1 so `TestRulesAgainstReact` exercised all rows. Many other Go package results were cached because the preserved first copy attempt had already run them; the successful run’s log makes those cache hits visible. No extra uncached run was needed for the 59-row compatibility check.

The full cases, React responses, verdict, and generated map are preserved under `rawlogs/E-REG/m0-build/` with their hashes in `m0-summary.json`.

## Counter interaction regression

After `npm ci --prefix interaction`, `bash run-interaction.sh` exited 0 with the portable Chromium executable. All **8/8 Node tests passed**, with zero skips. Chromium `153.0.8010.0` matched **107 scripts over 4,473 initial/action ticks** at seed `20261030`; all 107 native comparator scenarios matched and there were zero mismatches.

The complete 49,491,413-byte browser trace is preserved as `rawlogs/E-REG/counter-interaction-traces-seed-20261030.json.gz` (uncompressed SHA-256 `f02dee21c19f1ce6f087df9214279d55e231c21824d49a630d22e7bce386fd60`). All 107 native comparator input files are retained in the adjacent tarball. The prior E-RUN trace differs in its raw JSON only at the 107 absolute `inputPath` fields, which correctly point into the isolated copy; after normalizing those fields to basenames, the full trace matches the prior baseline. No scenario, tick, DOM, state, or comparator result differed.

## Preserved copy-gap attempt and final binding

The first M0 attempt is preserved under `rawlogs/E-REG/attempt-01-copy-gap/`. It exposed missing test fixtures in the initial 284-file copy. I added the exact 11 fixture files named by the failing tests, expanded the closure to 295 files, and reran both regressions successfully. The first failure was a copy-closure omission, not a product test failure.

This is precommit input-copy evidence: the current feature changes are not yet bound to a final Git source commit. Root must bind these input pins to the final commit before making a qualification claim; if any pinned input changes, rerun the affected regression. No feature-worktree files, Git refs/index, or scheduler state were changed by this worker.

Commands, outputs, versions, full input pins, baseline hashes, and trace checks are indexed in `rawlogs/E-REG/index.json` (SHA-256 `4ac9258f883f14d20ea68dcc882c1c93098f17c1744622ef490e8096c34773f0`; 29 files).
