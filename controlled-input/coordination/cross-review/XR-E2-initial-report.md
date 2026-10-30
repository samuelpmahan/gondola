# XR-E2 initial independent review

**Decision: amend required.** The initial E2 source and Node 22 tests otherwise matched the frozen editor protocol and the intended synchronous DOM event flow, but a null runtime dispatch result was treated as “no handler” and did not fail closed.

## Review scope and evidence

Reviewed `controlled-input/protocol.mjs`, `dom.mjs`, `protocol.test.mjs`, `dom.test.mjs`, and the direct Go contract in `inputbinding/binding.go`, `editor/editor.go`, `editor/session.go`, and `cmd/editor-wasm/main_wasm.go`.

Ran the focused suites with Node **22.23.4**:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/protocol.test.mjs controlled-input/dom.test.mjs
```

The initial source passed all **11 tests**. The tests cover currentTarget value transport, literal `Arg`, disabled event suppression, stable input identity/focus across normal edits, detached and unmounted listener fencing, raw input HTML order, and preservation of the last accepted snapshot/DOM for an error-object dispatch result.

An additional Chromium **153.0.8010.0** repro used a valid root `<input type="text" value="">` snapshot with an `input`/`target.value` binding and a runtime whose `dispatch()` returned `null`. Two native input events produced `calls: 2`, `lastError: null`, the original accepted snapshot, and unchanged HTML. A null dispatch result is an invalid snapshot, so the first event should set `lastError()` and fence the renderer; subsequent events should not reach the runtime.

## Findings

### XR-E2-1 — null dispatch results bypass snapshot validation

`dispatchForEvent()` returns the runtime's dispatch result for a declared binding or literal click. `handleEvent()` then treats `result === null` as the no-handler sentinel and returns before `validateSnapshot(result)`. Because a listener is only attached for a declared binding or literal handler, a null result in this path comes from the runtime and must be rejected. The reproducer confirms it leaves the renderer active and repeats the dispatch on later input events.

**Required amendment:** distinguish “no handler” from any runtime result (for example, with a unique sentinel), so a runtime `null` reaches snapshot validation and fences the renderer. Add a regression test asserting one runtime call across two events, preserved last accepted snapshot/DOM, and a recorded error.

## Other reviewed behavior

- The protocol rejects unsupported tags, attributes, styles, keys, non-click literal events, malformed/colliding/duplicate bindings, noncanonical paths, and runtime-error snapshots. It leaves application state and message names generic, as required.
- The DOM renderer reads `event.currentTarget.value` only for a declared binding and forwards literal `On.Arg` unchanged. It checks both the protocol disabled flag and the live DOM `disabled` property.
- Normal typing patches the existing input element and avoids assigning an unchanged `.value`, preserving focus and caret. Detached elements are fenced by both element identity and root containment; unmount removes listeners.
- Initial snapshots are validated before painting. Invalid returned snapshots leave the previous accepted snapshot and DOM intact; a recorded error fences later events. Painting is incremental, so a separate DOM API exception midway through a valid paint could leave partial actual DOM while the accepted snapshot stays previous. The lane tests do not claim rollback for that environment failure; callers can inspect `lastError()`.
- Input attributes serialize as `aria-label`, `type`, then controlled `value` to match React's observed Chromium `innerHTML`; the Go Node attribute order remains unchanged.
- Go snapshots serialize the expected `{state, tree, bindings, messages}` envelope, PascalCase nested fields, `null` nil Node slices, and an empty non-nil message list. The browser subset accepts the Go editor's view without message-name whitelisting.

The finding was sent to the E2 author and root. This initial report is preserved; a separate final report will record the independent recheck.
