# XR-E2 final independent review

**Decision: accepted after amendment.** The preserved initial review is [XR-E2-initial-report.md](XR-E2-initial-report.md), which records the null-result defect and its initial Chromium repro. E2 added a unique `NO_HANDLER` sentinel so a missing declared handler remains distinct from a runtime `null` result. Runtime `null` now reaches `validateSnapshot`, records `lastError()`, and fences later events.

## Final focused verification

Ran the source-frozen protocol and DOM suites with Node **22.23.4**:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/protocol.test.mjs controlled-input/dom.test.mjs
```

Result: **12 tests passed, 0 failed**. The added regression test verifies that a `null` runtime result causes exactly one dispatch across two input events, leaves the last accepted snapshot and HTML unchanged, records the protocol error, and fences later input.

Replayed the original null-result case in Chromium **153.0.8010.0** under Node 22.23.4. After two dispatched input events, it now reports `calls: 1`, `lastError: "controlled input protocol: snapshot must be an object"`, the prior state, and byte-identical prior HTML. This independently confirms the sentinel change prevents the defect observed in the initial review.

Also ran the E3 browser test against the current source and built React bundle:

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/react.test.mjs
```

All **3 tests passed**. Its browser fixture mounts React and DOM side by side with a shared-protocol-valid disabled text input and a button carrying `aria-label`. Their raw `innerHTML` and disabled paths match, and programmatic input events on both disabled inputs cause zero runtime dispatches.

The E6 demo evidence separately covers the Go/WASM happy path through eight observed states, with ordinary DOM and React typing, repeated saves, renderer swaps, and live DOM matching each selected renderer.

## Contract review

- The browser protocol validates exact snapshot envelopes, plain JSON state, message shapes, full Gobi node data, the finite tag/attribute/literal-click subset, binding uniqueness and target semantics, and canonical child-index paths. It leaves state shape and application message names generic as required by the protocol boundary.
- The Go editor snapshot uses `{state, tree, bindings, messages}`, PascalCase nested fields, the one `input`/`target.value` binding, and Go's nullable Node slices. The browser validator accepts this shape and rejects unsupported binding sources/events. The editor's literal click `Arg` is transported unchanged by the DOM renderer.
- DOM input dispatch reads the live `event.currentTarget.value`. Disabled controls are suppressed using both the protocol flag and live DOM property. Stable path reconciliation preserves the input node, focus, and selection during normal edits. Detached events are fenced by path identity and root containment; unmount removes native listeners.
- Invalid initial snapshots are rejected before painting. Invalid dispatch snapshots—including `null` after the amendment—preserve the last accepted snapshot and DOM, set an error, and fence later events.

## Error boundary

Painting is incremental. I injected a DOM text-node setter exception midway through a valid paint in Chromium: the accepted snapshot stayed at its previous value and `lastError()` was set, while `domSnapshot().html` honestly reflected the partial live DOM (the input value had updated and a later paragraph had not). The renderer then fenced later events. This is distinct from an invalid snapshot, which is validated before paint and leaves the old DOM intact. The lane provides no rollback guarantee for an exceptional DOM API failure during paint; that behavior is now explicit and did not block acceptance.
