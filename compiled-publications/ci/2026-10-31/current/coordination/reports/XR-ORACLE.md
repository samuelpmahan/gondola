# XR-ORACLE: independent review of the sealed publication oracle

**Decision: amend, portability gate only.** The sealed oracle’s literal state, view, DOM, event, and effect expectations agree with the contract and fresh Go output. The sealed test source hardcodes a workspace-specific Go binary path; the separate E-PORTABLE-ORACLE repair is still running, so this review does not close that gate.

## Reviewed evidence

I reviewed the sealed E-ORACLE source under `coordination/seals/E-ORACLE/source`, its sealed report and receipt, the frozen contract, and the current scenario. The original `oracle.mjs`, `oracle.test.mjs`, and `expectations.json` hashes match the E-ORACLE receipt’s source pins. The E-ORACLE receipt validator accepted the completed N5 packet; its eight recorded rawlogs, source pins, report, and sealed copies matched their hashes.

The oracle’s 46 state checkpoints are hand-entered Go values. Its projection functions build the expected Gobi view and normalized DOM from those frozen values; no application transition reducer is present. `deepFreeze` recursively freezes the scenario and expectations, and a nested mutation probe threw while leaving the literal value unchanged. Its fixed checks cover captured value 4 remaining unchanged after the counter reaches 7, same-step revision no-op, out-of-order delivery and accepted-ID watermarks, stale input/child/parent generations, queue retention and consumption, and the reverse child-then-parent cancellation sequence. The scenario’s five host-only rows remain mapped to the same state checkpoint and have no Go step.

## Independent verification

I ran the sealed six-test suite from a disposable module-layout mirror using Node 22.23.4. All 6 tests passed, including the fresh Go comparison and five negative mutation controls. I then generated a separate Go trace and passed it to the sealed `assertNativeLiteral`: **50 events, 45 Go steps, and 46 state projections** matched. The fresh trace is 1,148,369 bytes, SHA-256 `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d`, matching the E-ORACLE and E-GO traces. The Node runner emitted the experimental EnvHttpProxyAgent warning; its exit code was 0.

## Finding: portability gate

The sealed `oracle.test.mjs` sets `nativeGo` to the absolute path `/tmp/gondola-go/bin/go`. The sealed suite passes in this environment because that path exists, but the test cannot run on a machine that provides Go on `PATH` or at another configured location. The active E-PORTABLE-ORACLE job owns this test-only repair. At review time, the unsealed worktree test shows a resolver using `process.env.GOBI_GO_BIN ?? "go"` and a larger output buffer; that change is recorded as in-progress evidence only and is not part of the sealed E-ORACLE review. The E-PORTABLE-ORACLE receipt and its final test run remain required before this finding can close.

No other blocking semantic mismatch was found. This review does not claim React/DOM mounted parity, browser acceptance, full pipeline success, or hosted CI acceptance.
