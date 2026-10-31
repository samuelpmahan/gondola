# E-DEMO: compiled Go lifecycle demo

**Outcome: mixed_change.** Built and HTTP-smoke-verified a static demo that runs the actual compiled Go lifecycle module through the shared React/DOM renderers and manual effect host. The smoke covered pending-effect swaps, descendant-first cancellation, sibling survival, remount/stale reply fences, manual completions, duplicate replies, and final disabled DOM controls.

## Execution

- Job: `E-DEMO`, worker `N5`
- Native Rebalancer epoch 00: exact score **600**, native score **600**; all three declared constraints were zero.
- Base: `6b49cc0bd4c9512a041f723c86b632ec506afd9d` (PR 13 workspace)
- Lane result: `passed` for the static demo build and HTTP smoke; this is the N6 preintegration execution `compiled-lifecycle/builds/feasibility/bridge-green-02`, not the final lifecycle source-pinned matrix.
- Smoke: `gobi.compiled-lifecycle-http-smoke/v1`, status `passed`, 12 scenario checks, 24 final Go ticks, 4 renderer swaps.
- The N6 archive contains 152 members; round-trip verification passed. SHA-256: `1bf62ad5462a8ee71d6ac640228a6e620ee5cd9510d698f09f397d86a1cf18d5`.

## Commands and versions

- React GoScript CLI build: `GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/gobi-build < ../compiled-lifecycle/builds/feasibility/bridge-green-02/react/request.json > ../compiled-lifecycle/builds/feasibility/bridge-green-02/react/result.json 2> ../compiled-lifecycle/builds/feasibility/bridge-green-02/react/stderr.log` — exit 0; 67 compiler outputs, zero diagnostics.
- DOM GoScript CLI build: `GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/gobi-build < ../compiled-lifecycle/builds/feasibility/bridge-green-02/dom/request.json > ../compiled-lifecycle/builds/feasibility/bridge-green-02/dom/result.json 2> ../compiled-lifecycle/builds/feasibility/bridge-green-02/dom/stderr.log` — exit 0; 67 compiler outputs, zero diagnostics.
- Static demo build: `/tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/demo/build.mjs --compiled compiled-lifecycle/builds/feasibility/bridge-green-02/react/output --output compiled-lifecycle/builds/feasibility/bridge-green-02/demo-site --backend react` — exit 0.
- HTTP browser smoke: `CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/demo/smoke.mjs --demo compiled-lifecycle/builds/feasibility/bridge-green-02/demo-site --output compiled-lifecycle/builds/feasibility/bridge-green-02/demo-smoke.json --screenshot compiled-lifecycle/builds/feasibility/bridge-green-02/demo.png` — exit 0.

Tool versions: Node `v22.23.4`, Go root `go1.24.0`, Go compiler `go1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, Chromium `Chromium 153.0.8010.0`.

## Observations

- The browser loaded one actual compiled GoScript module. Its AppIR component ID is the full package path `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`.
- Go state and logical View were shown directly from the runtime snapshot. Requests and cancellations came from Go `Update`; JavaScript only hosted the deterministic manual effect scheduler and renderer selection.
- Four initial requests survived DOM→React→DOM swaps without a Go tick. Removing Parent canceled Grandchild→Child→Parent and kept Sibling's request pending. Remount produced generation 2 while the sibling stayed live.
- Forced replies for retired generation 1 correlations were rejected without a tick. Explicit stale Go `complete` messages left the remounted state and View unchanged. Sibling completion succeeded once; duplicate sibling and child completions were rejected.
- Final state tokens: Parent `parent:g2:r5`, Child `child:g2:r6`, Grandchild `grandchild:g2:r7`, Sibling `sibling:g1:r4`; all are complete, with no pending work.
- Final DOM: request buttons and Remount are disabled; Remove parent is enabled. Renderer swaps: 4; final backend: `dom`.
- HTTP requested `/` (200, 4546 bytes), `/demo.css` (200, 6573 bytes), and `/demo.bundle.mjs` (200, 1837423 bytes); all returned 200. WebAssembly requests and API attempts were empty. Browser errors, console errors, failed requests, and runtime failures were empty.

## Checks

- HTTP page loaded the actual compiled lifecycle Go module and mounted its Go View with the DOM renderer
- Go Init produced the initial value-owned Parent→Child→Grandchild tree and independent Sibling state
- Parent, Child, Grandchild, and Sibling counts changed through Go Update
- four Go-emitted lifecycle requests are pending in token order and displayed by the manual host
- pending request correlations, Go state, Go view, and trace survived DOM→React→DOM swaps with no extra Go tick
- removing Parent removed Child and Grandchild, cancelled Grandchild→Child→Parent, and retained Sibling's request
- remount restored a fresh generation-2 Go subtree while Sibling remained live and pending
- retired generation-1 reply callbacks were rejected without a Go tick, then explicit stale complete messages ran Go Update and left the remounted tree unchanged
- manual Sibling completion updated its Go state once; replaying the duplicate reply was rejected without a tick
- second-generation pending effects also survived React↔DOM replacement without a Go tick
- manual generation-2 replies completed Grandchild→Child→Parent; duplicate Child was rejected without a Go tick
- final DOM controls expose Go-disabled request/remount states while preserving the complete final tree and reply state

- Fresh React and DOM compiler outputs had byte-identical AppIR and encoder files; raw bundles were recorded separately.
- The typed effect-slice runtime bridge passed lifecycle tests 7/7 and shared runtime tests 29/29. Its focused report is `compiled-lifecycle/coordination/reports/R-EFFECT-SLICE.md`.

## Source pins and artifacts

Pins below are from the N6 post-run source snapshot and the demo-build input record. The lifecycle adapter pin is the exact R-EFFECT-SLICE source used in this smoke; a later R-UNMOUNT edit superseded it. No before/after source-drift claim is made for this preintegration run.

- `cmd/compiled-lifecycle-native/main.go` — `37d7d709599a5b402f792cd5e9e66118f0ec296984ed3fb11ad2626bb6c23bf3`
- `compiled-frontend/frontend/runtime/runtime.mjs` — `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0`
- `compiled-frontend/frontend/runtime/runtime.test.mjs` — `6ea9236b08d1bf624bc9f8a84d2bebd6cacfbc12c91749cabf97b8fc6a7bf7b1`
- `compiled-lifecycle/demo/app.mjs` — `78d45245561e03014eddcb80e26857bc40650edf94c1f6f96ba61182763fb871`
- `compiled-lifecycle/demo/build.mjs` — `e094a014c03121ca379291d3a564549750baced71d6a229b0cd5bb9980d953eb`
- `compiled-lifecycle/demo/demo.css` — `dacf230c424e95182a62f73253d30894c30b67171e6035c3f13bef4a32994f7a`
- `compiled-lifecycle/demo/index.html` — `fa1643df35179cb2f80c120c61811499c07ad8df8525aca1943515cc810a9412`
- `compiled-lifecycle/demo/smoke.mjs` — `c64c868341fd8a2e4de18b30403babc246397a08d1cb6f34c1a4f3db5daf5b21`
- `compiled-lifecycle/runtime/runtime.mjs` — `c6fad592554dda059c45ecdb1db55ab62283783de1b1d76c0f320f44fbdf7166`
- `fixtures/compiled/lifecycle/app.go` — `6b61e55c3046f58873d2774e38a7bca44769f18f6870c39e1885b78be340fe41`
- `fixtures/compiled/lifecycle/scenario.json` — `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650`
- `fixtures/compiled/lifecycle/view.go` — `afc4b1611c5dbd8e5264d3c124b808770bdd8579fdc1426c350f4df6689bb948`

- Smoke JSON: `compiled-lifecycle/builds/feasibility/bridge-green-02/demo-smoke.json` — `7ff02b0e825e8bb136cf67c111ef0f33acb18c0e02bc6f3e3bd6204a418b2aad`
- Screenshot: `compiled-lifecycle/builds/feasibility/bridge-green-02/demo.png` — `6f366f62a04be4223324602333013b5bfc5c69aaf2c9eeb2edd61e44b8bd8053`
- Static bundle: `compiled-lifecycle/builds/feasibility/bridge-green-02/demo-site/demo.bundle.mjs` — `bb9c5f05294816087c647ab965077e4ba4c3672c5e8464f52d4881ea56aac175`
- Verified archive: `compiled-lifecycle/builds/feasibility/bridge-green-02/artifacts.tar.gz` — `1bf62ad5462a8ee71d6ac640228a6e620ee5cd9510d698f09f397d86a1cf18d5`

## Attempt history and limits

- The earlier `compiled-lifecycle/demo/evidence/attempt-01-slice-abi-failure/` is retained as a failed attempt, including its screenshot, HTTP result, compiled bundle, raw GoScript module, encoder, AppIR, emitted GoScript, and logs. It failed because the runtime had not yet learned to decode the compiler's typed GoSlice returned by `removeParent`; no JavaScript workaround was added.
- N2's bounded encoder bridge resolved that failure by decoding signature-typed effect slices through the generated GoScript encoder. The successful demo run uses the ordinary Go `append` cancellation implementation and keeps the Go module as the sole application-state authority.
- This lane is a local static demo and HTTP smoke. N6 marked its run `acceptanceRun:false`; R-UNMOUNT/R-ORACLE and the final matrix remain separate gates. No production deployment or main-branch merge was performed.
