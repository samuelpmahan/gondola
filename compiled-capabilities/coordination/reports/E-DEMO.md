# E-DEMO: Capability negotiation demo

**Outcome: mixed_change.** The demo mounts the actual compiled Go lifecycle module through the existing lifecycle host and shared DOM/React renderers. It lists the module's AppIR requirements, the lifecycle host's frozen effect support, and the active renderer's view support. A compatible DOM→React swap succeeds; a copied React renderer candidate declaring an empty `viewCapabilities` profile is rejected during admission. The existing React DOM node, Go counter, pending request, logical view, and Go tick trace remain in place. The smoke then dispatches through the old control, recovers with React→DOM, and completes the original request into Go `Update`.

## Commands and evidence

- Syntax check, Node v22.23.4: `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-capabilities/demo/app.mjs && /tmp/gondola-node22/node_modules/node/bin/node --check compiled-capabilities/demo/build.mjs && /tmp/gondola-node22/node_modules/node/bin/node --check compiled-capabilities/demo/smoke.mjs` — passed.
- Build: `/tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/demo/build.mjs --compiled compiled-capabilities/builds/feasibility/react/output --output /tmp/gondola-capabilities-demo-debug/site --backend react` — passed. The emitted bundle was 1,846,094 bytes, SHA-256 `e4fcd7a170a4e72d121ae0a20609ac599f36d3e683f9acf7edf2863def4e35d9`.
- HTTP/Playwright smoke: `CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/demo/smoke.mjs --demo /tmp/gondola-capabilities-demo-debug/site --output /tmp/gondola-capabilities-demo-debug/smoke.json --screenshot /tmp/gondola-capabilities-demo-debug/demo.png --port 0` — passed 8 checks on port 35007 using Chromium 153.0.8010.0, React 19.3.1, and ReactDOM 19.3.1.

The smoke confirmed `/`, `/demo.css`, and `/demo.bundle.mjs` all returned HTTP 200; the disabled Parent request click created no tick; the event sequence was `addParent`, `requestParent`, `addParent`, `complete` with `dispatch-0001` through `dispatch-0004`; and no browser, console, failed-request, WebAssembly-request, or WebAssembly-API errors occurred.

Evidence is preserved in `compiled-capabilities/demo/evidence/attempt-00/`: `demo-build.json`, `demo-smoke.json`, and `demo.png`. The receipt `receipts/E-DEMO.json` records their hashes and the source hashes.

The first smoke attempt used a descendant selector for Parent's add control, which also matched Child and Grandchild add controls (3 matches instead of 1). That first tool output was not saved separately. The selector was narrowed to Parent's direct child and the complete smoke rerun passed.

## Integration status

The demo was exercised against the fresh feasibility React build, which declares `view.node`, `effect.request-reply`, and `effect.cancel`. The full capability milestone runner remains in progress; this receipt does not claim the complete N1–N6 integration pass. No commit, merge, or deploy was performed.
