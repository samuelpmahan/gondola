# Composition replay wire

The WASM bridge is built from `./cmd/composition-wasm` and publishes the
`gobiComposition` global. `cmd/composition-replay` executes the same typed
operations natively. Both expose the same lower-case operation names and
positional arguments:

| Method | Positional arguments |
| --- | --- |
| `create` | none |
| `createChild` | `parentID` |
| `tree` | none |
| `list` | none |
| `snapshot` | `sessionID` |
| `dispatch` | `sessionID`, `{Path, Event, Value, Key}` |
| `effects` | `sessionID` |
| `complete` | `sessionID`, `{ID, Value, Error}` |
| `audit` | `sessionID` |
| `dispose` | `sessionID` |
| `disposeTree` | `sessionID` |
| `setChildInputs` | `parentID`, `childID`, `{Title, ReadOnly}` |
| `publish` | `childID`, `rowID`, `inputRevision` |
| `changes` | none |
| `encodeHTTP` | `requestID`, primitive string value |
| `decodeHTTP` | `requestID`, status, primitive string body |

The `dispatch` step object is the existing collection step shape. Composition
publish controls also require `Value` to match the exact current handler
argument (`ROW/REVISION`); the bridge leaves that policy check to Go.

Replay input is one closed JSON object with an `actions` array. Each action is
one closed object with `method` and `args`; `args` is the positional argument
array. For example:

```json
{"actions":[{"method":"create","args":[]},{"method":"snapshot","args":[1]}]}
```

The native executable accepts a file path or `-` for standard input and emits
one JSON object with a `frames` array. Every action produces exactly one frame
in input order. The output root has one `frames` array. Every frame has the
original `action`, that action's `result`, and a `frame` object with:

- `tree`: the full manager tree.
- `sessions`: one `{ "id", "snapshot" }` item for each live session in
  ascending ID order; `snapshot` has the complete composition snapshot.
- `changes`: the sorted dirty IDs drained after the action.

`result` is the operation's return value, or an exact `{ "error": "..." }`
object when the operation rejects. The frame contains the full manager tree,
the full composition snapshot (state, rendered tree, bindings and ordered
messages) for every live session in ascending ID order, and the sorted dirty
IDs drained after the operation. `effects`, `audit`, and disposal results are
already captured as `result`; querying them again while building a frame would
change manager state. Invalid operations still produce a frame so callers can
compare rejection invariance. Malformed top-level/action JSON fails the replay
input before actions execute.

All browser method calls enforce exact arity, primitive types, safe integer
IDs/revisions, and exact own-field schemas. Schema objects must be non-null,
non-array objects with exactly the expected own keys; each value must come
from an own data descriptor. Accessor properties and inherited-value fallback
are rejected without reading input getters. Property values are captured from
own descriptors before type validation. Proxy traps may participate only by
reporting the exact keys and own data descriptors; `ownKeys` alone cannot
supply inherited values. Synchronous nested `gobiComposition` calls made by a
proxy trap during validation receive an error result and do not enter the
manager. Proxy traps may still have other JavaScript side effects; the bridge
does not claim to roll those back. The composition host forwards caller
argument references unchanged to the strict manager API, so it cannot invoke
getters or erase symbols/hidden fields before that validation; manager results
are cloned only after the call returns.

The native replay parser applies the same field and integer-shape rules to JSON
action arguments. Since JSON replay has a lexical number representation, safe
integer fields there require canonical unsigned decimal tokens (`1`, not
`1.0` or `1e0`); the browser bridge checks the received primitive Number for
an integer value in the safe range.
