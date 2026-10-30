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

## Independent repair recheck — 2026-10-30

The three findings above are historical initial-review findings. E5 repaired them while preserving the initial failure evidence and source freeze. I independently reran the focused gates and rechecked the repair behavior; all three findings are resolved for the fixed receipt:

- **F1 resolved:** the checker now compares focus and selection after an explicit focus action and on follow-up ticks. The diagnostic mutated `selectionStart`; `compareObservations(..., { compareFocus: true })` emitted a `focus` mismatch, while the pre-focus comparison deliberately ignored it. All five explicit-focus observations in the fixed replay agreed across actors.
- **F2 resolved:** the fixed receipt includes distinct same-backend DOM and React retained-node probes. Both passed through reorder and async completion. The React input remained the same actual node and retained selection `[2,8]` with `forward` direction; the DOM-to-React backend swap replaced the actual node and restored logical selection.
- **F3 resolved:** focused unit coverage now exercises malformed readiness JSON, invalid URL, timeout, and spawn-error cleanup. The independent malformed-JSON child probe observed the checker exit without forced termination and confirmed the lab child was no longer alive.

Focused fixed receipt: 10 scripts, 114 settled observations, 20/20 native comparisons matched, zero mismatches, all eight required probes passed, three isolated participant contexts, and zero actor-lane failures. The cap scenario held four rows with `NextID=4`, four Add messages, and Add disabled. The application trace reached at most two held requests per actor; the separate pool receipt independently held four requests in each of three browser contexts while all three control GETs returned 200.

### Independent recheck commands

From `/workspace/scratch/39a56936f173/gondola`:

```text
/tmp/gondola-node22/node_modules/node/bin/node --check keyed-editor/check.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check keyed-editor/check.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check keyed-editor/harness.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check keyed-editor/harness-tracker.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check keyed-editor/adversarial.mjs
PASS — all five syntax checks.
```

```text
/tmp/gondola-node22/node_modules/node/bin/node --test keyed-editor/check.test.mjs keyed-editor/harness.test.mjs
PASS — 9 tests, 0 failures.
```

```text
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node keyed-editor/coordination/XR-E5-probe.mjs /tmp/keyed-e5-xr-fixed-20261030-02.json
PASS — 10 scenarios, 114 observations, 20 native comparisons matched; focus mutation detected after focus and ignored before it; DOM and React same-backend identity retained; backend swap replaced the node; malformed-readiness startup cleanup bounded; tracker body-completion gate passed; 12-request separate pool probe completed all control GETs with HTTP 200.
```

The rechecked E5 source hashes are `check.mjs` `d2e5bb37317e2b0cd5e476bb28014c5e8e3e8a209914fdf5231ba5043c0b7c93`, `check.test.mjs` `365f4dbd4f6afbb46a2a3db044b50daf955f34bb5c17e14a27161910c22ca29b`, `harness.mjs` `d5985d3e9752ee25c9f734a3b4c593cfe22f114fa936679dc7a5d58c40cd221e`, and `adversarial.mjs` `78f5c06afc0c47ca2588a734b4ab653f7a224b62e09a1374fdc8fac0eaa50a7b`.

This independent recheck covers the repaired fixed receipt only. The root-owned full two-seed replay remains pending the lifecycle repair and root’s final run; no post-repair full replay result is claimed here.

## Repair handoff

Preserve the original E5 attempt records and initial findings. E5 should add the missing focus/selection comparison and React same-backend identity probe, then rerun the focused gates and refresh the author report/hashes. E5 should also make HTTP-lab startup failure clean up its child. The E5 full trace and the root's separate HTTP-pool receipts remain unchanged.

**Status note:** this handoff is the initial-review request and was completed by the E5 owner before the independent repair recheck above. Do not treat it as outstanding work.

## Fresh-CI fallback recheck — 2026-10-30

The E5 owner found a fresh-layout blocker after the prior freeze: a clean keyed build may not contain `keyed-editor/build/http-lab`, while a stale `GO_BIN` could cause an `ENOENT` before the inherited HTTP lab is considered. The repaired selector now prefers the inherited `http-effects/build/http-lab` when the configured/keyed binaries are absent, and the Go fallback skips unavailable candidates and resolves commands through `PATH`.

I independently verified the new source hashes against the E5 report, then ran the expanded focused suite: **11/11 passed**. The new fresh-layout test starts the actual inherited HTTP lab with a missing configured keyed lab and a nonexistent `GO_BIN`, checks `/api/requests` returns HTTP 200 and the expected empty lane, stops/reaps the process, and verifies the listener is closed. The Go fallback test separately confirms a missing absolute candidate is skipped in favor of executable `go` found on `PATH`; it also checks the no-candidate error. Existing malformed JSON, invalid URL, timeout, spawn-error, focus comparator, and tracker tests still pass.

I also ran a fresh fixed browser/native replay with both environment paths deliberately invalid, so the real checker had to select the inherited lab:

```text
HTTP_LAB_BIN=/tmp/keyed-missing-http-lab GO_BIN=/tmp/keyed-missing-go CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node keyed-editor/check.mjs --seeds 20261030 --cases 0 --output /tmp/keyed-e5-fresh-fallback-fixed-20261030.json
PASS — inherited HTTP lab became ready; 10 fixed scripts, 114 settled observations, native CompareInteraction matched, zero parity mismatches.
```

I reran the independent diagnostic against that newly produced receipt:

```text
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node keyed-editor/coordination/XR-E5-probe.mjs /tmp/keyed-e5-fresh-fallback-fixed-20261030.json
PASS — 20/20 native comparisons matched; focus mutation detected after explicit focus and ignored before it; DOM and React retained the same actual input node through reorder and completion; backend swap replaced the node and restored selection; startup-failure cleanup reaped the lab child; all three pool control requests returned HTTP 200.
```

The frozen hashes rechecked were `check.mjs` `b4630005d1a3819a3768cb52a948e975038bc00cce9219211cd9bdf7685020b1`, `check.test.mjs` `494af77cdce5e8c376b91837835a6bc8527c43b81a6ca0ccc335990257768cc7`, `harness.mjs` `d5985d3e9752ee25c9f734a3b4c593cfe22f114fa936679dc7a5d58c40cd221e`, and `adversarial.mjs` `78f5c06afc0c47ca2588a734b4ab653f7a224b62e09a1374fdc8fac0eaa50a7b`.

**Fresh-CI finding resolved.** This proves the repaired fixed replay and startup path under the bad-path environment described above. It does not replace the root-owned post-lifecycle full two-seed replay.
