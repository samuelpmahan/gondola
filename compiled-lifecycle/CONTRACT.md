# Compiled Go lifecycle fixture contract

**Status: frozen for E-FIXTURE (2026-10-31).** The fixture is an admitted-profile Go application with a finite, value-owned topology. It does not compile a generic manager or pointer graph.

## Roles and state ownership

Package `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle` exports the ordinary roles `Init() State`, `Update(State, gobi.Message) (State, []gobi.Effect)`, and `View(State) gobi.Node`. The AppIR component ID and package path are both `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`; its state type is `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State`, and its message type is `github.com/samuelpmahan/gondola/gobi.Message`. `compiled-lifecycle` is the fixture's display name only.

`State` owns four fixed value records: `Parent`, `Child`, `Grandchild`, `Sibling`, plus `NextRequestID`. Parent → Child → Grandchild form one root subtree. Sibling is a second root. Each `NodeState` contains `ID`, `ParentID`, `Generation`, `RequestID`, `Alive`, `Requested`, `Pending`, `Token`, `Reply`, and `Counter counter.State`. Parent, Child, Grandchild, and Sibling use the existing `counter.Update` for their Add messages. The screen is assembled with `gobi.Node` builders.

The fixture deliberately models a finite set of four slots. `removeParent` marks the first root and its descendants dead; `remountParent` revives that subtree with higher generations and fresh counter values. It does not implement arbitrary child creation, generic identity maps, pointer receivers, shared mutable state, or a component Manager.

## Messages and token rules

The supported message names are:

| Message | Arg | Go transition |
| --- | --- | --- |
| `addParent`, `addChild`, `addGrandchild`, `addSibling` | empty | Calls `counter.Update` with `Name:"add"` on that live slot. |
| `requestParent`, `requestChild`, `requestGrandchild`, `requestSibling` | empty | Allocates a monotonic request ID, marks the live slot requested/pending, stores its token, emits one request effect. |
| `removeParent` | empty | Emits pending cancellation effects in grandchild, child, parent order, then marks those three slots dead. |
| `remountParent` | empty | Increments parent/child/grandchild generations, resets their request state and counters, and preserves the sibling. |
| `complete` | exact token | Completes only a live pending slot whose stored token exactly matches. It stores the token in `Reply` and clears `Pending`. Unknown, canceled, stale-generation, and duplicate tokens leave state unchanged. |

Tokens are constructed from the actual state values as `scope:g<Generation>:r<RequestID>` using `strconv.FormatUint`; the request ID is not derived from a hard-coded action order. The fixed script happens to allocate `parent:g1:r1`, `child:g1:r2`, `grandchild:g1:r3`, and `sibling:g1:r4`, followed after remount by `parent:g2:r5`, `child:g2:r6`, and `grandchild:g2:r7`. Requests stop before the JavaScript safe-integer boundary, and remount refuses to revive a subtree if any generation has reached that boundary, so generations and tokens do not saturate or repeat.

## Effect ABI and lifecycle host seam

Request effects use the admitted `fixture.request` effect and existing `gobi.Effect` value shape:

```json
{"Kind":"fixture.request","Name":"lookup","Arg":"child:g1:r2","Reply":"complete"}
```

Cancellation effects use the same four `gobi.Effect` fields:

```json
{"Kind":"lifecycle.cancel","Name":"cancel","Arg":"child:g1:r2","Reply":""}
```

The cancel `Arg` is the stable token from the originating request. A lifecycle host maps that token to its request correlation and cancels only that request. Cancellation is fire-and-forget. `removeParent` returns a dense effect slice in deterministic postorder: pending Grandchild, pending Child, pending Parent. The independent Sibling's request is neither canceled nor drained.

The lifecycle runtime retains the existing strict request policy and opts into one narrowly scoped cancellation descriptor. The existing compiled runtime policy remains the default for all other consumers. A canceled host request must lose its runtime completion correlation; a late `runtime.complete` is rejected. The fixture also sends an explicit `complete` Go message with the old token after remount, proving the Go equality guard independently of the runtime correlation guard.

Renderer replacement does not call `Update` or replace app state. Pending request tokens and callbacks remain owned by their lifecycle host until reply or explicit cancellation. The canonical script swaps DOM → React while all four initial requests are pending, then removes Parent.

## Evidence boundary

The native adapter replays the actual Go roles and Gobi view against [`fixtures/compiled/lifecycle/scenario.json`](../fixtures/compiled/lifecycle/scenario.json). The fixture's compiler gate uses the existing GoScript CLI. Browser/runtime evidence is recorded by the separate lifecycle harness and oracle lanes. This contract establishes only the finite fixture above; it makes no claim that arbitrary Go pointer managers or dynamic ownership graphs compile.
