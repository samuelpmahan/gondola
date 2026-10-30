# A-CONTRACT — cross-layer typed composition audit

## Result

**Original outcome: confirmed_reuse.** The ordinary-operation audit below found the Go manager, WASM/native wire, and host dirty-refresh sequence aligned. That conclusion is now narrowed by the XR-T2 boundary finding recorded in the addendum: hostile accessor/proxy rejection invariance remains broken at the bridge boundary.

## Call-path audit

- **Inputs:** `SetChildInputs` validates UTF-8 and the 256-byte bound, live parent and child, immediate parentage, and revision capacity before committing inputs. Each accepted call increments the child revision and dirties the child. The bridge decodes exactly `{Title, ReadOnly}` with primitive types and validates safe session IDs. `createCompositionHost.setChildInputs(parent, child, inputs)` forwards the same structure, schedules one post-call propagation, drains `changes()`, and refreshes only the live child renderer.
- **Publication:** Both the typed `Publish(child,row,revision)` API and the row button path reach Go's `publishLocked`. The button dispatch validates current view/path/key/event, exact `ROW/REVISION`, and disabled/read-only status before capturing the Go-owned saved value. The typed API accepts a primitive safe row/revision at the bridge. Success appends one child message, one parent receipt, and dirties child plus parent; the host refreshes each existing renderer in sorted manager order. Stale revision, read-only, invalid row, or wrong-parent errors return before dirty IDs or sequence/inbox mutation.
- **Completion while read-only:** `Dispatch` validates the canonical event before the read-only suppression gate. `Complete` delegates directly to the collection manager without a read-only check; an accepted pending reply updates collection state, message history, and the target dirty ID. The strict bridge decodes the reply without changing it, and the host schedules the normal dirty refresh and effect settlement.
- **Disposal:** Go `DisposeTree` returns the existing child-first cancellation bundles and removes all dead IDs from `Changes`, but preserves the immediate parent's Inbox and manager-global sequence. The session-tree host consumes those bundles during unmount, cancels each session transport, and fences callbacks to inactive nodes. The composition host's queued propagation checks the current mounted tree before refreshing, so a queued dead ID cannot reach a removed renderer. Recreated children get fresh manager IDs and default empty state.
- **Bridge/frame shape:** The browser bridge has exact arity and closed own-field schemas for steps, replies, and inputs; primitive integer checks reject unsafe IDs and revisions. The native replay uses the same lower-case methods and positional arguments and records the full tree/session snapshots after each action. It drains changes while capturing each frame, which matches the independent model's per-action replay semantics.

The host requires exclusive ownership of the manager object, as DESIGN states. A later renderer refresh failure is surfaced through `settled()` after Go has committed its transition; no rollback is claimed. Those are documented host limits. The hostile bridge finding below is a concrete cross-layer boundary gap, not a design limit.

## Bounded probe and verification

Created the audit-only action input and full native output under `coordination/reviews/`:

- `A-CONTRACT-actions.json`: 20 calls covering creation, direct inputs, row add/edit/save, effect drain, read-only transition, completion while read-only, rejected read-only and stale publishes, accepted publication, dirty IDs, child disposal, parent receipt retention, and fresh child creation.
- `A-CONTRACT-native.json`: all 20 results and complete post-action frames from `cmd/composition-replay`.

Assertions over that replay passed: read-only completion saved the pending row; readonly and stale publication attempts returned errors without dirty IDs; the accepted publication captured `Saved="saved while read-only"` with sequence 1 and input revision 3; successful publication dirtied IDs `[1,2]`; disposal retained the parent's receipt; and child recreation returned ID 3 with empty rows.

Passed focused verification:

```sh
PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local go test ./composition ./cmd/composition-wasm ./cmd/composition-replay
PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local go test -race ./composition ./cmd/composition-wasm ./cmd/composition-replay
PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local go vet ./composition ./cmd/composition-wasm ./cmd/composition-replay
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test keyed-editor/host.test.mjs multi-root/runtime.test.mjs multi-root/host.test.mjs session-tree/host.test.mjs typed-composition/host.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node cmd/composition-wasm/smoke.mjs typed-composition/build/composition.wasm typed-composition/build/wasm_exec.js
```

Results: Go tests/race/vet passed; host/runtime suites passed 46/46; strict bridge smoke returned `ok:true`, 16 exact-arity methods, 18 malformed-schema rejections, and 6 unsafe-ID rejections. The T6 real-HTTP browser smoke also passed with a real Go WASM manager and composition host: completion succeeded while read-only, renderer swaps retained state/selection, publication appeared in the parent Inbox, disposal retained the receipt, and child recreation used a fresh ID. These checks cover ordinary typed values; they do not establish invalid-call side-effect isolation for hostile JS values.

## Probe correction and unverified work

The first post-processing assertion expected `changes()` itself to return `[1,2]` after the native replay had already drained changes into the publication action's frame. It failed because the replay contract drains changes after every action. I corrected the assertion to check `frames[12].frame.changes == [1,2]`; the full probe assertions then passed. This was an audit-script expectation error, not a Go/bridge/host failure.

I did not run the full inherited runner or the seeded browser/native oracle because root had that runner active. Those checks and broader renderer/browser behavior remain unverified by this audit. This contract audit supplements the individual source reviews and does not replace them.

## XR-T2 scope qualification and final classification

The independent XR-T2 review and its retained browser probe found two concrete failures outside this audit's ordinary-input path:

- An own `Title` getter invoked `gobiComposition.create()` during `setChildInputs` decoding. The outer call then returned the expected primitive-type error, but the nested call still created session 3; `list()` changed from `[1,2]` to `[1,2,3]`.
- A proxy reported own keys `Title` and `ReadOnly` while supplying their values through its prototype. The bridge accepted that proxy and committed `Title: "from prototype"` with `InputRevision: 1`.

The cause is that the bridge checks `Reflect.ownKeys()` and later reads values with `Reflect.get()` without tying validation to own data descriptors or fencing nested bridge calls during decoder execution. Therefore a rejected outer call can mutate Go through reentry, and the closed own-field contract is incomplete for proxies. The standard strict-bridge smoke's rejection count does not prove side-effect isolation for these cases.

**Final outcome: mixed_change.** Go-owned state and the host's ordinary `Changes`/refresh/disposal choreography were confirmed by the scoped audit and probes, but the strict browser bridge has an unresolved hostile-input contract gap. This audit did not repair or re-test that boundary; the XR-T2 report and raw probe remain the finding of record.
