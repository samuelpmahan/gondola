# XR-E3 initial independent review

**Decision: amend required.** The targeted React tests pass for the frozen editor case, but the React renderer's accepted snapshot set does not match the shared browser protocol and DOM renderer.

## Concrete mismatch

`protocol.validateSnapshot` accepts a bound text input with a true `disabled` attribute. The DOM renderer can render and suppress events for that input. `mountEditorReact`, however, rejects the same snapshot in `elementProps` with `disabled is supported only as a true button flag at 0`.

Reproduction under Node 22 using `controlled-input/build/react.bundle.mjs`:

```text
protocol= accepted
react= gobi React editor: disabled is supported only as a true button flag at 0
```

The validator also accepts `aria-label` on a button, while React rejects it with `aria-label is supported only on the editor input at 0`; the DOM renderer accepts the attribute. Both are valid protocol snapshots, so renderer parity fails before mounting.

The React path should align with the shared protocol and DOM behavior: support a true disabled flag on input and button, suppress input dispatch when the current target is disabled, and allow `aria-label` on supported elements (or move those restrictions into the shared validator and DOM renderer).

## Checks performed

Command:

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/react.test.mjs
```

Result: 3 tests passed, 0 failed. These cover initial invalid-tree rejection before `createRoot`, rejection of unsafe tags/attributes/events, native text entry using `currentTarget.value`, synchronous state updates, input-node identity, raw input HTML serialization, and literal click argument preservation.

The source review also confirms renderer-local dispatch errors set `lastError` and fence subsequent callbacks, and `unmount()` clears refs. I did not run the full two-seed cross-renderer harness in this review lane; its independent native-event and swap probes are covered by the harness/adversarial lane.

## Scope

No implementation or historical files were edited. The author has been notified and is repairing the two parity mismatches; this report preserves the initial amend decision for the review record.
