# XR-ORACLE (N2): independent review of E-ORACLE

**Decision: `amend`.** The scenario, independent state/view oracle, and native Go trace agree. E-ORACLE’s closed source pin for its protocol-audit script no longer matches the current file, and the original pinned bytes are unavailable according to the N5/root custody incident. I am not accepting the closed packet until that audit evidence has a fresh, hash-consistent packet.

## Review scope

I reviewed the frozen contract, N5’s report and receipt, the N1 scenario and native CLI, the oracle scenario and expectations, the oracle source/tests, and the saved native trace. I did not alter those artifacts.

## Semantic review

The fixed script contains 42 events. Four are no-Go-tick preflight records (disabled action, compatible renderer marker, stale-callback marker, rejected-renderer marker), leaving 38 Go steps and 39 checkpoints when the initial state is included.

`oracle.mjs` contains literal value snapshots `s0` through `s38`; it does not import or run the Go `Update` reducer. Its `expectedView` and `expectedDOM` functions separately project each literal value snapshot into a Gobi tree and a normalized DOM/controls record. All 39 projections include state, tree, view record, and DOM fields. The closed structural comparator checks the complete state shape and array order, so parent and child lifecycle fields, nested counter state, collection ordering, messages, and effect order are checked rather than only selected values.

The Go CLI resolves each `click` path against `children.View(state)`, checks the handler message and disabled state, then executes the resolved message. A reviewer mutation changed event 0 to path `99/99`; the CLI exited 1 with `event 0: path "99/99" has invalid child index "99"`. Thus click-path validation is executable in the native trace path, not just copied scenario metadata. Renderer swaps and the stale-callback marker remain native preflight metadata; they do not establish mounted browser behavior.

Node 22 ran all 9 oracle tests successfully. The four committed negative controls reject a changed cancellation order, reordered Go value slice, mutated Gobi key, and mutated DOM text. A fresh Go 1.24 native trace is byte-identical to N5’s saved trace (653,879 bytes); `assertNativeCapture` accepts it with all 42 events, 38 steps, and 39 expected checkpoints. This verifies native Go state, effects, and Gobi trees. The normalized DOM is still an independent expected projection, not a browser capture. Actual mounted DOM, renderer replacement, and callback parity remain N4’s integration gate.

## Must-fix custody finding

E-ORACLE receipt `sourceSha256` pins `compiled-children/oracle/audit-native-protocol.mjs` to `7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e`. Current bytes hash to `f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853`. The N5/root incident reports that N5 edited this optional audit after E-ORACLE closed and could not recover the original bytes. I independently recalculated every source pin in the E-ORACLE receipt: scenario, expectations, oracle implementation/tests, saved native trace, test log, and E-ORACLE report match; the audit script is the sole mismatch. The existing audit JSON output still matches its recorded digest, but it cannot restore provenance for the changed script. E-ORACLE’s report and receipt remain untouched.

This is why the review decision is `amend` despite the semantic oracle checks passing. The audit script/evidence needs a new hash-consistent author packet before a later XR-ORACLE review can accept it.

## Verification

Runtime versions: Node `v22.23.4`; Go `go1.24.0 linux/amd64` with `GOTOOLCHAIN=local`.

| Check | Result | Evidence |
|---|---|---|
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/oracle/oracle.test.mjs` | Exit 0; 9 passed, 0 failed. | [`N2-XR-ORACLE-node-test.log`](../rawlogs/N2-XR-ORACLE-node-test.log) |
| `GOTOOLCHAIN=local /tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json` | Exit 0; fresh trace byte-identical to N5 saved trace. | [`N2-XR-ORACLE-native-fresh.json`](../rawlogs/N2-XR-ORACLE-native-fresh.json), [`N2-XR-ORACLE-native-fresh.stderr.log`](../rawlogs/N2-XR-ORACLE-native-fresh.stderr.log) |
| `/tmp/gondola-node22/node_modules/node/bin/node compiled-children/coordination/rawlogs/N2-XR-ORACLE-compare.mjs` | Exit 0; exact trace equality and oracle counts/projections confirmed. | [`N2-XR-ORACLE-compare-replay.log`](../rawlogs/N2-XR-ORACLE-compare-replay.log) |
| Native CLI on reviewer scenario with mutated event-0 path | Expected exit 1; invalid child index rejected before a trace was emitted. | [`N2-XR-ORACLE-path-mutation.input.json`](../rawlogs/N2-XR-ORACLE-path-mutation.input.json), [`N2-XR-ORACLE-path-mutation.stderr.log`](../rawlogs/N2-XR-ORACLE-path-mutation.stderr.log) |
| Recalculation of E-ORACLE source/report/evidence pins | One mismatch: current protocol-audit script SHA differs from receipt. | [`N2-XR-ORACLE-source-pins.log`](../rawlogs/N2-XR-ORACLE-source-pins.log), [`N2-XR-ORACLE-source-pins-exit.log`](../rawlogs/N2-XR-ORACLE-source-pins-exit.log) |
| Read-only receipt validation via `probe.validate_receipt` | Exit 0; active XR-ORACLE/N2 packet accepted; every reviewed-source, report and referenced command-log hash matched. | [`N2-XR-ORACLE-receipt-audit.py`](../rawlogs/N2-XR-ORACLE-receipt-audit.py), [`N2-XR-ORACLE-receipt-audit.log`](../rawlogs/N2-XR-ORACLE-receipt-audit.log) |

The native test warning `[UNDICI-EHPA] EnvHttpProxyAgent is experimental` appeared; test and comparison commands still exited 0. No production/oracle files, Git state, or scheduler state were changed in this review.
