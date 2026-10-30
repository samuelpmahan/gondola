# XR-E6 — independent review of demo, runner, and CI

## Disposition: PASS

The current E6 source paths, toolchain checks, and demo flow match the plan. The live HTTP smoke passed after the E1 manifest-field and E4 GoDOM WASM refresh. Root identified one default-runner coverage gap: it built GoDOM WASM but did not execute E2's direct GoDOM bridge smoke. The E6 owner added the smoke after the Go runtime copy and documented it; I independently checked the patch, isolated build order, direct bridge smoke, and HTTP demo smoke against current artifacts. E6's original output hash table remains a historical pre-blank-policy checkpoint; current hashes are recorded below.

## Review findings

| Area | Result | Evidence |
| --- | --- | --- |
| Default inherited run | Pass | `run-renderer-conformance.sh` calls `bash "$ROOT/run-keyed-editor.sh"` with no skip argument before its conformance builds; that entry point unsets the inherited HTTP/async receipt skip variables. |
| Direct GoDOM bridge smoke in default run | Pass | E6 now invokes `cmd/godom-wasm/smoke.mjs` after building GoDOM and copying `wasm_exec.js`, passing the new GoDOM WASM, actual collection WASM, and matching runtime script. I verified the exact command against refreshed artifacts. |
| Fresh checkout/build paths | Pass by inspection | The inherited default provisions interaction dependencies and Chromium when absent. E6 then checks for esbuild and creates the manifest CLI, fixtures, GoDOM WASM, and `wasm_exec.js`; inherited work creates the collection WASM, React/reference bundles, and HTTP lab. Generated outputs are under ignored build directories. `/tmp` executable paths are conditional local fallbacks; CI installs Go/Node and dependencies before running the script. |
| Toolchain policy | Pass | E6 runner checks Go 1.24 and Node 22. The workflow uses `setup-go@v5` with `1.24.x`, `setup-node@v4` with Node 22, installs pinned interaction dependencies and Playwright Chromium, then sets the documented provisioning opt-outs. |
| CLI argument forwarding | Pass by inspection and parser smoke | The final command is `node "$CONFORMANCE/check.mjs" "$@"`. Direct `check.mjs --seed 123 --cases 0 --max-actions 1 --help` exited 0 and printed usage without starting the browser. |
| Manifest and GoDOM on the demo page | Pass in Chromium | `demo.html` loads `/renderer-conformance/build/wasm_exec.js` and `/renderer-conformance/demo.mjs`; the module loads the real collection WASM, fetches the generated manifest, loads `/renderer-conformance/build/godom.wasm`, and creates negotiated `dom`, `react`, and `godom` descriptors. Current smoke reached and switched to GoDOM. |
| HTTP interactions | Pass in Chromium | The direct smoke covered held save capture; edit and reorder while pending; DOM→GoDOM focus/selection restoration; real completion updating the retained GoDOM input; GoDOM→React focus restoration; cancel on row removal; stale reused-path/key rejection; typed HTTP error and successful retry with a fresh request ID. |
| Workflow | Pass by inspection | Push and pull-request workflow installs the declared toolchains, packages, and browser before invoking the default runner. It uploads inherited and renderer build artifacts even on failure. |

## Direct smoke

Command, run against the refreshed manifest, fixtures, and GoDOM binary:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node renderer-conformance/demo-smoke.mjs
```

Result: exit 0. It printed all six `PASS` checks and `renderer conformance real-HTTP demo smoke passed`.

The direct GoDOM bridge smoke, now part of the default runner after `wasm_exec.js` is copied, passed:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node cmd/godom-wasm/smoke.mjs renderer-conformance/build/godom.wasm keyed-editor/build/keyed-collection.wasm renderer-conformance/build/wasm_exec.js
```

It returned `{"ok":true,"rowsAfterReorder":[2,1],"retainedInputKeys":["row-1-input","row-2-input"],"focus":{"key":"row-2-input","selectionStart":2,"selectionEnd":7,"selectionDirection":"backward"},"completionSaved":"saved two","detachedCallbackCleaned":true,"wrongArityRejectedForAllMethods":true,"invalidSnapshotDidNotMutate":true,"callbackFailureNotified":true}`.

I also ran the isolated E6 post-inherited build segment in its scripted order—build CLI, regenerate manifest and fixtures, build GoDOM for `js/wasm`, copy `wasm_exec.js`, then invoke the bridge smoke. It exited 0 against the current collection WASM without running the 13-minute inherited chain:

```sh
go build -o renderer-conformance/build/render-contract ./cmd/render-contract
renderer-conformance/build/render-contract manifest > renderer-conformance/build/manifest.json
go run ./cmd/conformance-fixtures > renderer-conformance/build/fixtures.json
GOOS=js GOARCH=wasm go build -o renderer-conformance/build/godom.wasm ./cmd/godom-wasm
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" renderer-conformance/build/wasm_exec.js
node cmd/godom-wasm/smoke.mjs renderer-conformance/build/godom.wasm keyed-editor/build/keyed-collection.wasm renderer-conformance/build/wasm_exec.js
```

`bash -n run-renderer-conformance.sh` passed after the runner change.

Observed versions: Go `go1.24.0 linux/amd64`; Node `v22.23.4`; Playwright `1.64.1`; `/tmp/chromium` `153.0.8010.0`.

The full `run-renderer-conformance.sh` was not rerun in this review. Root separately reported the inherited baseline passing, and CI is configured to exercise the full default chain. This review makes no new claim that the full post-refresh runner or CI has completed.

## Current asset hashes

These hashes identify the current post-E1/E4 refresh used by the direct smoke. E6's earlier output hashes are retained in E6.md as historical evidence from its initial direct-smoke checkpoint.

| File | SHA-256 |
| --- | --- |
| `run-renderer-conformance.sh` | `4ab49f57a856f45ec530b1f2547439a8d9fb39ff986d12e970639530ae6fe121` |
| `.github/workflows/renderer-conformance.yml` | `1784d5f8ee9a4e1cc1f264a5a0655dbbc08abc24859d1a76feb6144d36c9a243` |
| `renderer-conformance/README.md` | `40b9c0eb0d9e698bc6b9c1824db18386f4d7454c6860ef5d680c1a91d225f05b` |
| `renderer-conformance/coordination/reports/E6.md` | `af146ceea3dd7a3dfbcd0cc63af1379f3e460910fe3aa86309406807e4ef26a5` |
| `renderer-conformance/demo.html` | `29710c6120c48ce08730a01dd834afeb50752ae78cda5206851393e416fd9d9e` |
| `renderer-conformance/demo.mjs` | `f662fccf8bb24f78a49944d07b332e0b88477eec0ee130f7d24ee2da47f201c1` |
| `renderer-conformance/demo-smoke.mjs` | `2ef9fd28f57bf3c4c3f185c63788cbfe429e739b252aa251402711491b04644c` |
| `renderer-conformance/build/render-contract` | `3bfecc048042073d0e9223bb7f2f510c5dc62186ed8623fc8e8de5bbf725bc49` |
| `renderer-conformance/build/manifest.json` | `f83f26473133be5959211806101566abf04f514cd00831407c2a45ff053a0261` |
| `renderer-conformance/build/fixtures.json` | `e39934b601015f591e7426e26e6da55e52be0197457acade8d50fd20c0b74204` |
| `renderer-conformance/build/godom.wasm` | `ae3b75e2a53718219ed8b0f3c44ef60ac373245f68ca03a746be4b2e5682e40e` |
| `renderer-conformance/build/wasm_exec.js` | `0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14` |
| `keyed-editor/build/keyed-collection.wasm` | `7db6ef37ca05b61d277ef5b70a613c12b624e3c17b35dbb133426d4baf5a8d8d` |
| `keyed-editor/build/react.bundle.mjs` | `091e9e8a2f17a9d148803f568720614a911cd22d0fed6db7cbd55c47597e17a6` |

## Limits

This review did not rerun the full default chain because root already ran the inherited baseline and explicitly assigned this bounded review; the post-refresh real-HTTP demo smoke was rerun. The initial Playwright-managed Chrome download failure and the earlier demo-module URL bug remain documented in E6.md; the current direct smoke verifies the fixed page path with the available Chromium binary. Fresh CI provisioning remains the workflow's responsibility.
