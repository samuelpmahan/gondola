# XR-T6 — independent review of nested demo, browser smoke, runner, CI, and docs

**Decision: accepted on the reviewed current snapshot.** The real HTTP browser smoke reproduced the reported nested ownership, renderer retention, cancellation, sibling, recreation, and stale-callback evidence. The focused session-tree test suite and the corrected GoDOM smoke path passed. I did not run the default runner, inherited full suite, or fresh CI; none of those passes is claimed here.

## Review findings

- `demo.html` and `demo.mjs` expose usable per-session controls for adding rows and child sessions, changing renderers, focusing inputs, holding/releasing saves, and disposing subtrees. The page displays tree/snapshot/focus/disposal/transport/request evidence. Startup errors and polling errors are surfaced through the visible `role="alert"` element; the smoke waits for either ready state or a visible startup error and requires the successful four-session ready state.
- Each mounted session receives a distinct UUID-backed HTTP lane and its own transport. The demo labels that HTTP trace separately from deterministic manual-transport replay. The browser smoke exercises the actual loopback HTTP lab; its 409 late-release and cancel observations are not presented as manual replay ordering evidence.
- The browser assertions compare physical descendant shell and input identity across parent and child renderer replacement, and check restored parent focus plus backward selection `[2,10]`. They also verify the unrelated sibling input survives family disposal, descendant cancellation postorder `[3,2]`, cancellation observed in both HTTP lanes, two late-release responses `409`, sibling completion after family disposal, fresh root allocation `1 → 5`, and zero calls to Go `Complete` from the captured retired callback.
- The CI workflow provisions Go 1.24, Node 22, the interaction lockfile dependencies, and Playwright Chromium before invoking the same default runner. Documentation distinguishes the real HTTP smoke from the manual transport replay and describes the inherited suite as part of the default entrypoint.

## Finding and final path recheck

My first inspection output showed the GoDOM smoke receiving `$ROOT/renderer-conformance/build/keyed-collection.wasm`, a path that did not exist. A later read of the current file showed `$ROOT/keyed-editor/build/keyed-collection.wasm`, which matches the artifact built by the inherited runner. The T6 author confirmed their finished runner already had the keyed-editor path and had not changed it after the report; its recorded modification time also predates my first observation. I therefore preserve the initial wrong-path observation as a stale/discrepant read, not as an established source defect or a source repair. I made no implementation edits. I verified the current invocation directly: the GoDOM browser smoke passed using the existing keyed-editor WASM. The final reviewed runner hash is recorded below.

## Exact verification

Toolchain: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`.

```sh
bash -n run-session-tree.sh
/tmp/gondola-node22/node_modules/node/bin/node --check session-tree/demo.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check session-tree/browser-smoke.mjs
# passed

CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test session-tree/*.test.mjs
# passed: 18 tests, 0 failures

CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node session-tree/browser-smoke.mjs
# passed; output confirmed postorder 3,2; late HTTP releases 409,409; recreated root 1 -> 5; stale callback Complete calls 0

CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node cmd/godom-wasm/smoke.mjs session-tree/build/godom.wasm keyed-editor/build/keyed-collection.wasm session-tree/build/wasm_exec.js
# passed; result reports two simultaneous instances, retained input keys/focus, invalid snapshot non-mutation, stale-handle fence, 100 mount/unmount cycles, and cleanup checks
```

The test suite initially failed when run under this environment without `CHROMIUM_EXECUTABLE_PATH` because Playwright could not find its default headless-shell executable. It passed with the provided Chromium path above. `run-session-tree.sh` also sets that path automatically when `/tmp/chromium` exists; CI uses the Playwright-installed Chromium.

## Remaining evidence boundary

The default `run-session-tree.sh` was not executed, by instruction while T5's CLI was being finalized. At T6 report time, `check.mjs` and `check.test.mjs` were not yet present. They are now present in the shared tree, but no deterministic browser replay, native comparison, inherited full-suite run, combined default run, or fresh CI result is established by this review. The T5 worker also reported that one existing T4 fixed renderer witness needs a focus/replace action reorder to ensure each replacement targets the focused session; I forwarded that finding to root for the separately scoped T4 repair and did not edit T4 files.

## Reviewed source hashes

```text
session-tree/demo.mjs                    3e3cb3a62c592eb3f96ae193eb84f48abc504adfbce2c38598a59792e493d78d
session-tree/demo.html                   07cc481ca5142ce4c0106a55ae3bcd556263a463e25f80cb4cb0f0582114fdf1
session-tree/browser-smoke.mjs           d06f4322c5eed200a50a3aa9e57842874b0b15143e2a9a5ff213556b914f9b5a
run-session-tree.sh                      9c70f1461cc767c5f22f196b69b5e512496385e530ef96af5c7da82a32b3cf98
.github/workflows/session-tree.yml        fa650b478d4aba94b714a74bb8e734ccdfe7064b54cd1d2fb07708345236a135
session-tree/README.md                   ed0d8e9cb9a19e9fe5779b94649dc7916070c06fb334350ee055bc192f0b980c
session-tree/RESULTS.md                  ef41b655be385e5bcf990eb9c1abac110013aded48bffb80adeac40525b1bee9
session-tree/build/browser-smoke.json    14d353392ad5cd794a4f619f91eb25e3370b053da4f4bc86249f6f7436d79c21
```
