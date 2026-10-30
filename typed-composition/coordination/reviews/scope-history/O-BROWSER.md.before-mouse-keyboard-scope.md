# O-BROWSER — independent disabled-control and physical-focus probe

## Result

**Outcome: supported.** An independent Playwright probe against the actual typed-composition demo, Go/WASM composition manager, DOM/React/GoDOM renderers, loopback HTTP lab, and Chromium supports the requested browser claims for the tested path. Across all three renderers, disabled native click and mouse/keyboard input attempts changed no physical input value, Go state, messages, or dirty IDs and caused zero Go runtime dispatches. A separately labeled direct Go guard dispatch returned the unchanged snapshot and left no dirty IDs. Physical DOM observations after direct renderer replacement showed the intended input remained focused with the noncollapsed backward selection `[8, 17]` both immediately and after settling.

The probe does not depend on `fixture.mjs` or the checker. The root approved execution against the frozen core demo/runtime assets while fixture/checker/test repairs continue. No shared asset was rebuilt.

## Probe and results

The probe is [o_browser_disabled_focus_probe.mjs](../reviews/o_browser_disabled_focus_probe.mjs); its raw result is [O-BROWSER-result.json](../reviews/O-BROWSER-result.json).

It creates and edits a real child row through the demo, captures its Go logical input key, sets a physical noncollapsed selection, and calls `host.replace()` directly through DOM → GoDOM → React. It samples `document.activeElement`, the physical input value and selection range immediately after each replacement and after `host.settled()`. It does not use the demo renderer controls' remembered-focus helper or fixture metadata for this witness.

It then applies read-only policy and, for DOM, React, and GoDOM, calls the actual disabled input/add/save/publish elements' `.click()` methods, clicks the disabled input with Playwright's mouse, and types at that disabled control. Event listeners on those physical controls record no click, input, beforeinput, or keydown event. An instrumented `gobiComposition.dispatch` wrapper records zero calls during each native phase. State/messages snapshots, the actual input value, and `manager.changes()` remain unchanged/empty.

After all native attempts, the probe separately invokes the valid Go dispatch step for key `row-1-input` (`Path: "2/0/0"`, `Event: "input"`). This is counted once in `directGuardDispatches` and is not attributed to any browser event. Go returns the unchanged snapshot without an error; state, messages, physical value, and dirty IDs remain unchanged. The final direct-guard observation is recorded separately in the result JSON.

Final command:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
node typed-composition/coordination/reviews/o_browser_disabled_focus_probe.mjs
```

Result: **exit 0**; child session 2; disabled evidence for `dom`, `react`, `godom`; focus replacement evidence for `dom`, `godom`, `react`; one separately counted direct Go guard dispatch; no page errors. The result JSON confirms all three focus witnesses at `[8, 17, "backward"]` both immediately and after settlement, and each disabled native phase at zero dispatches/events with unchanged state, messages, value, and dirty IDs.

The first probe execution failed inside its own `page.evaluate()` because a Node-only clone helper was referenced from the browser context (`ReferenceError: stable is not defined`). I moved the clone helper into the page context and reran the probe successfully. This was a probe harness error; the demo and shared runtime were not changed.

## Runtime and source pins

Tool versions: Node `v22.23.4`, Playwright `1.64.1`, Chromium `153.0.8010.0` (`/tmp/chromium`).

The following SHA-256 hashes were recorded before and after the successful probe and were identical; the probe did not change or rebuild these files:

```text
typed-composition/demo.html                     ea73df608e3fb9d4555f3fc7a99201865d202a9efef78c008e5e9da2bb8c0913
typed-composition/demo.mjs                      e266f424833760a7448414ff11661b3ed8bc32a71fb0502e6f9cfdc5bab124da
typed-composition/host.mjs                      e030ff3e1f10a19b2a520f7b652df5e1bc14cb7d5d33bc2f10076f0d11685f3c
typed-composition/build/composition.wasm        3e2ad04fc31bab0684c942590b3f030d83328e6b43e513bd69e8bafc5fdb87cc
typed-composition/build/godom.wasm              3e14286f2d97916996c0604d7d3e3d4ec525bb2998c08e6411d21da2140c9cdb
typed-composition/build/wasm_exec.js            0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14
typed-composition/build/react.bundle.mjs        091e9e8a2f17a9d148803f568720614a911cd22d0fed6db7cbd55c47597e17a6
session-tree/host.mjs                           f5ce451235ec2506d80d9ac3ebc364a9e43ba774cd56a66e25e3f8f7bd8a0c5a
keyed-editor/host.mjs                           36fb28e7e5ad4cfa0932a6e482dfcd8407b93b816f9c22366e8f69fd153e86b8
keyed-editor/dom.mjs                            c11b8f23221c524d31a676f161d0e799742ff5af527408805b8ee328f2943a67
renderer-conformance/adapter.mjs                 6e6a8c48c32866ad45c40a726a8422950928578745e83503e5dcc8c5e7462e51
composition/manager.go                          915254e0ac39e807c63f9a2d34f8cb38809b68e0b376174d04212c5cdf834e7d
collection/session.go                           74e214cf8f791fef9cb9bf897113ec5f9618760e0f72a03101d0c1bbc746c0ab
http-effects/build/http-lab                     9a1a9c90e70c714199ee09ec87026ac71328d9fd52674a1e7a0c96480c417289
/tmp/chromium                                    53a15d6c3a3d27dfb54c4ba60278b1683136f70cf1e67e989da7dfbd3d451ef0
```

Final probe/result hashes:

```text
typed-composition/coordination/reviews/o_browser_disabled_focus_probe.mjs 0d89c2eea048dcacab4f24bbc0d9bdc726c397957c362b83b664400777952f19
typed-composition/coordination/reviews/O-BROWSER-result.json               f5e0555a4cce57b8dc1f312d1a1d381bd3df365b103ac26d315931c89c95ab16
```

## Scope limits

This is independent browser evidence for disabled-control suppression and physical focus/selection across renderer replacement. It is not a checker result, default replay, seeded replay, inherited runner, or complete oracle acceptance claim. Those remain governed by the O-FIXTURE/O-CHECK/O-TEST freeze and root's final integrated execution. No production/demo source was edited.

Receipt schema correction: the extraction outcome is `confirmed_reuse`; the independent browser verification status remains `supported`.
