# XR-E5 initial independent review

## Decision

**AMEND.** The probes cover the requested renderer behaviors, but two assertions are too weak to distinguish the intended behavior from an unrelated implementation failure. E5 author repair is authorized. This initial review is superseded by `XR-E5-report.md` after targeted re-review.

## Proven probe-strength gaps

1. **Disabled native clicks do not prove the renderers avoided dispatch.** In `adversarial.mjs` lines 93–108, the probe clicks the actual disabled buttons and checks only that the Go snapshot and message history stayed unchanged. The Go session itself suppresses disabled events, so an incorrect renderer call to `runtime.dispatch` would still leave the same snapshot and pass. Instrument the real Go runtime with the existing `recordedRuntime` wrapper and assert zero dispatch calls after both clicks, as well as unchanged snapshot/history. This preserves the real browser control and real Go runtime path.

2. **Negative mount probes accept any truthy error.** In `adversarial.mjs` lines 217–230, each invalid fixture passes if `renderer(...)` throws anything; the observed first line is recorded but not checked. A renderer that fails for an unrelated reason on every fixture could satisfy these assertions. Assert a case-specific expected error pattern for each mutation.

   The input `Node.On` collision fixture at lines 203–205 is rejected earlier by the browser protocol's click-only handler rule, before the dedicated binding collision check. `adversarial.test.mjs` lines 59–62 uses a broad regex that allows that upstream error. The fixture does prove the snapshot is rejected, but it does not exercise the binding-collision diagnostic. Either assert the precise upstream rejection as the fixture's expected reason or use a shape that reaches the intended validation branch; describe only what the probe establishes.

## Reviewed behaviors that are meaningfully checked

- Literal button argument protection uses both DOM and React renderers with a wrapper over the actual Go runtime. It mutates the button's `value` and data attributes, checks the dispatched Save step still carries the declared empty literal argument, and checks Go's delivered message remains `save` with empty `Arg`.
- Detached input probes use the actual Go runtime behind `recordedRuntime`, save input nodes from each backend, swap renderers or unmount, dispatch native input events on those detached nodes, and assert no dispatch occurred and the host snapshot stayed unchanged.
- Failure fencing sends a native input event to each renderer with a runtime that returns a fixed error envelope. The probe checks the sentinel error is retained, the accepted snapshot stays unchanged, and a second native input event is fenced from redispatch.
- The Playwright typing probe types `abc` in DOM and `123` in React after a backend swap. After each character it checks the same element remains connected and focused, input property and Go draft match the full expected value, caret/selection are at the end, and the last Go message is the complete `edit` value. It explicitly resets caret after mounting each backend, matching the frozen within-backend scope.
- The expected browser error list is empty. The harness records every page error and Go error as a mismatch; no blanket error allowlist is present.

## Evidence

Targeted validation run by this reviewer:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --version
/tmp/gondola-node22/node_modules/node/bin/node --check controlled-input/adversarial.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/adversarial.test.mjs
```

Node was `v22.23.4`. Syntax check passed; adversarial Node tests passed **6/6**. The integrated browser probes were not rerun in this review because the root agent has the full browser suite in progress. Existing E4 author evidence reports 9/9 adversarial probes passed in a fixed-only Chromium diagnostic; it does not resolve the two assertion gaps above.
