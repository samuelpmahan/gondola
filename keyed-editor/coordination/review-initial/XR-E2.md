# XR-E2 independent review

**Decision: ACCEPT.** I found no blocker in E2's keyed browser protocol or DOM renderer against the frozen keyed-editor plan. This review did not modify E2 production or test files.

## Review findings

- `protocol.mjs` delegates the original finite snapshot, node, attribute, binding, handler, path, state, and message validation to the controlled-input validator using a copy with node keys blanked. It then validates original element keys as globally unique ASCII tokens and requires text and fragment keys to remain empty. Clones retain keys; the shared lookup helpers resolve the current path by key.
- `dom.mjs` retains compatible elements by key during reconciliation. A moved row and its input keep the same DOM objects. Event listeners look up the event target's current path from the post-patch mapping and include the current element key, so a moved control emits the new path/key pair.
- Removed or detached controls are fenced by the current path map and root containment check; their listeners are removed during reconciliation. Disabled controls are suppressed using both the protocol node and live DOM property.
- Focus capture records the active input's key and selection range/direction. Updates restore it only if that enabled input still exists. Deleting the focused row leaves focus unset rather than assigning focus to another row.
- Invalid snapshots are validated before patching and leave the accepted snapshot and DOM unchanged. An exception during incremental DOM mutation fences the renderer; no rollback guarantee is claimed.

## Verification

Environment: Node `v22.23.4`, Chromium `153.0.8010.0`. Commands ran from the Gondola repository root. The Chromium executable was provided explicitly because Playwright's default browser cache is empty in this container.

### Node 22 source suites

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
node --test keyed-editor/protocol.test.mjs keyed-editor/dom.test.mjs \
  controlled-input/protocol.test.mjs controlled-input/dom.test.mjs
```

Result: **23 tests passed, 0 failed**. This includes the inherited controlled-input tests and E2's key validation, keyed reorder, current path/key dispatch, stale/detached event, focus/selection, disabled, and invalid-update cases.

### Isolated Chromium and negative probe

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
node keyed-editor/coordination/reports/XR-E2-probe.mjs
```

Result: passed in Chromium `153.0.8010.0`. The probe builds a temporary DOM bundle and serves it from an ephemeral local server; it removes the temporary build after execution. It verified native focus and backward selection through keyed reorder, same-object retention through reorder and a deferred `update(snapshot)` completion-like update, current `Path: "2/0/0"` plus `Key: "row-2-input"` after movement, disabled input/button suppression, no rendered key attributes, removed-control suppression after its path is reused, no focus transfer when the active row is removed, and key-based focus/selection restoration onto a new DOM node after remount. A duplicate-key update was rejected before changing the accepted snapshot or HTML.

The valid keyed fixture was accepted; five malformed snapshots were rejected: duplicate key, unsupported `script` tag, unsupported `onclick` property, non-text input type, and an input binding pointed at a non-input path. The isolated probe and its temporary bundle do not write shared traces or generated assets.

## Limits

- The browser probe uses a JavaScript runtime fixture and deferred snapshot update; it does not run Go/WASM or the live HTTP lab. The E5 composed harness remains necessary for Go path/key rejection and actual HTTP completion.
- Native focus behavior was checked in Chromium only. IME composition, other browser engines, and pixel output were not tested.
