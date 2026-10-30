# Core contract audit

Scope: read-only inspection of the existing Go/WASM runtime contract and the
replacement host plus DOM/React adapters. No product-source files were edited
for this audit.

## Contract trace

| Boundary | Observed contract | Replacement behavior |
| --- | --- | --- |
| Go snapshot | `interaction.Snapshot` exposes `state`, `tree`, and an ordered, non-nil `messages` slice. | `host.mjs` requires all three fields before caching a snapshot and returns defensive copies. |
| Runtime initialization | The WASM `init()` creates a fresh Go session; calling it while switching renderers would reset state and messages. | The host calls the real runtime's `init()` once. Renderer facades return the cached snapshot from their own `init()` call. |
| Dispatch | The WASM bridge decodes `{Path, Event, Value}` into `gobi.Step`; the Go session resolves the declared handler and applies its `Message`/`Arg`. | Both adapters send the declared handler argument to the facade; the facade forwards it to Go and only replaces the cached snapshot after a valid response. |
| Runtime failures | The WASM bridge returns `{error: ...}` for invalid dispatches or unsupported effects. | `assertSnapshot` rejects error objects, preserving the previous cached snapshot. The host click wrapper then reports a backend/render error when available. |
| Mount and swap | Renderers need the latest state at mount and must not dispatch until their API is valid. Old callbacks must not reach the runtime after a swap. | The host's token is not dispatch-ready until mount returns a valid API. It also revokes the prior token before unmounting and rejects stale facades. |
| Mounted DOM result | The milestone plan specifies `{html, disabled}` as the stable host observation. | The host validates and normalizes backend DOM snapshots to exactly those two fields. |

## Bounded conclusion

The inspected host/renderer boundaries align with the existing synchronous
counter API and the milestone's declared snapshot shape. The host now contains
the readiness barrier and snapshot-field validation that address the earlier
initial review concerns. The host test source also contains regressions for
mount-time dispatch rejection and renderer-specific DOM fields being omitted
from the public snapshot. This audit did not execute those tests; execution
results belong to the recorded runner evidence.

No unresolved core-contract inconsistency was identified in the inspected
files. Claims stay limited to the current counter subset, synchronous
dispatch, and the stated DOM observations; this audit does not claim general
Gobi backend support or asynchronous React equivalence.

## Inspected source

- `interaction/session.go`: `Snapshot`, `Session.New`, `Session.Dispatch`.
- `cmd/counter-wasm/main_wasm.go`: exported `init`/`dispatch` and error-object transport.
- `gobi/build.go`: `Step` fields.
- `interaction/dom.mjs`: DOM renderer mount facade and snapshot shape.
- `backend-replacement/react-backend.mjs`: React renderer mount facade and dispatch mapping.
- `backend-replacement/host.mjs`: cached runtime, mount fence, swap, rollback, and DOM normalization.
- `backend-replacement/host.test.mjs`: source-level lifecycle regression cases.
