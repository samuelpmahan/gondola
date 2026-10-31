# Publications GoScript compiler/encoder probe design

This lane proves the existing build CLI emits the new Go-owned publications component for both React and DOM and that the generated encoder accepts actual GoScript state values. It does not implement a JavaScript state model or transition reducer.

## Build outputs

Run the existing `compiled-frontend/cmd/gobi-build` CLI once per backend. Requests and captured outputs live here:

- `compiled-publications/compiler/build/react-request.json`
- `compiled-publications/compiler/build/dom-request.json`
- `compiled-publications/compiler/build/react.stdout.json` / `.stderr.log` / `.exit-code`
- `compiled-publications/compiler/build/dom.stdout.json` / `.stderr.log` / `.exit-code`
- `compiled-publications/compiler/build/react/`
- `compiled-publications/compiler/build/dom/`

Each output root must contain its own `buildmanifest.json`; use `apps[]` paths from that manifest rather than guessing generated component directories. The request entry package is `github.com/samuelpmahan/gondola/fixtures/compiled/publications`, with `sourceRoot: ".."` when invoked from `compiled-frontend`.

The intended CLI form is:

```sh
GOTOOLCHAIN=go1.27.3 GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node \
  /tmp/gondola-go/bin/go run ./cmd/gobi-build \
  < ../compiled-publications/compiler/build/react-request.json \
  > ../compiled-publications/compiler/build/react.stdout.json \
  2> ../compiled-publications/compiler/build/react.stderr.log
```

Repeat with the DOM request/output names. Capture compiler, Node and Go versions; hash the Go fixture and scenario inputs before and after both builds; hash each manifest and each manifest-referenced AppIR, encoder, component metadata and compiled module.

## Runtime proof

The probe imports the actual `gobi-compiled.mjs` and `encoder.mjs` named by each build manifest, resolves the AppIR init/update/view symbols, and applies the frozen fixture scenario messages directly through the generated GoScript `Update`. After each update, call `gobiEncodeState` on the returned actual GoScript state. Record the complete canonical `Value`, effects, and relevant GoSlice descriptors for `Children` and `Publications`; assert the encoded slice lengths and nil/empty flags match the actual values. Check every declared state field, publication snapshot, generation, input revision, accepted/rejected count, and typed uint64/float64 value through the encoded output.

Use the N1 native scenario trace as the state/effect comparison reference when its exact schema and fixture hashes are frozen. Convert encoder `float64Bits` to exact IEEE-754 values for structural comparison; preserve safe integer fields without rounding. React and DOM must encode identical canonical states/effects and the same actual GoScript slice descriptors across all fixture steps. The probe reads N1's messages and result states; it contains no state transitions of its own.

## Scope boundary

This is a targeted compiler/encoder proof. N4 owns native/direct/React/DOM replay and interaction mutations; N5 owns the independent literal oracle; N6 owns the demo, inherited runner, CI, and docs. No full inherited local pipeline runs in this lane. Generated proof outputs stay under `compiled-publications/compiler/build/`; this nested `go.mod` keeps generated Go forwarding files out of the repository-root `go test ./...` package walk.
