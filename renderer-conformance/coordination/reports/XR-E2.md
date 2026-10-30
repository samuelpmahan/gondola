# XR-E2 — Independent review of the Go/WASM DOM renderer

Reviewer: W1. Scope: `godom/**` and `cmd/godom-wasm/**`; no implementation files were changed.

## Review result

No blocking renderer or bridge defect was found in the current source and compiled WASM. The implementation directly reconciles DOM nodes from Go using `syscall/js` and the Go-owned `rendercontract`, `gobi`, and `inputbinding` packages. The reviewed packages do not import the collection package or contain collection transitions.

Source review covered exact bridge arity and `{error:string}` failures; root validation and singleton mount/unmount; global keyed element reuse and text-node child paths; input attribute ordering and controlled `.value` writes; callback routing from current DOM path/key; listener removal and `js.Func.Release`; logical focus/selection restoration; and renderer fencing after event failures. The compiled browser checks below exercised the observable paths independently of source reasoning.

## Actual Chromium probes

Toolchain: Go `1.24.0`, Node `v22.23.4`, Chromium `153.0.8010.0`.

The E2 real-Go smoke was rerun against the current compiled renderer and app WASM:

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  /tmp/gondola-node22/node_modules/node/bin/node \
  cmd/godom-wasm/smoke.mjs \
  renderer-conformance/build/godom.wasm \
  keyed-editor/build/keyed-collection.wasm \
  renderer-conformance/build/wasm_exec.js
```

It passed with `ok:true`, preserving keyed input objects and backward selection through reorder and completion, cleaning detached listeners, rejecting wrong arity for all eight bridge methods, rejecting an invalid snapshot before DOM mutation, and notifying the facade after a callback failure.

An independent probe used the current compiled `gobiCollection` and `gobiGoDOM` WASM runtimes together in Chromium:

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  /tmp/gondola-node22/node_modules/node/bin/node \
  renderer-conformance/coordination/reports/XR-E2-probe.mjs
```

The four update negatives—handler and binding messages containing only U+0085 or U+FEFF—each returned exact `{error:string}`. For all four, root HTML and real Go application state remained unchanged, the renderer fenced subsequent calls, and host notification stayed unset because these were host-invoked updates. The actual manifest was checked for both code points.

The browser instrumented live DOM writes on a real Go collection snapshot. Initial input writes were `aria-label`, `type`, then `value`; a subsequent changed Go value wrote the `value` attribute and then assigned `input.value`. The input ended with the Go snapshot value.

The probe then forced `document.createTextNode` to throw during paint after a real Go collection add dispatch. The DOM click returned an error, `rendererFailed` received the error, and the renderer fenced later calls. The real collection state changed from zero rows to one: the renderer does not roll back a Go dispatch that already committed. This is an observed failure boundary, not an implementation defect or a claim of atomic Go/DOM rollback; the failure stays visible and fenced.

Machine-readable observations are in [XR-E2-probe-results.json](./XR-E2-probe-results.json); the reproducible runner is [XR-E2-probe.mjs](./XR-E2-probe.mjs).

## Artifacts reviewed

The current compiled Go DOM WASM SHA-256 was `ae3b75e2a53718219ed8b0f3c44ef60ac373245f68ca03a746be4b2e5682e40e`; the generated manifest SHA-256 was `f83f26473133be5959211806101566abf04f514cd00831407c2a45ff053a0261`.

Reviewed source hashes:

| File | SHA-256 |
|---|---|
| `godom/renderer_wasm.go` | `43f5af0bed6c00246d9585727425f924972eef937344cbd44ef589c4037a91dc` |
| `cmd/godom-wasm/main_wasm.go` | `44ba6a4deef747c0b89e221e2949cb97d948c4113083a0bd521be3ddf98c38d2` |
| `cmd/godom-wasm/smoke.mjs` | `284cfb08cb4858d7115c0a556069d67af60090339f1974df16022ae680d8fd15` |
| `renderer-conformance/coordination/reports/XR-E2-probe.mjs` | `c8b0c44f7c2a66e19d4259fc02d6e99958a268b98b5bf7dbec886a68345b7f53` |
| `renderer-conformance/coordination/reports/XR-E2-probe-results.json` | `5d57c0d6030daee29e71b7eb4f6035643c5c43b570eae0a4d1d9da8b245dd087` |
