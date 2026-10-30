# E3 React renderer author report

## Implementation

Added `controlled-input/react.mjs` exporting `mountEditorReact(root, runtime)` with the backend replacement interface: `snapshot()`, `domSnapshot()`, `click(path)`, and `unmount()`.

The adapter validates and clones each complete editor snapshot with `protocol.mjs`, then builds the initial React element tree before calling `createRoot`. Its local renderer also rejects unsupported tags, attributes, flags, styles, and non-click `Node.On` handlers. Input edits read `event.currentTarget.value`, resolve the declared `input` binding, and synchronously dispatch `{Path, Event, Value}` to the runtime. React's controlled-input warning is prevented with a no-op `onChange`; state changes still travel only through `onInput` and the Go snapshot. Literal button clicks send the declared `Arg`. Path keys and stable refs preserve the input element during ordinary edits. The adapter uses React and ReactDOM 19.3.1 with `flushSync`.

Added `controlled-input/react.test.mjs` with pre-`createRoot` rejection and reusable-root checks, negative cases for unsupported tags/attributes/events, and a real Chromium test that types Unicode and escaped text, checks synchronous Go-shaped snapshots and exact input steps, verifies input-node identity, and clicks Save to check literal `Arg` handling.

## Verification

Built the browser bundle with the repository's pinned esbuild and ran:

```sh
NODE_PATH=interaction/node_modules interaction/node_modules/.bin/esbuild controlled-input/react.mjs --bundle --format=esm --platform=browser --outfile=controlled-input/build/react.bundle.mjs
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/react.test.mjs
```

Result: **3 tests passed**. The browser test ran with Node 22.23.4, React/ReactDOM 19.3.1, esbuild 0.28.2, and Chromium 153.0.8010.0. It observed no browser errors or React warnings. For input Node attributes `[type, value, aria-label]`, React's actual `root.innerHTML` order is `aria-label`, `type`, then controlled `value`; this observation was sent to E2 for raw DOM/ref parity.

The browser fixture uses a deterministic synchronous runtime stub. It verifies renderer event transport and React behavior; it does not claim Go/WASM integration. Actual WASM parity and the full demo smoke are covered by the E4/E6 integration run.

## Scope

Stable input identity is verified for normal edits. Focus/caret preservation across renderer swaps, IME composition, and concurrent scheduling remain outside this renderer's scope as stated in the plan.

## XR-E3 amendment and recheck

The independent XR-E3 review found that the shared protocol accepted `disabled` on `input` and `aria-label` on any supported element, while React's local converter rejected those snapshots. The React renderer now accepts true `disabled` flags on `input` and `button`, accepts `aria-label` on all protocol-supported tags, and suppresses native callbacks whenever either the current Node flag or live `currentTarget.disabled` is true.

The Chromium fixture now mounts the same protocol-valid snapshot in React and DOM with a disabled input and an `aria-label` button. It verifies identical raw `innerHTML`, matching disabled paths, and zero runtime dispatches when an input event is sent to either disabled input. The XR-E3 reviewer independently reran the Node 22/Chromium test and accepted the amendment; the preserved finding and recheck are recorded in `controlled-input/coordination/cross-review/XR-E3-report.md`.
