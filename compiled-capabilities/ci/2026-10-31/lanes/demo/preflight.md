# E-RESULT-DEMO preflight

**Status: awaiting current-source full-run artifacts. This is preparation only; it is not an acceptance receipt.**

## Run binding

- Local full session: `45031`
- Local attempt: `compiled-capabilities/builds/attempts/attempt-20261031T095356051Z`
- Published source commit: `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`
- Published source tree: `d22b75e18c7bea70a743cc79d53461b287c7d045`
- Hosted primary run: `41190743932`; N4 reports it is still in progress and has no artifact yet.

The prior feasibility demo at `compiled-capabilities/coordination/reviews/XR-DEMO/` is not full-run evidence. It must not be used to satisfy this lane. N4 owns downloading and cataloging the authoritative completed hosted artifact; final review will use the immutable paths N4 supplies and cross-check the local full attempt where available.

## Required evidence

1. Build metadata binds the current compiled build manifest, AppIR, compiled lifecycle module, encoder, demo source pins, React backend, package path, capabilities, and bundle hash to the current attempt/source.
2. Runtime evidence identifies React and ReactDOM as `19.3.1` and reports `status: passed` with exactly eight scenario checks.
3. Captured HTTP requests show `/`, `/demo.css`, and `/demo.bundle.mjs` each returned nonempty `200` responses.
4. The disabled pending request button ignores an injected click: the event trace and outstanding request remain unchanged.
5. React renderer admission succeeds. An incompatible profile missing `view.node` is rejected during admission while preserving the live React renderer, original control node, Go state and view, pending token, and event trace. A subsequent physical click on the preserved control still dispatches to Go.
6. React-to-DOM recovery succeeds without a state, trace, or pending-token change; completing the request produces the correlated Go reply after the expected ordered events and dispatch IDs.
7. Browser errors, console errors, failed requests, WebAssembly requests, and the no-Wasm guard are all empty/clear.
8. The screenshot is opened and inspected as a visual record. It is an observation of the rendered UI, not a pixel-equivalence claim.

## Source contract

The smoke implementation in `compiled-capabilities/demo/smoke.mjs` defines the eight checks and assertions above. The earlier XR-DEMO receipt recorded these demo source hashes:

| File | SHA-256 |
|---|---|
| `compiled-capabilities/demo/app.mjs` | `f34d9deafdac14e6c7d24ff73a8926ca3035db1313e9ed8ea135a4ddae1b1092` |
| `compiled-capabilities/demo/build.mjs` | `b6f5f49048418e20e59c6f09e9fea753610015fef8ceecb611d9da8c01912326` |
| `compiled-capabilities/demo/demo.css` | `3c36b27dc9297f363e3a7e1dd770101c2433e830b0deca337b5801a8d58b26e0` |
| `compiled-capabilities/demo/index.html` | `68ebf6373b4a666ab49fa2f618aad9fce96ccb8be9281b4c8e5692c4e2155b11` |
| `compiled-capabilities/demo/smoke.mjs` | `a801bd23e4b209a082c01abebe8157282a3d2ae75f4a01e8de72f29ad6254cc8` |

These hashes describe the earlier implementation checkpoint only. Final acceptance must verify the full-run build's own source pins and source/tree binding; no conclusion about the current full attempt is drawn here.
