# E-SOURCE-CLOSURE — read-only source boundary audit

**Worker:** N1  
**Outcome:** `confirmed_reuse`  
**Scope:** Prepublication source/path audit only. No production files, Git state, scheduler state, browser run, or full qualification pipeline were changed or executed.

## Findings

The final audit snapshot enumerates **175 current outer-runner source paths**. All **87 N2 fresh-build source pins** from `rawlogs/E-BUILD-BASE/build-a/build-inputs.json` are members of that set; there are no missing N2 paths. The eight explicitly pinned `compiled-frontend/frontend/react/review-evidence/` files total 17,338 bytes. The runner excludes that directory during tree walking and names each file in its explicit `sourceFiles` list.

The required JavaScript runtime/test import closure contains 36 internal modules and has no unresolved or unpinned local imports. The imported Playwright, React, and React DOM packages come from the locked dependency installs; the source boundary pins the root, interaction, and compiled-frontend package manifests and lockfiles. Both `compiled-children/runtime/runtime.mjs` and its test are now in the outer boundary.

The workflow path filters now cover the active runtime/test sources, including the children runtime, frontend conformance and shared renderer, publications conformance, native publications CLI, and `interaction/package.json`. The workflow's source identity wiring is consistent: the same manual/PR/default SHA expression supplies `SOURCE_COMMIT` and checkout `ref`, checkout `HEAD` is compared to that value, and the shell runner receives it as `--source-commit`. The runner validates the 40-character argument and compares it to `git rev-parse HEAD`.

The runner creates fresh unique attempt directories for builds, captures, certificates, and demo outputs. The browser bundle and archive-consumer extraction use fresh temporary directories and are removed afterward. The `/tmp` fallbacks select Go, Node, and Chromium executables; I found no read of author-run reports, generated build outputs, or prior attempt data. These conclusions are static code-path inspection, not evidence from a full execution.

The final path manifest is `rawlogs/E-SOURCE-CLOSURE/source-closure-manifest.json` (175 paths, SHA-256 `8eb340a6cab2542c10137821a89786b9c9382580094bb877850d91243131d12f`). It records the complete path list, byte counts, audit-snapshot SHA-256 values, N2 path coverage, workflow path check, and JavaScript import closure. N2's `backendqualification/certify.go` and `qualification_test.go` hashes were not asserted as final because that authorized repair was still in progress; the path closure remains applicable and the final candidate runner must supply the ultimate byte pins.

## Root stage gate

Before freezing the candidate tree, compare every path in the 175-entry manifest with the final N6 `sourceBefore`/`sourceAfter` snapshots and committed blobs. Preserve all listed source paths; do not prune pinned historical review evidence or inputs. Explicitly include the two N2 source files called out for force-add during root staging:

- `backend-qualification/build/build.mjs`
- `backend-qualification/build/base-ref.test.mjs`

Also verify that the eight review-evidence files, the two `compiled-children/runtime/` files, and `.github/workflows/gobi-backend-qualification.yml` are in the candidate tree. The workflow must retain the runtime/test path filters confirmed in this audit. No Git staging command was run in this read-only lane.

## Evidence and limits

The audit was run with `python3 backend-qualification/coordination/rawlogs/E-SOURCE-CLOSURE/audit.py`; it exited 0. Its source path manifest reports 175 outer paths, 87/87 N2 build pins covered, eight review-evidence files, zero unpinned local JavaScript imports, and zero active runtime/test paths missing from workflow triggers. A second read-only pass rehashed all 175 paths with zero missing or changed files. The pinned native receipt validator also accepted this packet read-only; no `finish` or state write was invoked. The runner SHA-256 at audit time is `a2e4b6019b0aea2c21eeed001f41da58b4c8504b40bd37fd3dc2cba9f3d6b44c`; workflow SHA-256 is `18372f9d9f6f13d859c6bb8b9a3f016a454e9dcacc7e57e6455bcc7465189302`.

This audit verifies closure and static source-identity wiring. It does not claim a committed candidate SHA, a workflow dispatch, or end-to-end execution success.
