# XR-E5 — independent review of the browser checker

**Reviewer:** W4 / `/root/key_go` (not an E5 author)  
**Review scope:** `check*`, `harness*`, `adversarial*`, E5 author report, tracker repair, composed trace, and pool-context evidence. No E5 source, shared trace, evidence asset, or Git state was changed. The diagnostic writes temporary failure fixtures only under `/tmp`.

## Verdict

The recorded E5 composed run is authentic and the native gate is required: 70 scenarios, 1,113 settled observations, 140/140 native comparisons matched, all ten fixed scenarios present, seven real-Go probes passing, three isolated participant contexts, and unique actor lanes at every tick. The Go/React backend also passed an independent live node-retention probe.

Two required browser-proof checks are not enforced by the E5 checker: its cross-actor comparator ignores the captured logical focus/selection, and its real-Go same-backend object-identity probe runs only the DOM backend. A third issue is reproducible: HTTP-lab readiness failures leak the child process because `runBrowser` awaits server startup before entering its cleanup `try/finally`.

## Findings

### F1 — P1: settled focus and selection are absent from parity comparison

`check.mjs` compares snapshot, HTTP, and DOM fields, but never compares `observation.focus` (`check.mjs:71–105`). The harness does capture the actual active input key and selection range in each observation, and the full trace contains **58 explicit focus ticks**. This data currently matches across the three actors, but it is not a failing condition.

I mutated `selectionStart` on an actual captured focus observation. `compareObservations(mutated, original)` returned `[]`; a control mutation to `dom.root` was detected as `dom.root`. This confirms a focus/selection regression can leave the reported 0-mismatch result green. Compare focus only for explicit focus/selection actions and relevant follow-on updates, so native pointer and disabled-button focus behavior stays outside the assertion.

### F2 — P1: same-backend DOM identity is proved only for the DOM renderer

The registered `same-backend-retained-key-reorder-and-async-focus` probe calls `setupProbeActor("dom")` and checks input identity after reorder and HTTP completion (`harness.mjs:485–515`). There is no corresponding same-backend React identity probe among the seven required names. The cross-backend probe does correctly verify that a DOM-to-React replacement changes the actual input object and restores the logical selection (`harness.mjs:518–530`).

I ran an independent real-Go/WASM probe with the Go host initially mounted on React. The same input object survived reorder and async completion; its selection stayed `[2,8]` with `forward` direction, and the save completed. This suggests the React implementation is sound, while the E5 report's per-backend proof is incomplete. Add a React-specific same-backend check or record the independent React probe as an explicit composed gate.

### F3 — P1: readiness failure leaks the HTTP-lab child and leaves the checker alive

`runBrowser` awaits `startLabServer()` before its `try/finally` (`check.mjs:301–302`). `startLabServer` rejects for malformed readiness output or timeout without killing the spawned child; it clears the 30-second timeout only on success (`check.mjs:263–281`). Thus the cleanup at `check.mjs:498–500` is unreachable on startup failure.

The diagnostic supplied an executable fake lab that emitted malformed readiness JSON and remained alive. The checker wrote its failure report, but after 750 ms it had not exited and the fake lab child was still alive (`cleanupGapReproduced: true`). The probe then killed both processes and removed its `/tmp` files. Make startup failure clear the timer and terminate/reap the child, including timeout, invalid JSON, invalid URL, and spawn errors.

## Verified checks

- The report's seven source hashes match the files on disk. The full trace is 136,837,378 bytes and reports no mismatch; the actual native comparison list has 140 matched entries.
- The hard fixed inventory contains ten scenarios, including capacity, reorder/focus/swap, pending edit/reorder/completion, removal/path reuse/detachment, reset, retry/cancel, HTTP error modes, two-row concurrent completion, old-path rejection, and focused-row deletion.
- In the four-row-cap scenario, all actors reach `Rows.length=4`, `NextID=4`; four Add messages are recorded, while the fifth Add is disabled and adds no message.
- All 1,113 observations have three distinct actor lanes. Actual E5 application traces reached at most three held requests per participant. The separately preserved pool probe reached four raw held POSTs in each of three BrowserContexts (12 total) while each browser context's control GET returned 200. This proves the HTTP/1 pool headroom, but the E5 collection app itself did not reach four held saves concurrently.
- The old-path/old-key real-Go probe compares the complete snapshot, audit, and outbox before and after rejection. The detached-input probe measures the Go dispatch-call delta as zero. Both passed.
- Native comparison is enforced by `requireNativeComparison`; empty and unavailable result sets are rejected, and the fixed/full run recorded 20/20 and 140/140 matches respectively.
- The prior `done` Promise versus boolean tracker bug is repaired: current `finish` guards on `doneState`, and `waitFor` awaits `record.done`. The focused tracker test and a fresh body-gated probe both stayed pending until body consumption and then resolved.
- Normal runner work is bounded by per-action/capture timeouts, a 15-second server-record poll, and a 180-second adversarial timeout. Browser contexts and the server are closed in the normal `runBrowser` `finally`; F3 is the startup-failure cleanup gap.

## Commands and results

From `/workspace/scratch/39a56936f173/gondola`:

```text
/tmp/gondola-node22/node_modules/node/bin/node --test keyed-editor/check.test.mjs keyed-editor/harness.test.mjs
PASS — 7 tests, 0 failures.
```

```text
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node keyed-editor/coordination/XR-E5-probe.mjs
PASS — trace, native-comparator inventory, tracker repair, React identity, and startup-cleanup diagnostics completed.
```

The diagnostic reported `focusComparatorMutation.detected=false`, `sameBackendReactProbePresent=false`, `reactIdentity.sameNodeAfterReorder=true`, `reactIdentity.sameNodeAfterCompletion=true`, and `startupCleanup.cleanupGapReproduced=true`. The existing Go `wasm_exec.js` emitted its `[UNDICI-EHPA] EnvHttpProxyAgent is experimental` warning; all checks passed.

## Repair handoff

Preserve the original E5 attempt records and initial findings. E5 should add the missing focus/selection comparison and React same-backend identity probe, then rerun the focused gates and refresh the author report/hashes. E5 should also make HTTP-lab startup failure clean up its child. The E5 full trace and the root's separate HTTP-pool receipts remain unchanged.
