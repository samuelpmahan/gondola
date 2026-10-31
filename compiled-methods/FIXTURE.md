# Compiled method value-composition fixture

**Contract status: frozen for E-FIXTURE (2026-10-31).** Root approved the bounded behavior; N2 (browser), N3 (harness), N4 (analyzer), and N5 (demo) aligned on this contract. N3 will keep a machine-readable callee graph in its harness lane and check it against emitted AppIR. This fixture demonstrates value-based method dispatch and state transfer only. It does not claim a component manager, session ownership, cancellation, or production composition protocol.

## Identity and Go state

- Package: `github.com/samuelpmahan/gondola/fixtures/compiled/methods`
- Fixture script (N3-owned): `compiled-methods/conformance/fixtures/methods.json`
- Fixture name: `compiled-value-method-composition-child-readonly-snapshot`
- AppIR roles remain ordinary package functions: `Init`, `Update`, and `View`.
- Go state:

```go
type State struct {
	Parent     counter.State
	Child      counter.State
	ReadOnly   bool
	SavedChild float64
}
```

The value wire shape is `{"Parent":{"Count":0},"Child":{"Count":0},"ReadOnly":false,"SavedChild":0}`. `Parent.Count`, `Child.Count`, and `SavedChild` are `float64`. The state contains no pointers, method values, interfaces, or type parameters.

## Receiver method graph

All methods use a concrete value receiver `(state State)` and return values. Stable method IDs use N4's `<packagePath>.State.<Method>` spelling.

| Symbol | Signature | Calls / responsibility |
| --- | --- | --- |
| `…/methods.Init` | `func Init() State` | Delegates to `State.Initialize` |
| `…/methods.State.Initialize` | `func (state State) Initialize() State` | Calls `counter.Init` for Parent and Child |
| `…/methods.Update` | `func Update(state State, message gobi.Message) (State, []gobi.Effect)` | Delegates to `State.Reduce` |
| `…/methods.State.Reduce` | `func (state State) Reduce(message gobi.Message) (State, []gobi.Effect)` | Switches on the seven messages below and calls the matching value method |
| `…/methods.State.AddParent` | `func (state State) AddParent() (State, []gobi.Effect)` | Calls `counter.Update` with `add` on Parent and returns its effects |
| `…/methods.State.ResetParent` | `func (state State) ResetParent() (State, []gobi.Effect)` | Calls `counter.Update` with `reset` on Parent and returns its effects |
| `…/methods.State.AddChild` | `func (state State) AddChild() (State, []gobi.Effect)` | Calls `counter.Update` with `add` on Child when not read-only |
| `…/methods.State.ResetChild` | `func (state State) ResetChild() (State, []gobi.Effect)` | Calls `counter.Update` with `reset` on Child when not read-only |
| `…/methods.State.ToggleReadOnly` | `func (state State) ToggleReadOnly() (State, []gobi.Effect)` | Toggles `ReadOnly`; returns no effects |
| `…/methods.State.CaptureChild` | `func (state State) CaptureChild() (State, []gobi.Effect)` | Copies `Child.Count` into typed `SavedChild`; returns no effects |
| `…/methods.State.PublishSaved` | `func (state State) PublishSaved() (State, []gobi.Effect)` | Copies `SavedChild` into `Parent.Count`; returns no effects |
| `…/methods.View` | `func View(state State) gobi.Node` | Delegates to `State.ComposeView` |
| `…/methods.State.ComposeView` | `func (state State) ComposeView() gobi.Node` | Builds the fixture view using Gobi node builders and `strconv.FormatFloat` |

The concrete call graph is `Init → State.Initialize → counter.Init`, `Update → State.Reduce → {AddParent, ResetParent, AddChild, ResetChild, ToggleReadOnly, CaptureChild, PublishSaved}`, and `View → State.ComposeView`. Each action method returns `(State, []gobi.Effect)` so Add/Reset can return the exact effect slice from `github.com/samuelpmahan/gondola/counter.Update`; the other methods return a nil effect slice. `ComposeView` intentionally builds a small custom view: `counter.View` uses the same `add`/`reset` message names for either counter and therefore cannot identify which nested value to update. No JavaScript reducer is involved.

The seven message names are `parentAdd`, `parentReset`, `childAdd`, `childReset`, `toggleReadOnly`, `captureChild`, and `publishSaved`. Every fixture action is a `click` with `value: ""`. Add/reset operate through the existing `counter.Update`; `ReadOnly` guards only child Add/Reset. Capture and Publish remain available while read-only because they are parent-owned value operations.

## Fixed view and action paths

The root is a keyed `div` (`key: "methods"`, `class: "method-composition"`) with these six children in order:

| Path | Node | Key / class | Text and behavior |
| --- | --- | --- | --- |
| `0` | parent `div` | `parent` / `parent-counter` | `0/0` is `Parent: N`; `0/1` is button `Parent +` (`key: parent-add`, `parentAdd`); `0/2` is `Parent Reset` (`key: parent-reset`, `parentReset`, disabled when Parent.Count is zero) |
| `1` | child `div` | `child` / `child-counter` | `1/0` is `Child: N`; `1/1` is `Child +` (`key: child-add`, `childAdd`, disabled while ReadOnly); `1/2` is `Child Reset` (`key: child-reset`, `childReset`, disabled while ReadOnly or Child.Count is zero) |
| `2` | button | `readonly-toggle` | `Lock child` when false, `Unlock child` when true; `toggleReadOnly` |
| `3` | paragraph | — | `Saved child: N` |
| `4` | button | `capture-child` | `Capture child`; `captureChild` |
| `5` | button | `publish-saved` | `Publish saved to parent`; `publishSaved` |

Buttons have no DOM attributes except their specified `disabled` flag; their keys are logical renderer keys, not attributes. Reset controls are disabled at zero. Only child Add/Reset are disabled while `ReadOnly` is true; parent Add/Reset, capture, publish, and the toggle remain enabled. The native harness records disabled action attempts as the established suppressed ticks: action retained, message and dispatch ID null, state unchanged, no Go Update.

## Fixed 18-action script and expected states

The initial trace tick is index `0`, with state `{Parent.Count:0, Child.Count:0, ReadOnly:false, SavedChild:0}`. Each action below contributes exactly one trace tick. Dispatch IDs are allocated only for messages that reach `Update`; four disabled intents are suppressed.

| Action index | Path | Event / action value | Go message / trace arg | Dispatch ID | Expected state `(Parent, Child, ReadOnly, SavedChild)` |
| ---: | --- | --- | --- | --- | --- |
| 0 | `1/1` | `click` / `""` | `childAdd` / `""` | `dispatch-0001` | `(0, 1, false, 0)` |
| 1 | `1/1` | `click` / `""` | `childAdd` / `""` | `dispatch-0002` | `(0, 2, false, 0)` |
| 2 | `4` | `click` / `""` | `captureChild` / `""` | `dispatch-0003` | `(0, 2, false, 2)` |
| 3 | `1/1` | `click` / `""` | `childAdd` / `""` | `dispatch-0004` | `(0, 3, false, 2)` |
| 4 | `5` | `click` / `""` | `publishSaved` / `""` | `dispatch-0005` | `(2, 3, false, 2)` |
| 5 | `1/2` | `click` / `""` | `childReset` / `""` | `dispatch-0006` | `(2, 0, false, 2)` |
| 6 | `1/2` | `click` / `""` | `null` / `null` (disabled) | `null` | `(2, 0, false, 2)` |
| 7 | `1/1` | `click` / `""` | `childAdd` / `""` | `dispatch-0007` | `(2, 1, false, 2)` |
| 8 | `2` | `click` / `""` | `toggleReadOnly` / `""` | `dispatch-0008` | `(2, 1, true, 2)` |
| 9 | `1/1` | `click` / `""` | `null` / `null` (disabled) | `null` | `(2, 1, true, 2)` |
| 10 | `1/2` | `click` / `""` | `null` / `null` (disabled) | `null` | `(2, 1, true, 2)` |
| 11 | `0/1` | `click` / `""` | `parentAdd` / `""` | `dispatch-0009` | `(3, 1, true, 2)` |
| 12 | `4` | `click` / `""` | `captureChild` / `""` | `dispatch-0010` | `(3, 1, true, 1)` |
| 13 | `5` | `click` / `""` | `publishSaved` / `""` | `dispatch-0011` | `(1, 1, true, 1)` |
| 14 | `2` | `click` / `""` | `toggleReadOnly` / `""` | `dispatch-0012` | `(1, 1, false, 1)` |
| 15 | `1/1` | `click` / `""` | `childAdd` / `""` | `dispatch-0013` | `(1, 2, false, 1)` |
| 16 | `0/2` | `click` / `""` | `parentReset` / `""` | `dispatch-0014` | `(0, 2, false, 1)` |
| 17 | `0/2` | `click` / `""` | `null` / `null` (disabled) | `null` | `(0, 2, false, 1)` |

Actions 2–4 prove snapshot semantics: SaveChild captures typed value `2`, Child is subsequently edited to `3`, then Publish sets Parent to the captured `2`. Actions 8–13 prove that the child is read-only while parent Add and parent-owned capture/publish continue to work. The second publish changes Parent from `3` to saved value `1`. The script has 19 trace ticks total (initial tick plus 18 action ticks), no effects, and an empty host-script step list.
