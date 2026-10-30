# Mounted Go counter experiment

The application remains `counter/counter.go`: Init creates state, Update accepts declared messages, and View returns a Gobi Node. No JavaScript implementation of the candidate's state transition is maintained.

## Reproduce

Use Go 1.24 and Node 22. Run the original Milestone 0 check first, then the interaction experiment:

```sh
bash run.sh
bash run-interaction.sh
```

The interaction runner installs the pinned interaction packages and Playwright Chromium, builds `cmd/counter-wasm` and the independent React reference, then runs the browser parity check. Set `GONDOLA_SKIP_NPM_CI=1` when the pinned packages are already installed, or `GONDOLA_SKIP_BROWSER_INSTALL=1` when the matching Playwright browser is already installed. Its terminal output points to the generated traces. Generated build directories are ignored by the original repository ignore rules.

## Actual execution flow

1. `interaction.New` calls the original counter Init. Its Snapshot contains original Go State, original Go Node, and the delivered-message log.
2. The WASM bridge publishes synchronous `gobiCounter.init()` and `dispatch({Path,Event,Value})` calls. It uses Go's JSON serialization; application state stays in WASM.
3. The DOM adapter mounts the supported Node subset and attaches listeners from Node.On. Clicks resolve a child-index path relative to the component root: `1` is Add, `2` is Reset.
4. Session.Dispatch finds the target in the current View, suppresses disabled controls, resolves the declared event, and sends the declared Message and Arg to the original Update. Unsupported effects fail rather than silently disappear.
5. The adapter replaces its DOM from the returned View. The independent React reference updates its own React state and renders through createRoot. It does not receive Go snapshots.
6. The harness replays identical seeded actions in both mounted roots and checks snapshots and mounted DOM after each action. Native `CompareInteraction` additionally checks Gobi Trace state, tree, DOM, step order and tick indexes.

| Observation | Input | Output |
| --- | --- | --- |
| Initial | Init() | Count 0; Reset disabled; empty message log |
| Add | click root child 1 | declared `add`; Count increments; Reset enabled |
| Reset above zero | click root child 2 | declared `reset`; Count 0; Reset disabled |
| Reset at zero | native disabled button click | no delivered message; unchanged state |
| Later action | current view and path | new state/view and ordered message log |

## Boundaries

This is a counter-specific WASM backend and mounted DOM subset, not a general Go-to-framework compiler. The candidate rebuilds DOM; identity, focus, selection, keyed moves and listener lifetime across arbitrary retained nodes are outside its claim. The synchronous React flush policy is part of this experiment; concurrent rendering and arbitrary asynchronous event schedules remain untested. Effects are rejected. No screenshots or pixel equivalence are claimed. The independent reference's Node tree is an explicit projection of its own React state, not an introspection of React internals; actual DOM is separately observed.

A second backend must preserve Init/Update/View and Message/Effect semantics, map Gobi attributes/handlers to its runtime, implement mount/update/unmount and event order, and replay the same scripts against an independent reference using Trace/Oracle (or compatible trace transport). General Backend.Emit compilation, keys, effects and richer input events need their own fixtures before claiming support.

The signed `EXPECTED.json`, `SHA256SUMS`, existing `gobi.Compare`, and all Milestone 0 source remain unchanged. The new comparison entry point checks State and step ordering without weakening or rewriting the earlier receipts.

## Open the executable demo

After `bash run-interaction.sh` builds the artifacts, run `python3 -m http.server 8080` from the repository root and open `http://localhost:8080/interaction/demo.html`. Add and Reset are real browser buttons. The page prints the Go snapshot and mounted DOM after each delivered event. See [executed results and complete traces](RESULTS.md).

For an existing local Chromium binary use `CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-interaction.sh`. The default runner installs Playwright's Chromium. Linux hosts may first need `interaction/node_modules/.bin/playwright install --with-deps chromium`; CI performs this system-dependency setup explicitly.
