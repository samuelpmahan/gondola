# XR-E3 — independent review of E3 adapter and admission

## Verdict: PASS

Independent review found no blocking source counterexample. No E3 source was
changed. Initial findings below were recorded before any repair; no repair was
needed.

## Initial findings before repair

- The E3 adapter, protocol, and registry hashes match the author’s frozen E3
  report.
- Negotiation validates the Go-generated profile and descriptor protocol,
  version, capabilities, and methods before entering `createKeyedHost`, so an
  incompatible declaration cannot call application `init`, mount a candidate,
  or access the transport.
- The registry passes the original runtime object to `createKeyedHost`, which
  preserves the existing WeakMap lease identity. The adapter passes the
  original facade, including `rendererFailed`, to GoDOM.
- The main review risks were the Go/JavaScript blank-name policy boundary,
  lease ownership across legacy and negotiated hosts, and whether malformed
  snapshots notify/fence through the real renderer path. Those were tested
  below; none produced an E3 source repair request.

## Go-generated manifest and policy probes

The review built `cmd/render-contract` from the current Go source and used its
`manifest` and `validate` commands. The generated manifest compared equal to
both `renderer-conformance/build/manifest.json` and the E4 fixture bundle’s
manifest. It contains 26 ordered blank-name code points, including U+0085 and
U+FEFF. This review did not use a hand-authored JavaScript manifest as proof
of Go policy.

The independent matrix checked handler and binding names against both the
manifest-driven JavaScript validator and the native Go CLI:

| Message case | Handler | Binding |
|---|---:|---:|
| empty | pass | pass |
| ASCII whitespace run | pass | pass |
| U+0085 | pass | pass |
| U+FEFF | pass | pass |
| U+00A0 | pass | pass |
| U+2003 | pass | pass |
| U+200B | pass | pass |
| ordinary name | pass | pass |

`pass` means both JS and Go agreed with the Go-generated rune set. There were
16 field/case comparisons and zero disagreements. The same fresh Go CLI then
checked all 36 E4 fixtures: 36 native checks, 33 JavaScript object comparisons,
and 3 raw-JSON-only negatives; all outcomes matched.

## Lifecycle probes

The native probe uses the actual Go CLI manifest and records call counters:

- Bad descriptor protocol, version, capability, or method, and unsupported
  manifest protocol/version all rejected before application init, renderer
  mount, or transport activity.
- Legacy-then-negotiated and negotiated-then-legacy host creation both shared
  the same runtime lease. Rejected second hosts did not call `init` or mount.
- An initial fragment outside the Go-generated node-kind set was rejected
  after the one allowed application init but before candidate mount; the
  host cleared the root and made no transport calls.
- A class-private branded runtime retained access to its private state, and
  its nested opaque JSON state was returned unchanged. This would fail if the
  registry passed a wrapper object as the runtime receiver.
- A runtime result that passed the inherited keyed checks but exceeded the
  Go-generated depth limit was rejected by the checked facade. The renderer
  notified the keyed host, was unmounted, and fenced queued effects: zero
  `effects()` calls and zero transport starts.

The targeted Chromium probe used the actual `cmd/collection-wasm` application
runtime and actual compiled GoDOM WASM. It created a negotiated host with the
existing JS DOM and GoDOM, added and edited a row through real Go collection
dispatches, and swapped DOM → GoDOM → DOM. Both swaps changed the physical input
element while preserving the Go-owned draft, serialized HTML, logical input
key, focus, selection range, and direction. The transport stayed idle.

Observed browser result:

```json
{"ok":true,"appRuntime":"actual cmd/collection-wasm","initialBackend":"dom","swaps":["dom->godom","godom->dom"],"dispatchCalls":2,"opaqueState":{"Rows":[{"ID":1,"Draft":"opaque Go collection draft","Saved":"","Saves":0,"PendingID":0,"Status":"idle"}],"NextID":1,"NextRequestID":0},"domToGoDOMFocus":{"key":"row-1-input","selectionStart":3,"selectionEnd":10,"selectionDirection":"forward"},"goDOMToDOMFocus":{"key":"row-1-input","selectionStart":3,"selectionEnd":10,"selectionDirection":"forward"},"physicalInputChangedEachSwap":true,"serializedHTMLStable":true}
```

The native malformed-dispatch probe uses a bounded runtime stub only to drive
the registry failure boundary; it does not model collection transitions. The
browser swap’s application state transitions are all from the Go collection
WASM runtime. This review did not rerun the complete E5 HTTP replay; E5/root
owns that gate.

## Commands and toolchain

Toolchain: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`.

```sh
/tmp/gondola-go/bin/go build -o /tmp/xr-e3-render-contract ./cmd/render-contract
RENDER_CONTRACT_BIN=/tmp/xr-e3-render-contract \
  /tmp/gondola-node22/node_modules/node/bin/node \
  renderer-conformance/coordination/reports/XR-E3-probe.mjs

/tmp/gondola-node22/node_modules/node/bin/node --test renderer-conformance/*.test.mjs
RENDER_CONTRACT_BIN=/tmp/xr-e3-render-contract \
  /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/fixture-check.mjs
/tmp/gondola-go/bin/go test ./rendercontract ./cmd/render-contract

GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/xr-e3-godom.wasm ./cmd/godom-wasm
GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/xr-e3-collection.wasm ./cmd/collection-wasm
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  /tmp/gondola-node22/node_modules/node/bin/node \
  renderer-conformance/coordination/reports/XR-E3-probe-browser.mjs \
  /tmp/xr-e3-godom.wasm /tmp/xr-e3-collection.wasm \
  /tmp/gondola-go/lib/wasm/wasm_exec.js
```

Results: E3/E4 focused Node suite **30/30 passed**; fixture checker **36/36
native, 33/33 JS comparisons**; Go contract/CLI tests passed; both WASM builds
and the actual GoDOM host-swap browser probe passed.

## Source hashes

E3 source hashes match the E3 freeze report:

| File | SHA-256 |
|---|---|
| `renderer-conformance/adapter.mjs` | `eb05f483296a9038aa597b5db46897a386c2a26ae5e5ff0dbc987a4546f79bf1` |
| `renderer-conformance/protocol.mjs` | `d54d1dbcea52683a88e42f1bce31df44533bbd3d678ede6b7f7d9a0266c53df9` |
| `renderer-conformance/registry.mjs` | `9d7d728628c59f1735e5bd3651f87030bfdd9e4d6bb5e5e639e44f8611887a71` |

Review diagnostics:

| File | SHA-256 |
|---|---|
| `renderer-conformance/coordination/reports/XR-E3-probe.mjs` | `0ec379fc2d5a38d661adc4aa6b2116fc770d64efd93fe6afe52c78448cc29bbd` |
| `renderer-conformance/coordination/reports/XR-E3-probe-browser.mjs` | `4fbf101fdf2044abdc245119c8031e541a801b5924705e66051bb07c4a2d43b1` |
| `renderer-conformance/coordination/reports/XR-E3-probe-browser.html` | `b654ed2b176d7d5660c12760d2ec6f72dcd8015e5990af5171fee849b5a25ed7` |
