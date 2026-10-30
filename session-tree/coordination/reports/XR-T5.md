# XR-T5 — independent checker review

## Decision: amend

The frozen T5 files match the assigned hashes. Focused tests, the real-browser focus-loss control, and the fresh default replay all pass. I found one required assertion missing from the disposal oracle: it never observes or compares the actual cross-session order in which `transport.cancel()` is invoked. Two additional coverage gaps affect disabled-state expectations and stale callback delivery after a same-name session has been recreated. No source files were changed in this review.

## Findings

### Required amendment — assert actual cancel invocation order

`fixture.mjs` creates an independent `sequence` counter inside each `makeTransport()` and records its calls only in that transport's `events` array. `captureSession()` stores each local `transportLog`; there is no side-wide sequence for calls across sessions. In the dispose action, the fixture builds `context.events` from `result.expectedIDs` after `host.dispose()` returns, so that sequence is expected Go/tree order, not an observation of transport calls.

`check.mjs` verifies that `DisposeTree` bundles are returned in derived postorder with expected command IDs, and `validateSession()` checks each transport's local event sequence and basic start/cancel legality. Neither check verifies that actual host cancellation calls followed the returned bundle order, or the command order inside a bundle. `host.test.mjs` likewise asserts the expected cancel exists in each transport separately, without a shared invocation clock. Candidate/reference parity cannot detect a shared host ordering bug.

Add a side-wide monotonic invocation sequence to transport `cancel()` calls, capture the calls made during each `host.dispose()`, and compare their exact `(SessionID, requestID)` order to the Go postorder bundles and each bundle's `Commands`. Include a negative control that reorders invocation calls while retaining the same bundles and per-transport event contents; the checker must reject it. This requirement concerns synchronous host transport invocations, not asynchronous server arrival order.

### Additional coverage gap — disabled controls

`validateSession()` derives expected disabled values for row Save and Cancel buttons. It does not derive expected values for Add at the four-row cap, Reset with zero rows, or Up on the first row. Those controls are included in raw DOM capture, but currently receive only candidate/reference parity and consistency between actual DOM disabled paths and the renderer-reported disabled paths. The schedules do not attempt Add at capacity. Add explicit model-derived checks and a cap witness so a shared renderer/checker no-op cannot pass as correct disabled behavior.

### Additional coverage gap — stale callback after re-creation

The fixed disposal script delivers `stale-release("seed", 1)` immediately after disposing `orchard`, before recreating `orchard`. At that point `beforeActive` is empty, so the stale-release check proves the old callback is fenced while no new node is live, but it does not test a callback arriving after a same-name session tree is recreated. Add a witness that remounts the same symbolic session name(s) and then releases the old transport callback; assert the new tree, state, and audit remain unchanged. Ensure the old generation is selected explicitly (or has a request ID absent from the new transport) so lookup cannot select the new callback.

## Verification

The specified hashes match:

| File | SHA-256 |
| --- | --- |
| `check.mjs` | `d07f80f1632941493c728a45fabd6b79d25517400b5ec320a531bc314d226867` |
| `check.test.mjs` | `916e72b553aec5df1011641c093551d838eba1d28a8a339a140b8d088bfab0a7` |
| `fixture.mjs` | `ef442c9a8be15ec1d81476767fe0bc336c73a60cd7dc6b206d19f10f488884f1` |
| `fixture.html` | `556867d0f6b93aae63ab23e702f398e37a60a09b1a45b34c064276dc1086e885` |

Focused checker tests passed **8/8**:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:/tmp/gondola-go/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node --test session-tree/check.test.mjs
```

The unchanged real-browser focus-loss probe passed, injected one `blur()` after candidate replacement, and detected three fields: `parity.root.inputs`, `parity.root.focus`, and `replace.focus-selection`.

The fresh default replay report at `session-tree/build/replay-default.json` has SHA-256 `33a7dc92211bfd0fc551bd5f894b1a658d5ee59026a7bb70d7e1f070c404add8`. It reports `matched`: seeds `20261030,20261031`, 30 cases per seed, 40 maximum actions, 63 scripts, 1,587 actions, 1,650 ticks, 5,150 candidate and 5,150 reference session observations, 544/544 native comparisons, a detected negative control with one native comparison, zero mismatches, and 63/63 scenario shards with SHA-256 values. Toolchain: Node `v22.23.4`, Go `go1.24.0 linux/amd64`, Chromium `153.0.8010.0`, React/ReactDOM `19.3.1`; browser error list is empty. These results exercise the current oracle and do not close the cancel-order finding above.
