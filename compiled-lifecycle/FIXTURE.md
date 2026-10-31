# Frozen lifecycle fixture

**Fixture:** `compiled-lifecycle-parent-child-grandchild-remount-fence`  
**Package:** `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`  
**AppIR component ID:** `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`  
**Fixture display name:** `compiled-lifecycle`  
**Script:** [`fixtures/compiled/lifecycle/scenario.json`](../fixtures/compiled/lifecycle/scenario.json)

## Fixed screen

The root is a keyed `main.lifecycle`. Its children stay in this order at every step: Parent (or a removed placeholder) at path `0`, independent Sibling at `1`, and lifecycle controls at `2`.

| Path | Element | Class | Key | Text / handler |
| --- | --- | --- | --- | --- |
| `0` | `section` | `lifecycle-node lifecycle-parent` | `parent` | status `Parent: live; count=N; idle`, `pending TOKEN`, or `complete TOKEN` |
| `0/1` | `button` | `lifecycle-add` | `parent-add` | `Parent +` → `addParent` |
| `0/2` | `button` | `lifecycle-request` | `parent-request` | `Request parent` → `requestParent`; disabled after request |
| `0/3` | Child `section` | `lifecycle-node lifecycle-child` | `child` | nested after the Parent status/Add/Request controls |
| `0/3/1` | `button` | `lifecycle-add` | `child-add` | `Child +` → `addChild` |
| `0/3/2` | `button` | `lifecycle-request` | `child-request` | `Request child` → `requestChild`; disabled after request |
| `0/3/3` | Grandchild `section` | `lifecycle-node lifecycle-grandchild` | `grandchild` | nested after the Child status/Add/Request controls |
| `0/3/3/1` | `button` | `lifecycle-add` | `grandchild-add` | `Grandchild +` → `addGrandchild` |
| `0/3/3/2` | `button` | `lifecycle-request` | `grandchild-request` | `Request grandchild` → `requestGrandchild`; disabled after request |
| `1` | Sibling `section` | `lifecycle-node lifecycle-sibling` | `sibling` | status `Sibling: live; count=N; ...` |
| `1/1` | `button` | `lifecycle-add` | `sibling-add` | `Sibling +` → `addSibling` |
| `1/2` | `button` | `lifecycle-request` | `sibling-request` | `Request sibling` → `requestSibling`; disabled after request |
| `2` | `aside` | `lifecycle-controls` | `lifecycle-controls` | controls below, in order |
| `2/0` | `button` | `lifecycle-remove` | `parent-remove` | `Remove parent` → `removeParent`; disabled when Parent is dead |
| `2/1` | `button` | `lifecycle-remount` | `parent-remount` | `Remount parent` → `remountParent`; disabled when Parent is alive |

Every node section has children in this order: status `<p>`, Add button, Request button, then its nested child if it has one. Every button handler uses event `click` and an empty `Arg`. The only ordinary attributes are the listed `class` values and the boolean `disabled` flag. Logical keys are renderer keys and are not DOM attributes. When Parent is dead, path `0` is `<p class="lifecycle-removed">Parent: removed</p>`; Sibling and controls retain their paths.

## Fixed 26-event schedule

The JSON script names each event's kind, path, and expected message. A `renderer-swap` event is a host operation and produces no Go dispatch. `go-message` sends a literal Go message directly. `effect-reply` delivers the matching fixture request; the actual harness additionally checks runtime correlation acceptance/rejection through `harnessProbes`.

| Index | Event | Message/token | Expected result |
| ---: | --- | --- | --- |
| 0–3 | Add Parent, Child, Grandchild, Sibling | `addParent`, `addChild`, `addGrandchild`, `addSibling` | Counts become `(1,1,1,1)` in Parent/Child/Grandchild/Sibling order. |
| 4–7 | Request Parent, Child, Grandchild, Sibling | `requestParent`, `requestChild`, `requestGrandchild`, `requestSibling` | All pending; request IDs `(1,2,3,4)`; tokens `parent:g1:r1`, `child:g1:r2`, `grandchild:g1:r3`, `sibling:g1:r4`; `NextRequestID=4`. |
| 8 | Renderer swap | DOM → React, target root | No Go message; all values, tokens, and pending requests remain unchanged. |
| 9 | Remove Parent subtree | `removeParent` | Effects are exactly `cancel(grandchild:g1:r3)`, `cancel(child:g1:r2)`, `cancel(parent:g1:r1)`, in that order. Parent/Child/Grandchild become dead, not pending, and have empty `Token`; their counts and request IDs remain until remount. Sibling remains generation 1, count 1, pending on `sibling:g1:r4`. |
| 10 | Remount Parent subtree | `remountParent` | Parent/Child/Grandchild become generation 2, live, count 0, not requested/pending, request ID 0, empty token/reply. Sibling and `NextRequestID=4` are unchanged. |
| 11–13 | Old Go completion messages | Grandchild, Child, Parent generation-1 tokens | Each is a stale no-op; state is unchanged. Runtime cancellation probes at event 9 separately require rejected old effect completions. |
| 14 | Complete surviving Sibling | `sibling:g1:r4` | Accepted; Sibling remains live/count 1, clears `Pending`, and stores that token in `Reply`. |
| 15 | Duplicate Sibling Go completion | `sibling:g1:r4` | Go no-op. Runtime duplicate completion is separately rejected by correlation. |
| 16–18 | Add remounted Parent, Child, Grandchild | `addParent`, `addChild`, `addGrandchild` | Their generation-2 counts become `(1,1,1)`; Sibling count stays 1. |
| 19–21 | Request remounted Parent, Child, Grandchild | `requestParent`, `requestChild`, `requestGrandchild` | Pending IDs `(5,6,7)`; tokens `parent:g2:r5`, `child:g2:r6`, `grandchild:g2:r7`; `NextRequestID=7`. |
| 22–24 | Complete Grandchild, Child, Parent generation 2 | tokens `grandchild:g2:r7`, `child:g2:r6`, `parent:g2:r5` | Each clears pending and stores its token as Reply. Sibling remains complete. |
| 25 | Duplicate Child Go completion | `child:g2:r6` | Go no-op; runtime duplicate probe is rejected. |

At the end, all four slots are live; Parent, Child, and Grandchild are generation 2 with count 1, not pending, and Reply set to their generation-2 tokens. Sibling is generation 1 with count 1, not pending, and Reply `sibling:g1:r4`. `NextRequestID` is 7.

## Native adapter

Run from the repository root:

```sh
go run ./cmd/compiled-lifecycle-native --script fixtures/compiled/lifecycle/scenario.json
```

The command emits one JSON object with schema `gobi.compiled-lifecycle-native/v1`, `packagePath`, `componentID`, `initialState`, and an ordered `steps` array. Each step contains `index`, `kind`, the resolved Go `message` (or null for a renderer swap), Gobi `effects`, the actual Go `state`, and the Gobi `view` after that event. Click steps resolve their message from the current `gobi.Node` at the scripted path and reject a mismatch. It calls the fixture's Go `Init`, `Update`, and `View`; it has no JavaScript reducer.
