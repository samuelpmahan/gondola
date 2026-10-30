# Compiled fixture scripts

These cases are the shared action input for the direct-Go native oracle,
N6's independent direct-JavaScript replay, and the browser driver. They do not
contain application reducers. The app functions live in the root Go packages
named by each `packagePath`; native replay calls those actual `Init`, `Update`,
and `View` functions.

Each JSON file uses the small wrapper `gobi.fixture-script/v1`:

- `schema`, `name`, and `packagePath` identify the script and Go package.
- `actions` is an ordered array of the exact v1 trace `Action` shape
  `{path,event,value}`. Paths are zero-based indexes in the current View. `value`
  is the requested script intent for every event; browser adapters capture live
  DOM properties and the resolved message independently.
- `hostScript` uses the exact `gobi.host-script/v1` schema and supplies ordered
  effect requests and replies.
- `focusWitnesses` describes browser-only focus and selection samples; it is
  empty where the script has no renderer-identity witness.
- `initialState` and `expectations` are human- and test-readable native
  expectations. State object keys use the Go field names. `message:null` and
  `dispatchId:null` mark suppressed attempts. Effect correlation uses the v1
  `dispatchId` and `effectIndex`; effect state is expected to commit on the
  request action tick before the separate completion tick.

## Form

`form.json` starts with zero state: blank draft/saved/literal strings, false
checkbox, and zero saves. The tree paths are text input `0`, checkbox `1`, a
literal click handler `2`, Save `6`, Reset `7`, and Boundary `8`. Boundary
seeds Saves to max safe integer minus one; two Save actions prove it reaches
the exact safe maximum and saturates without overflow. Text is read through
`target.value`; checkbox uses `target.checked`. The literal button's fixed
`gobi.On.Arg` is exactly `target.value`; action index 2 carries the scripted
spoof `must not replace literal` while a real browser click resolves the static
`On.Arg` and independently records live button/DOM values. Save stores the exact draft;
Reset returns to zero state; the final disabled Reset attempt has no message or
dispatch.

## Keyed list

`list.json` starts with `Rows == nil`, `NextID == 0`; Reset and Add are paths
`1` and `0`, and row children are label input `0`, checkbox `1`, Up `2`, Remove
`3` under path `2/{rowIndex}`. Add allocates stable IDs 1 and 2, then row 2 is
edited, checked, moved ahead of row 1, and row 1 is removed. A subsequent input
at the removed row's old path `2/1/0` is a no-target suppressed action. Removing
the last row yields non-nil empty `Rows`; disabled Reset then produces another
no-dispatch attempt. The focus witness is sampled on `row-2-label` at selection
`[0,2,"backward"]` while dispatching the move-up click without transferring
native focus to the button, so renderer reconciliation can be checked directly.

## Deterministic effect

`effect.json` begins idle with negative-zero bits `8000000000000000`. Its first
Request click is disabled and suppressed; the next action edits the request
input, and the final Request click is dispatch `dispatch-0002`. The one-step
HostScript returns `complete` with `reply value`. The expected trace has a
pending-state request tick before a separate completion tick, with exactly one
completion linked to effect index 0. No network service is used.

`counter.json` runs the unchanged original app: two Add clicks, Reset, then a
suppressed disabled Reset. It does not alter the counter application source.
