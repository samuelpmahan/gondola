# XR-E5 independent review — demo, runner, CI, and README

## Review result

**Accepted for E5 source and the corrected actual-Go demo gate.** Final integrated verification remains a separate root gate after the latest reference bundle is frozen and rebuilt; this report does not claim that the earlier full trace used that final bundle.

## Findings and recheck

The first actual-browser smoke recorded in `evidence/demo-smoke.log` exposed a stale Go JSON panel after a React renderer swap: the live tree showed request ID 2 while the panel still reported ID 1. The demo now observes input and click events in document capture and waits one task before `host.settled()` refreshes the panel. This preserves the renderer's synchronous Go dispatch and lets queued state/effects settle before sampling.

The corrected real-Go timer smoke passed in Chromium with the timed save still pending after an immediate renderer swap, then accepted the `setTimeout` reply. The same smoke passed the manual A/swap/B flow, late and duplicate replies, cancel/reset with a late reply, error, and retry. Evidence is in `evidence/demo-smoke-retry1.log`; `evidence/demo-pending-swap.png` shows React active with request B pending and request A marked canceled/superseded. The original failure and diagnostic log remain preserved.

## Build and CI review

- A clean CI run has an explicit Go 1.24 and Node 22 toolchain. It runs root `bash run.sh` for the signed Milestone 0 baseline, installs interaction dependencies from `interaction/package-lock.json`, installs Playwright Chromium, then runs `bash run-async-effects.sh` with dependency/browser reinstall skips.
- The async runner defaults to the inherited controlled-input chain, which runs the interaction, renderer-replacement, and controlled-input checks. It then builds `async-effects/build/async-save.wasm`, copies Go `wasm_exec.js`, bundles `async-effects/build/reference.bundle.mjs`, runs `go test ./...`, runs every `async-effects/*.test.mjs`, runs the browser demo smoke, and runs `async-effects/check.mjs` with the native comparator. For local runs, the README correctly instructs running `bash run.sh` first to include the signed static baseline; the default async runner itself skips that separate baseline.
- The demo imports the unchanged `controlled-input/build/react.bundle.mjs` and the built async reference bundle at their actual output paths. CI uploads the interaction, controlled-input, and async-effects build/evidence directories, including the pending-swap screenshot.
- CI and README paths, pinned package locations, skip-variable names, and asset names agree. `async-effects/.gitignore` scopes generated build/artifact/cache files without ignoring coordination or evidence.

## Checks and limits

Independent short checks passed:

- `bash -n run-async-effects.sh`
- Node 22 `--check` for `async-effects/demo.mjs` and `async-effects/demo-smoke.mjs`
- Required generated assets were present: `async-save.wasm`, `wasm_exec.js`, `reference.bundle.mjs`, the controlled-input React bundle, and `interaction/build/compare-interaction`
- The author’s actual Go/WASM Chromium demo smoke passed, including timer delivery after the immediate swap.

The recorded `evidence/async-final-run.log` passes `go test ./...`, 41 Node tests, the boundary smoke, the demo smoke, 76 scripts over 1,552 observations, all 11 adversarial probes, and native `CompareInteraction`. That trace predates the final E3 strict reference-wire amendment. Root owns a final aligned rebuild/run after the reference bundle is frozen; that remains required before publication. I did not duplicate E5’s long runner.
