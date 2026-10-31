# XR-R-CI-LAUNCH

**Decision: accepted.** The launcher repair is limited to the no-WASM test file, correctly delegates to the shared Chromium options helper, and has bounded full-run evidence. This acceptance covers the launcher repair and the recorded composed run; it does not assert that a managed-Chromium browser launch was exercised in that run or verify a remote PR update.

## Source review

Against the PR11 head `408e330517b1dd5e5f865e2ff1914465f98bcf66`, the composed runner's 116 pinned source paths show exactly one difference: `compiled-frontend/conformance/no-wasm.test.mjs`. Its base SHA-256 is `79d92ad4be99f76122736f4851b7ca84397bdd2f38772a5c4623caaed5badf9f`; the repaired file SHA-256 is `4092cbd692428e647d8c2deb361beb5032d3a39f4599aa4d55a0a207c4700775`. All 116 repaired checkout files match the execution receipt's `sourceBefore` pins, and its `sourceBefore`/`sourceAfter` arrays are equal.

Both no-WASM tests now call `chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH))`. The shared helper omits `executablePath` when the argument is undefined and includes it when a path is provided. The unchanged `browser-options.test.mjs` covers both branches, and both tests passed in the composed Node run. The two no-WASM test bodies are unchanged after normalizing only the launcher call: the WebAssembly API attempt and `.wasm` request checks remain. The import graph is acyclic: the test imports `browser.mjs`, which imports `no-wasm.mjs`; neither utility imports the test.

## Composed run evidence

The root-composed run in `/workspace/scratch/39a56936f173/gondola-compiled-fix/compiled-frontend/artifacts` records status `passed`, with 33/33 commands exiting zero. It used root Go 1.24.0, nested Go 1.27.3, Node v22.23.4, React/React DOM 19.3.1, esbuild 0.28.2, and Playwright 1.64.1. The Node suite passed 81/81 tests, including both no-WASM tests and both launcher-options unit tests.

The build result reports four apps, zero diagnostics, and 209 outputs. The five saved conformance reports are all `matched`, totaling 43 ticks: counter 5, form 10, list 11, effect 5, and list-growth 12. The runner's 209 output hashes and sizes match the saved files before and after the run. The demo smoke report passed with no errors, failures, or WASM requests.

## Limit

The composed run recorded `CHROMIUM_PATH=/tmp/chromium`, so its live no-WASM tests exercised the explicit-path branch. The undefined-path behavior is covered by `browser-options.test.mjs` assertions, but a live browser launch through Playwright's managed-Chromium default was not exercised in this run. The first GitHub workflow attempt remains the separately recorded failed run; this review does not claim a repaired remote workflow artifact or PR-head movement.

Detailed hashes, command logs, source-pin comparisons, output-pin checks, profile summaries, and the launcher branch evidence are in [review-evidence.json](../../audits/XR-R-CI-LAUNCH/review-evidence.json). The reviewed repair packet is [R-CI-LAUNCH.md](R-CI-LAUNCH.md).
