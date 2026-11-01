# XR-GO independent review

**Decision:** `accepted`  
**Reviewer:** N2  
**Reviewed job:** E-GO (author N1)

## Sealed inputs and pins

I reviewed `seals/E-GO/E-GO.md`, `seals/E-GO/E-GO.json`, and the immutable source inventory. Both report/receipt hashes in `seals/E-GO/seal.json` match. All seven owned source files match their sealed SHA-256 and byte-count entries; all six dependency files match `rawlogs/E-GO/dependency-source.sha256`. The detailed checks are in `rawlogs/XR-GO/pin-verification.json`.

The native replay output from the fresh review run is byte-for-byte identical to the sealed author trace: 539,517 bytes, SHA-256 `40af1b1ce072f7f702e613c4f292174d8d76b95477842ecba747c0f19a3abd9e`.

## Review findings

- The keyed parent wraps the existing `moduleparent.State`, returns the same three-field typed `modulewire.Input` projection for `Output`, and makes unkeyed `Receive` a no-op. Its keyed receiver admits only the mounted key/generation and current parent revision, and rejects negative, non-finite, or out-of-range publication counts.
- Membership is bounded to `a` and `b`. Add/remove maintain ordered membership; remount advances only that key's generation and clears only its stored publication. Reorder changes order without moving per-key state. The tests cover generation exhaustion and disabled mount controls.
- The native runner initializes two independent `modulechild` states. Clicks resolve against the current Go `View`; a disabled node is rejected before dispatch. Parent updates propagate typed input to live children, and child updates publish through `ReceiveKeyed`.
- The 18-event trace covers independent child updates, parent lock/unlock propagation, disabled add/reset clicks, reorder, removal, stale callbacks and publications before and after remount, generation 2 initialization, and sibling-preserving reset. Event snapshots include the legacy parent state, both controller slots and order, each live child's input/state/publication/view, and the parent's Go view.
- A separate audit checked all 19 snapshots for membership/order/generation consistency, child input against parent state, keyed publication against its slot, keyed summaries and disabled controls against controller state, and child view text/disabled flags against child state. It passed; see `rawlogs/XR-GO/trace-audit.log`.

## Verification

Go tool: `/tmp/gondola-go/go/bin/go version` → `go version go1.24.0 linux/amd64`.

| Command | Result | Evidence |
| --- | --- | --- |
| `/tmp/gondola-go/go/bin/go test -v -count=1 ./cmd/keyed-module-native ./fixtures/compiled/keyedmoduleparent ./fixtures/compiled/keyedmodulewire ./fixtures/compiled/moduleparent ./fixtures/compiled/modulechild` | Pass; fresh, uncached package tests | `rawlogs/XR-GO/go-test.*` |
| `/tmp/gondola-go/go/bin/go run ./cmd/keyed-module-native --script fixtures/compiled/keyedmoduleparent/scenario.json` | Pass; 18 events, `gobi.keyed-module-native/v1` | `rawlogs/XR-GO/native-literal.*` |
| Five malformed CLI scenarios: truncated JSON, unknown top-level field, unknown event kind, self-referencing stale callback, and child click for an unmounted key | All rejected with nonzero status and empty stdout | `rawlogs/XR-GO/malformed-probes.log` |

The package tests specifically cover initial order and generations, isolated keyed publications, remove/remount fencing, reorder preservation, stale revision, unkeyed Receive no-op, malformed membership, invalid publication values, generation exhaustion, disabled view controls, current-Go-view click resolution, and invalid stale-event source references.

## Limits and review notes

This acceptance is for the sealed Go implementation and native synchronous replay. It does not establish asynchronous-effect behavior, browser renderer acceptance, or general helper reachability in compiled GoScript; those are outside this review's evidence.

One initial reviewer pin-check command passed a JSON inventory to `sha256sum -c`, which reported “no properly formatted checksum lines found.” I corrected the check by parsing the inventory and verifying every path's bytes and SHA-256; all source and dependency pins pass. This was a reviewer tooling error, not an E-GO failure. It is preserved in `rawlogs/XR-GO/reviewer-tooling-error.log`.
