# XR-E1 independent review

**Decision: ACCEPT.** I found no blocker in the E1 Go binding contract, editor transitions/session, or WASM boundary against `controlled-input/PLAN.md`.

## Contract review

- `inputbinding.Validate` requires canonical child paths, unique path/event bindings, `input` + `target.value`, a nonblank message, an existing `<input>` target, one exact `type="text"` attribute, one value attribute, and no literal handler collision at the bound event.
- `Resolve` uses the event step's `Value` only for the explicit dynamic binding. For unbound events it returns the declared `gobi.On` message and `Arg`; the inputbinding tests cover both behaviors. The resolver contains no application-specific message-name whitelist.
- The browser protocol currently uses exact supported tag and attribute spellings and exact `type="text"`, matching the Go binding validator. Its case-insensitive attribute helper is reached only after `validateAttributes` rejects names outside the exact allowlist.
- `editor.Update` implements edit, exact save, repeat-save count, reset, no effects, and unknown-message no-op. `View` has the frozen topology and one stable input binding.
- `Session.Dispatch` checks disabled state before resolving an action, does not append a message for a disabled control, and commits state/history only after validation and update checks. `Snapshot` rebuilds the view and returns copied message history; tests mutate returned state/tree/bindings/messages and verify the next snapshot is unchanged. The JSON envelope and field casing match the plan.
- `cmd/editor-wasm` publishes the expected `gobiEditor.init()` / `dispatch(step)` API. `decodeStep` handles JSON serialization and decoding failures as error objects, while session errors are also returned as `{error}`.

## Verification

Environment: Go `go1.24.0`, Node `v22.23.4`.

- `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH go test -count=1 ./inputbinding ./editor` passed.
- Built `cmd/editor-wasm` with `GOOS=js GOARCH=wasm` and called its real API through Go 1.24's `wasm_exec.js` in Node. `undefined`, `null`, number, string, array, function, Symbol, BigInt, a cyclic object, and an object whose `toJSON` throws all returned explicit error objects without terminating WASM. A valid edit dispatch after those calls succeeded, confirming the runtime remained usable. The replayable script is `XR-E1-probe.mjs`; its output is preserved in `XR-E1-probe.log`.
- Probed canonical and uppercase variants through both `inputbinding.Validate` and current `protocol.mjs` `validateSnapshot`: canonical `input`/`type`/`text`/`value` was accepted by both; uppercase tag, type/value attribute name, and type value were rejected by both.

No production files were changed during this review. The E1 Go contract/runtime is accepted without amendment.

## WASM probe replay

From the repository root, rebuild the assets and run the probe with Go 1.24 and Node 22:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build \
  -o controlled-input/build/editor.wasm ./cmd/editor-wasm
GOROOT_PATH=$(/tmp/gondola-go/bin/go env GOROOT)
cp "$GOROOT_PATH/lib/wasm/wasm_exec.js" controlled-input/build/wasm_exec.js
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
  node controlled-input/coordination/cross-review/XR-E1-probe.mjs
```

The probe expects those two build outputs and locates them relative to its own file path. To check its syntax first, run `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check controlled-input/coordination/cross-review/XR-E1-probe.mjs`.
