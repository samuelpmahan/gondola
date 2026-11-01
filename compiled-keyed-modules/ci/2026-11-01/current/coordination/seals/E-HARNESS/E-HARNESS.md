# E-HARNESS: native keyed module conformance

**Status:** matched  
**Worker / job:** N4 / E-HARNESS  
**Outcome:** mixed_change

## Result

The harness replayed the same versioned scenario JSON through the native Go CLI, both independently compiled direct profiles, and mounted browser profiles backed by the generated React and DOM modules. All four native semantic checks and all direct/browser parity checks matched. The literal run compared 19 snapshots (initial state plus 18 events); each seeded run compared 37 (initial state plus 36 events).

| Scenario | Seed | Events | Snapshots compared | Direct profiles | Browser profiles | Result |
|---|---:|---:|---:|---:|---:|---|
| `keyed-modules-literal` | — | 18 | 19 | React, DOM | React, DOM, DOM→React→DOM swaps | matched |
| `keyed-modules-seed-20261101` | 20261101 | 36 | 37 | React, DOM | React, DOM, DOM→React→DOM swaps | matched |
| `keyed-modules-seed-20261102` | 20261102 | 36 | 37 | React, DOM | React, DOM, DOM→React→DOM swaps | matched |
| `keyed-modules-seed-20261103` | 20261103 | 36 | 37 | React, DOM | React, DOM, DOM→React→DOM swaps | matched |

Totals: 8 direct runs, 12 mounted browser profiles, and 130 native-aligned snapshots across the four scenarios. The literal profile also passed 11 semantic mutation controls. Build identity validation matched both independent build pairs; all 17 build/helper identity mutation controls were rejected.

The scenarios exercise two child keys (`a`, `b`), independent counters and resets, parent lock propagation and disabled Add/Reset actions, keyed reorder, removal and remount with a new generation, and replay of a retained callback/publication before and after remount. Native Go output supplies the expected transitions. The checker compares canonical parent/controller/child state, order, generation, input, publication, and Go view tree. Browser captures additionally compare DOM and record live DOM-node identities: the mounted nodes persist through reorder, a remount gets new identities, and renderer swaps preserve logical keyed instances while replacing renderer-owned DOM nodes.

The browser invokes the current rendered controls with programmatic `HTMLElement.click()` and verifies the requested action against the Go View handler. This is DOM click dispatch, not trusted pointer input or OS-level input. Disabled controls produced no callback or Go bridge call; their no-message suppression was recorded after checking the actual button's disabled state.

## Reproduction

Full run (exit status 0):

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-keyed-modules/conformance/run.mjs \
  --native-go /tmp/gondola-go/go/bin/go \
  --build-index compiled-keyed-modules/build/output/E-BUILD-final/build-index.json \
  --chromium /tmp/chromium-portable \
  --output ../keyed-module-coordination/rawlogs/E-HARNESS/run-final \
  > ../keyed-module-coordination/rawlogs/E-HARNESS/run-final.stdout.log \
  2> ../keyed-module-coordination/rawlogs/E-HARNESS/run-final.stderr.log
```

Loader descriptor mutation test (1 passed, 0 failed):

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-keyed-modules/conformance/module-loader.test.mjs
```

Tool versions: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`. The native `go run` was invoked with `GOTOOLCHAIN=local` and `GOFLAGS=-buildvcs=false`. Build commands, compiler identity, and four generated module artifact sets are bound by the build index below.

## Identity and evidence

- Build index: `compiled-keyed-modules/build/output/E-BUILD-final/build-index.json`, 84,891 bytes, SHA-256 `75df29c02218fab47294454bb0338a720d806901d64377b4cae024fd4f6a2e66`.
- Final runner summary: `rawlogs/E-HARNESS/run-final.summary.json`, 71,328 bytes, SHA-256 `b8fa47c2f57c4b011312607cdf3cc029c3c583c9af4bdd99ff68eddc1a48dde1`.
- Final runner check: `rawlogs/E-HARNESS/run-final.check.json`, 316 bytes, SHA-256 `78f374a187e2b2003b76c66d5a8e89576fa7e4c390ba5d2dd051c972b96850b2`.
- Captures: `rawlogs/E-HARNESS/run-final.*`; the summary contains the per-scenario scenario/native/direct/browser paths, byte lengths, and hashes. Native stdout/stderr, runner stdout/stderr, scenario inputs, browser profiles, DOM identity checkpoints, and parity/mutation results are retained there.

Harness source SHA-256 values:

| File | SHA-256 |
|---|---|
| `conformance/browser-entry.mjs` | `ed8d7ddfa9494cfc53dbd9c19d11c49f666aabaf3f1f3c39446d2e11fdd7b70d` |
| `conformance/browser.mjs` | `034c060e3b5b40ccdb3a54312c8544f08d50f3c732d5c5da27bb2fcc32e07059` |
| `conformance/capture-utils.mjs` | `153d6173bbf33485ccbd882c5756edfb69a7e51ed18675cd833bf0bc4ea7082c` |
| `conformance/direct.mjs` | `f4ae2ebbab5f298db0a967d0babe790e35b9f35b8acd863ecb914cebda6b9b0d` |
| `conformance/module-loader.mjs` | `e69315c913728d20b946ddf24f75d4a9946b043c9cce849ae419aa71478ed76d` |
| `conformance/module-loader.test.mjs` | `ccd1eabed82d0848d4eb9e88efbfae170978dc2acff7133425f81c7863a71f09` |
| `conformance/run.mjs` | `966f98d5d3c83f85ee0f210bbc6ea0f1306e99c694b46f4a02ac9be63339be6b` |
| `conformance/scenarios.mjs` | `17bacdf9525c2eaf91518c7a8c65c63e1f5fe342f9ae683f538e54cb770673fa` |

Relevant dependency source hashes: keyed parent Go source `610064486c28cb8a2abe1dc7094d8cf37312ea852e7ab83335b7239c1bb9c3b9`; native CLI `9c9f263b79d707356ab2366d53865194c840b0c4cb2f97830b559dfef099ed55`; runtime host `615e2f4f02136d10ff019a4e8baf24868d48dbbd38355f79dd4bce52c0d3693b`; oracle `0a10bac1de674f75066df7a21d480d18a607c9590a33a0221e27242e25da7f9c`.

## Limits

This evidence covers a finite synchronous profile with keys `a` and `b` and the literal plus three listed seeds. It does not test asynchronous effects, trusted pointer/OS input, broader key counts, or long-running concurrency. `Children` is AppIR-reachable through `View`; `ReceiveKeyed` and `IsCurrent` are exported GoScript helpers whose emitted artifacts and source identities are pinned, but they are not admitted by the unchanged shared AppIR-reachability analyzer.
