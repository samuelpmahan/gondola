# Multi-root Go session composition

## Intent

Gondola already proves that one Go-owned keyed editor can run through JavaScript DOM, React 19.3.1, or a direct Go/WASM DOM renderer. The next boundary is composition: multiple Go application sessions must remain independently usable in one browser realm while each root can replace its renderer, issue effects, retain focus, and unmount without changing another root.

This milestone exists to make ownership explicit. Application state and transitions remain in Go. JavaScript owns browser scheduling, DOM roots, renderer selection, and HTTP transport. A session-scoped contract binds every browser callback and effect to one Go session so identical row and request numbers in different sessions cannot alias.

## Goals

- Run at least three simultaneous Go collection sessions from one Go/WASM application manager.
- Give every session a typed Go `SessionID`, independent collection state, outbox, audit, transport namespace, renderer lease, and lifecycle.
- Let DOM, React, and GoDOM be selected and replaced independently per root.
- Permit multiple simultaneous GoDOM renderer instances in one browser realm.
- Cancel only the disposed session's pending requests, reject late callbacks, detach its renderer, and leave sibling state, DOM, focus, requests, and queued work unchanged.
- Recreate a fresh session in a vacated root without reviving disposed callbacks or state.
- Replay deterministic interleavings against an independent React reference for state, Gobi trees, bindings, ordered messages, audits, transport order, DOM, disabled controls, focus, and lifecycle events.
- Preserve every existing delivery receipt and default regression entrypoint.

## Non-goals

This does not add nested component composition inside a Gobi tree, cross-session transactions, shared application state, server authentication, hydration, IME, pixel equivalence, other browser engines, or rollback after a committed Go transition. It does not make renderer metadata a proof of arbitrary implementation correctness.

## Chosen architecture

`multisession.Manager` is a Go-owned registry over existing `collection.Session` values. `SessionID` is a distinct safe-integer type. `Create`, `Snapshot`, `Dispatch`, `Effects`, `Complete`, `Audit`, and `Dispose` all require an existing ID. IDs are monotonic and never reused by one manager. Disposal removes the session only after returning its pending cancel commands; later calls and replies for that ID fail without affecting other sessions.

`cmd/multi-root-wasm` exposes the manager as a strict JavaScript bridge. Browser objects carry a primitive session ID plus existing step/reply objects. Errors use the repository's exact `{error: string}` frame. HTTP codecs remain Go-owned and unchanged.

`cmd/godom-wasm` changes its bridge from a singleton method table to `mount(root, facade) -> renderer API`. Each returned API closes over one `godom.Renderer`. Unmount is idempotent for that instance, and one instance's fence or cleanup cannot address another. `renderer-conformance/adapter.mjs` accepts the instance form and retains a compatibility path for the already published singleton test doubles while all real WASM gates exercise instance handles.

`multi-root/host.mjs` creates a composition object around one manager bridge. Each root record owns its session ID, keyed host, transport, selected renderer, lifecycle generation, and callback fence. The existing keyed host remains the per-root engine. A small runtime facade scopes manager calls to one session. The composition layer never interprets application messages or state.

The deterministic harness runs three actual Go sessions in isolated actor contexts plus an independent React reference model. Fixed scripts cover identical IDs across sessions, simultaneous held saves, all directed renderer changes, focused inputs, disposal during held work, late replies, sibling continuation, root reuse, repeated mount/dispose, and failure isolation. Seeded scripts extend interleavings without replacing the fixed witnesses.

## Rejected alternatives

Running a separate collection WASM instance per root would prove browser isolation but avoid a Go composition contract and multiply runtime boot state. It remains a useful negative/control probe, not the milestone architecture.

Keeping the GoDOM singleton and serializing access would make simultaneous roots observationally dependent and prevent independent failure isolation.

Adding component nesting now would mix two boundaries. This milestone establishes session/root ownership first; nested component/message ownership can build on its receipts.

## Acceptance

The default runner executes all inherited checks before the new Go, bridge, Node, fixture, demo, and browser replay gates. Acceptance requires zero parity mismatches, no missing required channels, exact native Go comparisons, explicit negative controls that fail when session IDs or callback fences are removed, preserved Milestone 0 SHA-256 receipts, six independent cross-reviews, and fresh GitHub Actions on the exact published tree.
