# R-T6 — repair of HTTP browser-smoke lifecycle and demo copy

## Result

**Outcome: mixed_change.** Addressed the XR-T6 findings in the T6-owned browser smoke and demo page. The browser smoke now records lab exit/error state before readiness handling, rejects readiness on exit or spawn failure, and performs bounded cleanup. The demo now says that the parent supplies the child title and displays its own Published count. Focused lifecycle tests and one post-fix real-HTTP browser smoke passed.

## Changes

- Added `http-lab-process.mjs` to own HTTP lab startup, readiness, captured exit/error promises, and cleanup. Startup catches a synchronous spawn throw and listens for `error` and `exit` immediately after spawn. The readiness promise rejects with stderr detail on startup error, early exit, invalid readiness data, or timeout.
- `close()` is idempotent. It closes the readiness stream, avoids killing or awaiting a process already known to have exited or failed to spawn, sends SIGTERM to a running lab, waits up to the configured cleanup bound, escalates to SIGKILL, and waits one more bounded interval. If no exit event arrives, it returns a timed-out result instead of hanging.
- Reworked `browser-smoke.mjs` to use the helper and await its previously registered close path inside a nested `finally`, including when readiness rejects or Chromium cleanup fails.
- Corrected the explanatory text in `demo.html`: the child displays its parent's title input, while the parent view displays its Published count.
- Added five helper tests for early child exit, asynchronous spawn error, synchronous spawn throw, SIGTERM/SIGKILL bounded timeout, and successful observation of an exit event after termination.
- Appended the XR-T2 hostile accessor/proxy scope qualification to A-CONTRACT. Its ordinary-flow confirmation remains in the report history, with final audit outcome changed to `mixed_change` to distinguish successful composition choreography from the still-open bridge rejection-invariance defect.

## Verification

Toolchain: Node 22.23.4, Chromium at `/tmp/chromium`.

Passed focused tests:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test typed-composition/http-lab-process.test.mjs
```

Result: **5/5 passed.**

Passed syntax and shell checks:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check typed-composition/http-lab-process.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check typed-composition/browser-smoke.mjs
bash -n run-typed-composition.sh
```

Passed one post-fix real HTTP browser smoke:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
node typed-composition/browser-smoke.mjs
```

Result: parent 1, child 2, recreated child 3; pending HTTP save completed under read-only policy; DOM → GoDOM → React preserved row state, focus and selection; receipt sequence 1 remained in the parent after child disposal; no browser page errors.

## Unverified scope

The root agent owns the active full `run-typed-composition.sh` run, so R-T6 did not rerun the inherited runner or seeded oracle. The independent XR-T2 hostile accessor/proxy finding remains open; this task did not modify the bridge. See the A-CONTRACT addendum for that exact gap.
