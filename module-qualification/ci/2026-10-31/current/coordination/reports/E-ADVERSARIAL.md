# E-ADVERSARIAL — native checker mutation controls

**Worker:** N4  
**Outcome:** `mixed_change`

## Result

Added `modulequalification/adversarial_test.go` and the machine-readable mutation corpus at `module-qualification/controls/mutations.json`. The tests validate the unmodified restored attempt before exercising ten independent corruption cases against hard-link overlays of that actual attempt.

The final Go 1.24 run passed. Its positive case independently validated the real fixed and seeded captures, all four React/DOM ABI builds, and the source identity in `/tmp/gobi-published-restore-check`. `CaptureReport` was asserted as 12 profiles, 144 aggregate source events, 99 updates, seeds `20261031`, `20261032`, `20261033`, and zero checker-executed mutation controls. The fixed scenario is 24 events, 16 updates, and 17 checkpoints; each seed contributes 40 events. The producer’s summary remained `matched` during every negative case.

The ten controls each changed actual captured bytes while leaving all other linked source files untouched. The target was unlinked before the overlay replacement, and the original target’s SHA-256 was checked again after each case.

| Control | Captured value changed | Native rejection observed |
| --- | --- | --- |
| `native-typed-state` | Native initial parent `Step` | Initial Go state/view/bridge checkpoint differs |
| `native-node-record-tree` | Native parent NodeRecord text | Initial Go state/view/bridge checkpoint differs |
| `compiled-direct-typed-state` | Direct child counter float64 bits | Direct initial child state differs |
| `browser-physical-dom` | Normalized child `outerHTML` | Browser snapshot DOM differs |
| `browser-disabled-control` | Reset button’s disabled state in HTML and both semantic/physical control captures | Browser snapshot DOM differs |
| `direct-bridge-order` | Event 0 `child.Publication` / `parent.Receive` order | Direct event bridge calls differ |
| `native-schema-with-matched-summary` | Native trace schema, leaving summary matched | Native trace header schema/name mismatch |
| `abi-descriptor-role` | React parent sidecar role name `Init` | Invalid ABI role identity |
| `compiled-module-source-bytes` | React parent generated module bytes | Artifact digest mismatch |
| `fixture-source-bytes` | Pinned parent Go source bytes | `VerifyDirectory` source-pin mismatch |

The final command and all ten exact rejection messages are in `rawlogs/E-ADVERSARIAL/attempt-020-frozen-positive-and-10-mutations.stdout.log`. That run exited 0 in 27.507 seconds. The raw-log index covers 41 files and has SHA-256 `7ee724c38bf71f6a11d092609f9efe60ad7814ab06c6cdd5a06f14ddbbf33f27`. `evidence-inputs.json` pins the actual native/direct/browser traces, summary, fixed scenario and literal expectations, all four build manifests, representative AppIR/ABI/module bytes, source-pin manifest, and source fixture; it also records the source commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`.

## Preserved attempts

Earlier logs remain in the raw-log index. They include an initial test API compile mismatch that was corrected, incomplete upstream checker compile and capture attempts while N1 was implementing its independent replay, and a mutation-helper JSON-span bug that initially made one descriptor overlay malformed. The helper was corrected to replace only the selected JSON token, and the descriptor control was tightened to require the semantic `invalid role identity` diagnostic. Intermediate checker mismatches for snapshot DOM projection, injected seed swaps/stale callbacks, trace array lengths, and disabled-event bridge arrays were reported to N1 and resolved in that lane before the final passing run. A transient unresolved atomic-directory helper during another lane’s package test was also preserved; it landed before the final run.

## Limits

These tests exercise the Go verifier against the finite restored one-parent/one-child fixture and its 12 captured profiles. They do not launch a browser, rebuild the frontend, or certify arbitrary module graphs. Captured producer summary fields are checked for consistency but are not treated as mutation-control results. The mutation cases are local verifier tests over copied evidence, not new browser observations.

This lane changed only its test and controls files. It did not modify Git metadata, the producer, application fixtures, or native coordination state.
