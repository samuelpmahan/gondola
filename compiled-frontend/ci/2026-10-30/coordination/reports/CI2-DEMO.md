# CI2-DEMO — N4

**Outcome: `confirmed_reuse`.** The completed repaired-head CI run built the four generated Go components, composed the demo from those exact compiler outputs, and passed its real HTTP/Playwright smoke. Source pins and compiler-output pins stayed stable. The original failed run remains preserved in the CI-DEMO packet; this is a separate run and head.

## Run and artifact

Provider completion metadata identifies run `41144116537`, job `124365059288` (success), artifact `13020568606`, PR head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`, tree `ca99e9432dca87a6bf6718c20186b1223b870126`, parent `408e330517b1dd5e5f865e2ff1914465f98bcf66`, and artifact size `124,558,516` bytes. The archive digest is `c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e`; the repaired extraction manifest records the same digest.

The first extraction attempt ran out of space while copying very large inherited JSON reports. Root removed the failed staging output and used the preserved verified archive for a bounded recovery. This final extraction contains all **309 compiled-frontend artifact files** plus four small inherited JSON reports; my file-by-file size and SHA-256 verification found zero mismatches. Execution/output evidence below comes from that immutable extraction; source-pin verification compares it read-only against the exact canonical checkout. No local runner or browser output is used.

## Build and provenance

`execution.json` reports `passed`, zero mismatches, 33 commands with every exit code zero, and 81/81 Node tests. Captured versions are Go `go1.24.13 linux/amd64` for the root compatibility gates, Go `go1.27.3 linux/amd64` for the compiled suite, Node `v22.23.4`, React/ReactDOM `19.3.1`, esbuild `0.28.2`, and Playwright `1.64.1`. The demo smoke recorded Chromium `156.0.8078.4`. All 66 command-log files matched their hashes in the execution receipt.

The build request contains counter, form, list, and effect. `build-result.json` reports four apps and no diagnostics; the build manifest identifies each app's AppIR, compiled module, and encoder, and lists 186 emitted TypeScript files, four generated Go forwarder sources, and a forwarder Go module. The output inventory also contains the shared React map. I verified all **209** BuildResult output files against their byte counts and SHA-256 values, and confirmed `outputPinsBefore` equals `outputPinsAfter`. The 116 `sourceBefore` pins equal `sourceAfter` and match the exact evidence checkout with zero local hash mismatches.

The generated demo `entry.mjs` imports the four modules and four encoders listed by the build manifest. The successful `build-demo` command produced the entry, ESM bundle, and copied HTML. Since `execution.json` does not separately pin the demo bundle, I measured its hash from the immutable artifact and retained the entry, bundle, HTML, smoke JSON, and screenshot hashes in `audits/CI2-DEMO/verification.json`.

## HTTP demo and screenshot

`demo-smoke.json` reports `passed` on the real local HTTP server and Playwright browser. All five scripted checks passed: four components mounted; counter Add/Add/Reset and disabled Reset; form text/checkbox/save and literal argument; keyed list edit/reorder; and effect pending/disabled UI followed by one manual captured reply. Runtime failures, page errors, and `.wasm` requests are empty. The five browser conformance profiles (four apps plus list-growth) also matched, with zero WASM API attempts and zero WASM requests, totaling 43 matched ticks.

The full-page screenshot is `provider/repaired-extracted/compiled-frontend/artifacts/demo.png` (1280×1252, 119,529 bytes, SHA-256 `685f5e427e3b268ed71a8dc3ed197e3f956ae11a2fd8e1a3034badf1346cc896`). I inspected it read-only: it shows the four app cards in their expected final interaction state, including the reset counter and one completed effect request.

## Limits

The final screenshot shows the post-interaction state; the effect-pending state is evidenced by the smoke assertions before manual completion. The smoke collects runtime `onFailure`, `pageerror`, and `.wasm` requests; it does not separately record `console.error`, `requestfailed`, the document response status, or a WebAssembly API-attempt counter in `demo-smoke.json`. The five separate conformance reports do record zero WebAssembly API attempts. This result covers the published repaired head and these four apps/five scripts, not every Go program or renderer environment.

The audit script and full verification details are in `audits/CI2-DEMO/verify-artifact.mjs` and `audits/CI2-DEMO/verification.json`. The screenshot is retained at the immutable provider path above.
