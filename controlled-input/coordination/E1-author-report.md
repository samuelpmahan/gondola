# E1 author report — Go contracts, editor, and WASM runtime

## Implemented

- `inputbinding/` defines the typed `Source` (`TargetValue == "target.value"`), `Binding`, and `View` sidecar. `Validate` rejects duplicate bindings, malformed/out-of-range paths, blank message names, unsupported event/source semantics, invalid text input targets, duplicate/missing value/type attributes, and collisions with a literal handler at the bound event. `Resolve` reads `gobi.Step.Value` for `target.value`; otherwise it returns the matching `gobi.On` message with its declared literal `Arg` unchanged. The generic resolver does not whitelist application message names.
- `editor/` implements the frozen `State`, `Init`, `Update`, and stable five-child view topology. The input has no literal `On`; its binding is `0/input/edit/target.value`. Save stores the exact non-empty draft and increments on every save. Reset clears state. Unknown messages preserve state.
- `editor.Session` owns state and cumulative ordered messages. Snapshots use lowercase top-level JSON keys `state`, `tree`, `bindings`, and `messages`; nested Go fields retain their default PascalCase names. Empty message history is a non-nil slice and serializes as `[]`. Snapshots copy the message history and rebuild the view, so mutations to returned values do not alter the session. Disabled events are suppressed, and failed dispatches are atomic.
- `cmd/editor-wasm/` publishes `globalThis.gobiEditor.init()` and `.dispatch(step)`. Each `init()` creates a fresh zero-state session. Dispatch accepts Go's `gobi.Step` JSON fields (`Path`, `Event`, `Value`) and returns a snapshot or `{error: ...}`. Non-JSON-serializable step values are returned as errors instead of escaping the JS callback.

## Tests and build evidence

Toolchain: `go version go1.24.0 linux/amd64` from `/tmp/gondola-go/bin/go`.

Tests were written before implementation. The first targeted run failed because `inputbinding` and `editor` had tests but no implementation files. After implementation, this command passed:

```sh
/tmp/gondola-go/bin/go test ./...
```

All packages passed, including `inputbinding`, `editor`, `interaction`, `gobi`, `reactmap`, and `wire`. The new Go tests cover supported and negative binding contracts, malformed and out-of-range paths, duplicate/colliding/unsupported bindings, dynamic values, unchanged literal arguments, exact editor topology and attributes, repeated saves, empty save, unknown message, reset, disabled controls, ordered message history, atomic failure behavior, JSON envelope casing, and snapshot mutation isolation.

The browser build passed:

```sh
GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/gobi-editor.wasm ./cmd/editor-wasm
```

Formatting check passed with no output:

```sh
/tmp/gondola-go/bin/gofmt -d inputbinding editor cmd/editor-wasm
```

## Scope and handoff

E1 changed only `inputbinding/`, `editor/`, `cmd/editor-wasm/`, and this authorized report. It did not change the original counter, interaction session, Gobi Node/On types, signatures, receipts, or other inherited files. Runtime behavior has been compile-checked; the browser renderers, native typing/focus behavior, and browser replay are owned by downstream lanes and are not claimed by this report.
