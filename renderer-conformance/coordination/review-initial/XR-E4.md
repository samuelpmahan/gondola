# XR-E4 — Independent review of fixture matrix and renderer schedules

## Result: PASS

I found no counterexample in the Go fixture generator, Go-versus-JS admission differential, browser fixture gate, or additive renderer schedules. I did not edit E4 source files.

## Checks run

```sh
/tmp/gondola-go/bin/go test ./cmd/conformance-fixtures
/tmp/gondola-node22/node_modules/node/bin/node --test renderer-conformance/fixture-check.test.mjs renderer-conformance/scripts.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/fixture-check.mjs
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/fixture-check.browser.mjs
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/coordination/reports/XR-E4-probe.mjs
git diff --exit-code HEAD -- keyed-editor/scripts.mjs keyed-editor/scripts.test.mjs
```

Versions: Go 1.24.0, Node v22.23.4, Chromium 153.0.8010.0, React/ReactDOM 19.3.1.

## Findings

- The Go generator produces 36 fixtures: 7 valid, 29 rejected. The native CLI checked all 36; JS manifest admission compared the 33 JSON-object fixtures; the three raw-source cases were kept out of browser-object admission.
- The raw-only duplicate-field fixture is accepted by browser `JSON.parse` as an ordinary object with one `state` property, while Go rejects the raw bytes as a duplicate field. The malformed and trailing-value fixtures fail `JSON.parse` and are also rejected by Go. The fixture checker routes all three only through the native parser.
- All four whitespace mutations reject in both Go and JS: U+0085 and U+FEFF used alone as a click-handler message and as an input-binding message. JS reads the blank-rune set from the generated Go manifest.
- The exact limits agree at both boundaries: depth 64 and 4,096 nodes validate; depth 65 and 4,097 nodes reject in both implementations.
- Positive fixture HTML is created by `gobi.HTML(snapshot.Tree)` in Go. The browser parses that string through `<template>.innerHTML`, then compares the normalized markup with each renderer’s live `root.innerHTML`; it separately verifies snapshot equality, controlled input values, text input type, disabled properties, and disabled paths. This produced 7 successful renders each through DOM, React, and Go DOM (21 total). The 26 browser-object negatives were rejected before update, with unchanged DOM and snapshot for each backend (78 atomicity checks).
- The additive schedules preserve the keyed baseline module. The fixed schedule covers exactly `dom→react`, `react→dom`, `dom→godom`, `godom→dom`, `react→godom`, and `godom→react`; the focused reorder schedule visits React, Go DOM, then DOM. All 60 default generated scripts include a GoDOM actor transition and remain within 40 actions (maximum observed: 29).
- `keyed-editor/scripts.mjs` and `keyed-editor/scripts.test.mjs` match their HEAD blobs exactly. The reported hashes are `ad3d605252504153273eb4a8a015524cd5de802d` and `263cf3e61fbad4aab36f9176c253a5e607b14142`.

The machine-readable probe records per-fixture native results, Unicode mutant outcomes, boundary checks, expected HTML examples, schedule coverage, and the browser gate output in [XR-E4-probe.json](XR-E4-probe.json). The reusable review command is [XR-E4-probe.mjs](XR-E4-probe.mjs).

## Source and pack hashes

These match the E4 author checkpoint:

| File | SHA-256 |
| --- | --- |
| `cmd/conformance-fixtures/main.go` | `4fb12463c92c55669a29a4cceaf860b811b949d2451ba4db9953f6624d94530b` |
| `cmd/conformance-fixtures/main_test.go` | `56d8994b09d0ec60e52c3cb932021669449974673f6ef141b992f3db619a44ff` |
| `renderer-conformance/fixture-check.mjs` | `4de28b5760af8f7635ddaa10ffd977212563345c0cedff2c4772c4e5c16d5923` |
| `renderer-conformance/fixture-check.test.mjs` | `fee422d6696623d26ce4c5a1b8280c5e47d009d838dc04d7d7618b1adfa87dda` |
| `renderer-conformance/fixture-check.browser.mjs` | `354dd024e942716fcad1d255e6f5f9a6edfb54534d869063ee6331d4e66bd69c` |
| `renderer-conformance/fixtures.page.mjs` | `3ba1501b03059aeaa4bfec5f9742e3caca6aa275afaf15eb188426dcdc4db5fc` |
| `renderer-conformance/scripts.mjs` | `8e8c9441846aff08bc2f7318eb653d5210c576e49e1b58a25a08b53c0900a03d` |
| `renderer-conformance/scripts.test.mjs` | `3371c6ac81727eb827f40fd83df291a527d70a41875af4666634cb13f13b650f` |
| `renderer-conformance/build/fixtures.json` | `e39934b601015f591e7426e26e6da55e52be0197457acade8d50fd20c0b74204` |
| `renderer-conformance/build/manifest.json` | `f83f26473133be5959211806101566abf04f514cd00831407c2a45ff053a0261` |
| `renderer-conformance/build/godom.wasm` | `ae3b75e2a53718219ed8b0f3c44ef60ac373245f68ca03a746be4b2e5682e40e` |

## Limits

The browser fixture facade supplies static snapshots and no collection transitions. It proves actual rendering and atomic rejection for the three renderer implementations; state transitions, asynchronous HTTP, and live application behavior remain covered by the separate full Go application replay. Raw duplicate-key/malformed/trailing-byte cases cannot be meaningfully passed as browser objects after JSON parsing, so they remain native-only by design.
