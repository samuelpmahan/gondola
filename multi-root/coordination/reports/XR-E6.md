# XR-E6 — Independent review of demo, runner, CI, and evidence

**Decision: accepted.** I reviewed the E6 demo, `run-multi-root.sh`, GitHub Actions workflow, README/RESULTS, and packet evidence. I found no concrete issue in this delivery slice. The documented full-run/replay and preservation status remains explicitly pending, and the report does not claim those gates passed.

## Rechecked claims

- The default runner uses `set -euo pipefail` and invokes `run-renderer-conformance.sh` before building or running the new multi-root gates. The inherited runner invokes its own prior chain before proceeding. Go/Node versions, `esbuild`, WASM runtime, and commands are checked fail-closed; the local browser smoke fails on startup errors and uncaught page/console errors.
- The workflow installs Go 1.24.x, Node 22, exact interaction dependencies with `npm ci`, then Playwright Chromium, and invokes the same default runner. React/ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2 are exact in `interaction/package.json` and its lockfile.
- The README and RESULTS accurately distinguish the passing standalone browser smoke from the pending full runner, seeded parity/replay, preservation recheck, and cross-review acceptance. Historical preservation counts cite coordinator reconnaissance and remain labeled pending final recheck.
- `packet-status.json` separates packet checks, actual browser assertions, screenshot evidence, earlier repairs, and pending root integration rather than treating author allocation or packet checks as final acceptance.

## Browser and artifact verification

I reran the standalone Chromium demo smoke against the current WASM/bundle build. It passed with three distinct Go sessions and HTTP lanes; a DOM-to-React swap retained backward selection and sibling inputs; request ID 1 was held independently in A and B; disposing A canceled only A, the late release returned the expected HTTP 409, B completed, and a fresh remount allocated a new session and lane.

The retained screenshot and five build hashes recorded in the packet evidence match the current files:

| Artifact | SHA-256 | Result |
| --- | --- | --- |
| `multi-root/build/multi-root.wasm` | `e59bc84cce3238b8ade5c10f7fe74ffcd14dcae8bcfa2ac1158ce7dd7d78ec11` | matches |
| `multi-root/build/godom.wasm` | `2797e238bb5bb777f99aa23f83ad0d03ee7c6c3c6ec0597af5c919ded723aa28` | matches |
| `multi-root/build/wasm_exec.js` | `0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14` | matches |
| `multi-root/build/react.bundle.mjs` | `091e9e8a2f17a9d148803f568720614a911cd22d0fed6db7cbd55c47597e17a6` | matches |
| `multi-root/build/reference.bundle.mjs` | `748cb44c0bd4bdd8e54386bb5370b56cc63476176d9144e1b413128d08e0ddd6` | matches |
| `multi-root/evidence/demo-three-roots-held.png` | `2bbe5ec09b265c0c037a5183a12fde48adbff21010e36d4937f2d6cb5a49fcdb` | matches |

## Commands and results

Toolchain observed: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`.

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check multi-root/demo.mjs
# passed

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check multi-root/browser-smoke.mjs
# passed

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check multi-root/check.mjs
# passed

bash -n run-multi-root.sh
# passed

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node multi-root/check.mjs --help
# passed; reported seeds 20261030, 20261031; 30 cases per seed; action cap 40

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node multi-root/browser-smoke.mjs
# passed; all five documented browser observations printed PASS

sha256sum multi-root/build/multi-root.wasm multi-root/build/godom.wasm multi-root/build/wasm_exec.js multi-root/build/react.bundle.mjs multi-root/build/reference.bundle.mjs multi-root/evidence/demo-three-roots-held.png
# all six values matched packet-status.json
```

I did not run `bash run-multi-root.sh`: it includes the inherited full regression chain and seeded replay, which E6 and RESULTS accurately leave to root integration. I make no claim about those pending gates or final delivery-pin preservation.
