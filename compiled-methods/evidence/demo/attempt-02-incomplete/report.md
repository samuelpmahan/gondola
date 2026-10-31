# E-DEMO (compiled Go value methods) — incomplete attempt

**Outcome: insufficient_evidence.** This full-mode attempt lost its tool session during the inherited backend runner. It did not complete and is not a passing full regression.

- Attempt: `compiled-methods/artifacts/attempts/attempt-20261031T035244499Z`
- Invocation: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOFLAGS=-buildvcs=false CHROMIUM_PATH=/tmp/chromium bash run-compiled-methods.sh`
- Started: `2026-10-31T03:52:44.499Z`; last observed: `2026-10-31T04:22:13Z`
- Source pins: 137 before, 137 observed after; match: `true`
- Outer runner command records before session loss: `1` completed; inherited receipt records 7 syntax/version commands.
- Last known phase: inherited `run-controlled-input.sh`; build products were present, but no current-attempt completion report or process remained.
- No method-specific tests, builds, matrix, or HTTP demo smoke started.

## Source changes observed

- None; all 137 source pins match.

## Preserved partial evidence

Original running receipt and all source pins are retained with the partial tool output, inherited runner receipt/logs, and controlled-input build-product hashes under `compiled-methods/artifacts/attempts/attempt-20261031T035244499Z`. The exact process/session state is in `cancellation.json`. The inherited tracked receipt is left for the root Git owner to preserve and restore.
