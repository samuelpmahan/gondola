# R-T6B — process-error escalation and browser-smoke cleanup result

## Result

**Outcome: mixed_change.** Fixed the reviewed process lifecycle gap in `http-lab-process.mjs` and made browser-smoke teardown failures observable. A post-spawn child error no longer settles terminal observation; SIGTERM failure still proceeds to bounded SIGKILL cleanup. The browser smoke now fails if the lab does not report a clean terminal result, has a recorded signal failure, reports a post-spawn process error, or may remain alive. When teardown also fails, the original operation error remains primary and retains the cleanup errors. The focused tests and one real HTTP browser smoke passed.

## Changes

- The helper now resolves its terminal observation only from `exit`, `close`, or a pre-spawn error. Readiness itself also confirms that the child has started for adapters without a `spawn` event.
- Post-spawn `error` events are captured as process diagnostics and reject readiness if it has not settled, but they do not resolve the terminal wait. The error listener remains active for multiple errors.
- Both a false return and a thrown error from `kill()` are recorded. Cleanup still performs a bounded SIGTERM wait and then a bounded SIGKILL wait; a missing terminal observation returns a `timed-out` result with `residual: true`.
- Added `assertCleanHTTPProcessClose()` and used it in browser-smoke teardown. Browser shutdown and lab shutdown remain independently attempted in nested cleanup. `retainPrimaryFailure()` preserves the original browser/readiness error while attaching cleanup diagnostics, or throws an aggregate when cleanup is the only failure.
- Added four tests for the review probe condition, cleanup escalation with a residual child, smoke rejection of unsuccessful close results, and preserving an operation failure when cleanup fails.

## Reproduction and verification

Before the fix, the review probe reproduced the skipped escalation:

```sh
node typed-composition/coordination/reviews/xr_r_t6_kill_error_probe.mjs
```

Result: `{"outcomeKind":"error","killSignals":["SIGTERM"]}`. The test-first focused run also failed on two expected conditions: the post-spawn error skipped SIGKILL, and failed signal attempts returned `kill-error` without continuing to the bounded residual-process result.

After the fix, the same probe returned:

```json
{"outcomeKind":"exit","killSignals":["SIGTERM","SIGKILL"]}
```

The detailed unit test additionally verifies that the post-spawn error and SIGTERM failure remain in the result diagnostics and that the browser-smoke cleanup assertion rejects it.

Passed focused tests:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test typed-composition/http-lab-process.test.mjs
```

Result: **9/9 passed**, including bounded escalation when both signals fail and no process exit is observed.

Passed syntax and shell checks:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check typed-composition/http-lab-process.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check typed-composition/browser-smoke.mjs
bash -n run-typed-composition.sh
```

One browser-smoke attempt without an executable override failed before launch because Playwright's managed Chromium was absent at `/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`. Using the installed workspace Chromium succeeded:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
node typed-composition/browser-smoke.mjs
```

Result: **exit 0**; parent 1, child 2, recreated child 3; the held HTTP save completed under read-only policy; renderer swaps DOM → GoDOM → React preserved state, focus, and selection; receipt sequence 1 remained in the parent after child disposal; no browser page errors. The smoke's clean-close assertion passed.

## Unverified scope

The root agent owns the active full `run-typed-composition.sh` run. This repair did not rerun the inherited runner or seeded oracle and does not claim a full-suite pass. The separate XR-T2 hostile accessor/proxy bridge issue remains outside this repair.
