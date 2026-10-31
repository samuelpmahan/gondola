# E-ORACLE (N5): independent publication oracle

**Outcome: `mixed_change`.** Added a separate literal oracle for the frozen 50-event typed-input and keyed-publication scenario. The hand-authored Go checkpoints do not execute or copy the Go `Update` reducer. The oracle checks full state, NodeRecord view, runtime view wrapper, normalized DOM, ordered effects, and source-event mapping.

## Oracle coverage

[`expectations.json`](../../oracle/expectations.json) contains 46 checkpoints: initialization plus all 45 Go dispatches. It covers typed input step and lock revisions, immutable captured values, out-of-order delivery, stale input rejection, duplicate delivery, keyed child reorder, child key reuse with a new generation, parent removal/remount, and rejection of publications from prior generations. The source fixture remains N1-owned at `fixtures/compiled/publications/scenario.json`.

The literal event table has all 50 source rows. Five host-only rows (6, 7, 26, 27, 28) keep the same Go state index and have no Go step. It preserves nested action metadata, scenario message, resolved message, ordered effects, and source indexes. Probe expectations cover the two disabled physical actions, compatible renderer replacement with three pending requests, suppressed retired callback, rejected incompatible candidate with active React renderer retained, canceled reply rejection, and parent cancellation order `child:elm:g4:r1`, `child:oak:g2:r2`, `parent:g1:r2`.

[`oracle.mjs`](../../oracle/oracle.mjs) lists complete hand-authored state checkpoints and has separate state-to-view and state-to-DOM projections. [`oracle.test.mjs`](../../oracle/oracle.test.mjs) runs a fresh native Go CLI capture and includes negative mutation controls for publication value, child generation, input revision, view ordering, and cancellation order. [`audit-native-protocol.mjs`](../../oracle/audit-native-protocol.mjs) reads and checks the recorded native assignment epochs without modifying scheduler state.

## Verification

| Command | Result |
|---|---|
| `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/compiled-publications-native --script fixtures/compiled/publications/scenario.json` | Exit 0; fresh native capture is 1,148,369 bytes. |
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-publications/oracle/oracle.test.mjs` | Exit 0; 6 passed, 0 failed. The fresh-native test matches all 50 event rows and all 45 Go state/view/effect steps. Five deliberately mutated traces are rejected. |
| `/tmp/gondola-node22/node_modules/node/bin/node compiled-publications/oracle/oracle.mjs --write` | Exit 0; generated the checker input from the independent literal checkpoints and presentation projections. |
| `/tmp/gondola-node22/node_modules/node/bin/node compiled-publications/oracle/audit-native-protocol.mjs` | Exit 0; read-only audit matched native epochs 0–1 with the state event ledger, checked solver constraints/scores, six actual initial spawn acknowledgements, the N1→N3 CLI handoff, and current worker assignments. Scheduler state hash was identical before and after. |
| `/tmp/gondola-rebalancer-env/bin/python compiled-publications/coordination/rawlogs/E-ORACLE-validate-receipt.py` | Exit 0; the pinned native `validate_receipt` accepted E-ORACLE/N5, and the scheduler state was unchanged during validation. |
| Node `--check` on `oracle.mjs`, `oracle.test.mjs`, and `audit-native-protocol.mjs` | Exit 0 for all three. |

Toolchains used: Go `go1.24.0 linux/amd64`; Node `v22.23.4`; Python `3.12.14`; native Rebalancer `1.0.4`. This fixture uses a fixed deterministic event sequence and no random seed. Node commands emit the environment's experimental `[UNDICI-EHPA] EnvHttpProxyAgent` warning; checked command exits are successful.

The native allocation audit found epoch 0 score 600 with zero broken constraints and epoch 1 score 100 with zero broken constraints. Six actual worker starts match the epoch-0 recommendations. At the audit cutoff, the six workers were assigned to E-GO, E-COMPILER, E-NATIVECLI, E-HARNESS, E-ORACLE, and E-DELIVERY. The audit pinned scheduler state SHA-256 `724776f1…`; the scheduler advanced afterward, and the receipt validator observed state SHA-256 `dea19757…` while confirming it did not change during validation. That newer epoch is outside this audit snapshot. Independent review and final project acceptance were still pending; this report does not claim them.

## Evidence boundaries

The final native trace and focused oracle test are pinned in the receipt. Direct compiled React/DOM and mounted-browser parity belong to N4; the full project runner and delivery checks belong to N6. No production source, scenario, compiler, host, scheduler state, or Git history was changed by N5. No full project pipeline, browser capture, merge, or deployment was run in this lane.
