# E5 author report: demo, build runner, CI, and documentation

## Delivered

- `demo.html` and `demo.mjs` load `cmd/async-save-wasm`, mount one Go session through the unchanged controlled-input DOM and React renderers, and display the Go snapshot, completion audit, transport events, actual DOM, input value, and disabled properties.
- The demo's manual transport keeps callbacks available after cancel and delivery. Per-request controls deliver success, error, and duplicate replies. The **Reply with a timer** checkbox selects a local `setTimeout` transport for new saves; requests already started keep their original transport across renderer swaps.
- `demo-smoke.mjs` drives A → renderer swap → B → late A ignored → B accepted → duplicate B ignored, then cancel/reset → late C ignored, followed by a timed save completed after an immediate renderer swap and an error/retry. It captures `evidence/demo-pending-swap.png`.
- `run-async-effects.sh` defaults to the inherited `run-controlled-input.sh` chain before building async-save WASM, copying `wasm_exec.js`, bundling the independent reference, running Go and Node tests, running the demo smoke, and invoking the parity/adversarial harness. `GONDOLA_ASYNC_SKIP_INHERITED=1` is an explicit iteration option after inherited gates pass; the default remains the full chain.
- `.github/workflows/async-effects.yml` uses Go 1.24, Node 22, the pinned interaction dependencies, and Playwright Chromium. It runs the signed Milestone 0 baseline before the async-effects runner and uploads browser/build evidence.
- `README.md` documents execution, manual and timer modes, and milestone boundaries. `async-effects/.gitignore` covers generated build, artifact, and Python cache output. The root `.gitignore` is byte-identical to HEAD.

## Verification recorded so far

- `node --check async-effects/demo.mjs` and `node --check async-effects/demo-smoke.mjs` passed under Node v22.23.4; `bash -n run-async-effects.sh` passed.
- Built `async-effects/build/async-save.wasm`, `wasm_exec.js`, and `reference.bundle.mjs` with Go 1.24 and the pinned interaction esbuild. E4's fixed browser integration run passed 16 scripts, 122 observations, 32 native comparisons, and all 11 adversarial probes.
- The runner now executes `cmd/async-save-wasm/smoke.mjs` against the exact generated WASM and copied `wasm_exec.js` after building them. It passed the exact Step/Reply schema checks, atomic malformed-input rejection, valid recovery, outbox/audit, safe IDs, and unserializable-input recovery.
- E1's targeted Go tests, JS/WASM and native stub builds, and Node 22 WASM API smoke passed. E2's 16 host/transport tests passed. E3's bundled-reference 7 tests passed.
- The actual Go-backed demo smoke passed with Node v22.23.4 and Chromium 153.0.8010.0:

  ```sh
  PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  node async-effects/demo-smoke.mjs
  ```

  It passed the manual A/swap/B/late-A/B-success sequence, duplicate B, cancel/reset/late C, timer completion after immediate swap, and error/retry. Full output is `evidence/demo-smoke-retry1.log`; screenshot is `evidence/demo-pending-swap.png`. The first two attempts are retained as `evidence/demo-smoke.log` and `evidence/demo-smoke-diagnostic.log`. They exposed a stale JSON panel around React's delegated click; the demo now observes events in capture and refreshes after a zero-delay task plus `host.settled()`.
- First inherited attempt failed while Playwright tried to download Chromium without the configured local binary; the complete log is `evidence/inherited-provision-failure.log`. The next attempt reached `go test ./...` while E1's test edits were incomplete and failed on two State/editor.State comparisons; full log is `evidence/inherited-concurrent-edit.log`.
- The corrected inherited run completed with Go 1.24.0, Node v22.23.4, and Chromium 153.0.8010.0. It passed the controlled-input unit and demo smoke gates, 216 inherited parity scripts over 10,149 observations, and native `CompareInteraction`. Its complete log is `evidence/inherited.log`.
- A full new run was started while the inherited browser loop was still in progress:

  ```sh
  PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
  GONDOLA_ASYNC_SKIP_INHERITED=1 \
  bash run-async-effects.sh --seeds 20261030,20261031 --cases 30 --max-actions 40 \
    --output async-effects/build/full-report-seeds-20261030-20261031.json
  ```

  Its log is `evidence/async-full-run.log`; its trace is `build/full-report-seeds-20261030-20261031.json`. It completed with `go test ./...` passing, 38 Node tests passing, demo smoke passing, 76 scripts over 1,552 initial/action observations, zero mismatches, all 11 adversarial probes passing, and native `CompareInteraction` matched. Environment: Go 1.24.0, Node v22.23.4, Chromium 153.0.8010.0, React/ReactDOM 19.3.1. This first run started before the XR-E1/XR-E2 amendments and remains pre-amendment evidence.

- A second async-only runner built the frozen XR-E1 bridge and XR-E2 lease source, ran the new Node22 WASM bridge smoke, then completed `go test ./...`, 41 Node tests, the demo smoke, and the same two-seed browser/native/adversarial run. It passed 76 scripts over 1,552 initial/action observations with zero mismatches, all 11 probes passing, and native `CompareInteraction` matched. Its log is `evidence/async-final-run.log`; its trace is `build/final-report-seeds-20261030-20261031.json`. It used the same Go/Node/Chromium/React versions as above, but the reference bundle was built before E3's later strict wire validator amendment, so this run is pre-E3 evidence.

## Final frozen integrated run

After E3's exact-key Step/Reply validator was bundled and its 8 Node tests passed, the final command rebuilt the WASM and reference bundle and ran the full async-only chain against the frozen sources:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
GONDOLA_ASYNC_SKIP_INHERITED=1 \
bash run-async-effects.sh --seeds 20261030,20261031 --cases 30 --max-actions 40 \
  --output async-effects/build/final-frozen-report-seeds-20261030-20261031.json
```

Exit code: 0. Go 1.24.0 `go test ./...` passed; Node v22.23.4 ran the strict WASM boundary smoke and **42 tests passed, 0 failed**; the real browser demo smoke passed manual late/duplicate/error/retry cases and a timer reply after immediate renderer swap. Chromium 153.0.8010.0 with React/ReactDOM 19.3.1 matched 76 scripts over 1,552 initial/action observations, with zero mismatches, 11/11 adversarial probes passing, and all 152 native comparisons matched. The full run log is `evidence/async-final-frozen-run.log`; the report is `build/final-frozen-report-seeds-20261030-20261031.json`; the refreshed screenshot is `evidence/demo-pending-swap.png`.

| Built artifact | SHA-256 |
| --- | --- |
| `build/async-save.wasm` | `b98db71964fc09e914779b867db5731cef32fd4aa6062b544c764ca9e510cb6a` |
| `build/wasm_exec.js` | `0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14` |
| `build/reference.bundle.mjs` | `d4126657614900306102cc6d01b87887f44ea6e673a9350cb77dbdb12209ca43` |

## Remaining integrated gates

All E5 integrated gates are complete on the final E1/E2/E3 sources. The inherited full chain passed earlier; the final async-only runner used the explicit inherited skip to avoid repeating that long receipt.
