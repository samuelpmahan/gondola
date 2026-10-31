# E-DEMO — compiled Go value methods

**Outcome: `mixed_change`.** The final methods-only validation passed, and the M0 gate passed. The local inherited full default runner did not complete, so this report makes no full local-run claim.

## M0 gate

- Status: passed; 5,000 seeded cases matched, the expected receipt matched, and `SHA256SUMS` verified.
- Command: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOFLAGS=-buildvcs=false bash run.sh` (exit 0).
- Versions: Go 1.24.0, Node v22.23.4; 27 source pins matched before and after.
- Full stdout SHA-256: `45b45b3efa356a009dbd2a99db347c39f01ccbedfa6c2e918250c3aee4d06dd1`; stderr SHA-256: `b22c6a315a68f08f52c5aafa7e6117827c6a17c61371555856ecacbcb5d6455d`.
- Evidence: `compiled-methods/evidence/demo/m0-gate/attempt-01/`.

## Local inherited full runner

- Status: incomplete; no full inherited pass is claimed.
- First attempt `attempt-20261031T033026986Z` was intentionally stopped after the owner observed source-pin drift in `compiled-methods/conformance/check.mjs`, `check.test.mjs`, and `compiled-methods/run.mjs`. It is preserved under `compiled-methods/evidence/demo/attempt-01-canceled/` with its initial pins, cancellation record, partial output, and the mutated inherited-receipt snapshot.
- Second attempt `attempt-20261031T035244499Z` began from a fresh source checkpoint, but its agent-owned process/session disappeared before a final receipt was written. The last observed phase was the inherited controlled-input runner; no exit code or successful completion is inferred. Its original running/aborted records and partial logs are preserved under `compiled-methods/evidence/demo/attempt-02-incomplete/`.

## Final methods-only execution

- Status: passed; mode: explicit `--methods-only`.
- Command: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOFLAGS=-buildvcs=false CHROMIUM_PATH=/tmp/chromium bash run-compiled-methods.sh --methods-only` (exit 0).
- Attempt: `compiled-methods/artifacts/attempts/attempt-20261031T042646625Z`; started `2026-10-31T04:26:46.626Z`, finished `2026-10-31T04:26:52.506Z`.
- Versions: Go 1.24.0 root, Go 1.27.3 compiler, Node v22.23.4, React/ReactDOM 19.3.1, Playwright 1.64.1, esbuild 0.28.2, Chromium 153.0.8010.0.
- All 16 runner commands passed. The two new method browser/conformance test files passed 10/10; Go fixture/native tests passed; the real React and DOM compiler builds matched their BuildResults.
- 137 source pins matched before/after. React and DOM each had 67 output files before/after, and each exact final output pin array matched its initial set. The GoScript module hashes are pinned independently; no cross-build raw-module equality is claimed.
- The native, direct GoScript, React-only, DOM-only, and alternating-swap matrix matched: 19 ticks, 18 fixture actions, 14 dispatched actions, 4 suppressed read-only child actions, 18 swaps, and 14 value-semantics checks. All four mutation controls were rejected.
- The real HTTP demo loaded `/`, `/demo.css`, and `/demo.bundle.mjs` with HTTP 200. It used the actual compiled GoScript method module, made 14 Go dispatches and 3 renderer swaps, completed on DOM with state `{parent: 0, child: 2, readOnly: false, savedChild: 1}`, and reported no browser errors or WebAssembly requests. The final screenshot SHA-256 is `ba3050e60b9e81e2c08b7f244bb6f337a9aa6e0278271ab315fa5437c355eb22`.
- Detailed durable packet: `compiled-methods/evidence/demo/attempt-05-methods-only-final/`. It contains the raw receipt, execution record, complete command logs, build requests/results/manifests, nine matrix outputs, HTTP smoke record, screenshot, and a compact archive of the executable payloads. The archive SHA-256 is `0d74acba45844f82ec475bae5e0cdf047d7ef0ab8d89ba1695e35161c0163228`.
- Earlier methods-only integration attempts are preserved as evidence of their specific issues: `attempt-03-methods-only-path-mismatch/` records the harness path mismatch; `attempt-04-methods-only-output-pin-review/` records the finalizer pin-count mismatch and is explicitly not treated as accepted. The final attempt above passed after the finalizer was corrected to hash each backend's `output/` subtree.

## Limits

This report records the passing M0 and methods-only results only. The explicit methods-only route skipped the inherited full regression runner. A separately completed inherited full CI run, if available, must be assessed from its own primary immutable receipts and is not inferred here. The demo uses the compiled GoScript module, existing runtime, React/DOM renderers, and Go methods; JavaScript forwards actions, and no JavaScript reducer or WASM runtime is used.
