# R-REACT

**Outcome: mixed_change.** The renderer now emits runtime-compatible lowerCamel Actions (`path`, `event`, `value`) while retaining the Go `Message` ABI (`Name`, `Arg`). Raw GoScript slice wrappers are admitted only with the observed own data field `target: undefined`; the unobserved four-field shape is rejected. After a successful mount is unmounted, `domSnapshot()` reports an empty root only when the actual container has no child nodes. `viewRecord()` continues to return `null` after unmount so the runtime can use its cached logical view for stale-action ticks.

The first focused Node run was intentionally red: 11 passed and 4 failed. It caught the old PascalCase Action fields in three callback assertions and acceptance of a GoScript slice without `target`. After the renderer changes, the same focused suite passed 15/15. The Node runtime printed its existing experimental `EnvHttpProxyAgent` warning.

The focused Go emitter suite initially failed because its synthetic `gobi.Node` `TypeInfo` had no fields, which the closed type validator rejects. I corrected the test fixture to describe the actual Node, Attr, Style, On, slice and Kind fields, including their nested types and slice representations; no production emitter code changed. The four Go emitter tests now pass.

The pre-repair cross-lane probe and raw result remain unchanged. They document the old PascalCase callback rejection, an accessor-triggered runtime reentry, and the runtime’s post-unmount stale-action failure. The renderer side of the lifecycle seam now returns the physical empty-root snapshot; N4 owns runtime logical-view caching, and N6 owns mounted browser confirmation. No four-app or browser pass is claimed by this lane.

Focused verification:

- `GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 -v ./emit` — 4 passed, 0 failed.
- `/tmp/gondola-node22/node_modules/node/bin/node --test frontend/react/renderer.test.mjs frontend/react/bindings.test.mjs` — 15 passed, 0 failed (Node v22.23.4).

Relevant hashes and the retained pre-repair probe hashes are recorded in `coordination/receipts/R-REACT.json`.
