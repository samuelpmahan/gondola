# CI-TRACE — workflow run 41140265213

**Outcome: insufficient evidence.** This receipt closes N2's review of the first CI attempt only. It does not establish the four-app/five-script trace gate; the separate repaired CI run remains the evidence source for that gate.

## Provenance and execution

The immutable workflow artifact is run `41140265213`, artifact `13019432197`, for head `408e330517b1dd5e5f865e2ff1914465f98bcf66`. Its ZIP SHA-256 is `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`. The extracted manifest binds that archive to 19 compiler artifact files; N2 verified the archive hash, file set, file sizes, and hashes. The detailed per-file record is in [partial-failure-41140265213.json](../../audits/CI-TRACE/partial-failure-41140265213.json).

`execution.json` records Go 1.27.3, root Go 1.24.13, Node v22.23.4, React/React DOM 19.3.1, esbuild 0.28.2, and Playwright 1.64.1. Root Go test/race/vet and nested compiler Go test/race/vet commands exited 0. The Node test command ran 81 tests: 79 passed and two failed. Both failures are in `conformance/no-wasm.test.mjs`; Playwright attempted to launch `/tmp/chromium`, which does not exist in this managed CI environment.

## Trace gate result

The failed Node test command stopped the runner before `compile-four`. The package contains no build result, compiled output inventory, native trace, direct-JavaScript trace, browser trace, or conformance report. Therefore this run provides zero trace ticks and no evidence to compare typed state, view trees, bindings, action intent, delivered messages, dispatch IDs, effects, nil versus empty slices, negative zero, or Number/BigInt values across the four apps and five scripts.

The runner recorded 116 `sourceBefore` pins. It did not reach the end-of-run source fence, so `sourceAfter` and source stability are unknown. No local run or partial helper output was substituted for the missing CI traces.

## Next evidence packet

This report covers only the failed first attempt. CI-TRACE remains insufficient for trace conformance until the separately repaired workflow run supplies its completed execution receipt and trace artifacts. The partial artifact and its hashes are preserved in the N2 audit file linked above.

Receipt attribution: the original copy remains at `receipts/CI-TRACE.json`; the canonical coordination receipt is `coordination/receipts/CI-TRACE.json`.
