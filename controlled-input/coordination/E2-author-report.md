# E2 author report: browser protocol and DOM renderer

## Delivered

- Added `protocol.mjs` with strict snapshot, Gobi node, attribute, literal handler, message, and binding validation. The shared browser subset supports `div`, `p`, `input`, and `button`, text/fragments, the editor's inert attributes, and literal `click` handlers. It keeps application state and message names generic.
- Exported `validateSnapshot`, `clone`, `normalizePath`, `nodeAtPath`, `bindingAt`, `literalHandlerAt`, `isDisabled`, and the Gobi kind constants for downstream renderers.
- Added `dom.mjs` with `mountEditorDOM(root, runtime)` matching the renderer-host API. It patches stable nodes, reads bound input data from `event.currentTarget.value`, forwards literal `Arg` values unchanged, suppresses disabled events, and fences detached, stale, and unmounted nodes.
- The renderer validates the complete next snapshot before changing its accepted snapshot or DOM. A dispatch, validation, or paint error records `lastError()` and fences later events; a failed snapshot does not become the renderer's accepted state.
- Input attributes serialize as ordinary attributes, then `type`, then `value`, matching React's observed Chromium DOM output while leaving the snapshot's Go attribute order untouched.
- Added protocol and DOM unit tests with valid and invalid fixtures, event-value transport, literal-argument transport, focus and input identity across edits, disabled handling, stale-event fences, and failed-snapshot handling.

## Verification

Command:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/protocol.test.mjs controlled-input/dom.test.mjs
```

Result: 11 tests passed, 0 failed.

The E6 demo lane separately reported a passing browser smoke with DOM/React HTML equality and unsaved state retained across a renderer swap. E3 observed Chromium 153 input serialization as `aria-label`, `type`, then `value`; E2 implements that order.

## Scope

The browser validator deliberately rejects other tags, attributes, style declarations, keys, and literal event types. Those semantics are outside the frozen controlled-input milestone. This lane did not change Go application transitions, the backend host, or inherited files.

## E2 amendment: null dispatch results

The initial event router used `null` as its “no matching handler” sentinel. That also swallowed an invalid `null` returned by a declared runtime dispatch, leaving the renderer active and allowing another dispatch. `dom.mjs` now uses a private `NO_HANDLER` symbol for the no-handler case. A runtime `null` response reaches `validateSnapshot`, records `lastError()`, and fences further events while retaining the last accepted snapshot and DOM.

Added a regression test that sends two native input events to a runtime returning `null`. It verifies one runtime call, a retained validation error, and unchanged accepted state/HTML. The XR-E2 reviewer independently verified the repair. The reviewer also observed that an artificial DOM setter exception can leave a partially patched DOM while keeping the accepted snapshot unchanged and fencing events; rollback for failures inside DOM mutation remains outside this milestone.

Updated verification:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/protocol.test.mjs controlled-input/dom.test.mjs
```

Result: 12 tests passed, 0 failed.
