# Renderer replacement coordination protocol

`adapter.py` preserves the native Rebalancer as the assignment solver and
keeps observed work results in a separate acceptance ledger. The legacy probe
accepts extraction outcomes in `finish`; implementation packets and review
reports do not use that outcome vocabulary, so the adapter never calls
`finish` for either stage.

## Initial allocation

`initial-spec.json` and `initial-solve/epoch-00.json` are the captured native
allocation. Run `adapter.py init-ledger` once for the live run; it refuses to
overwrite an existing ledger. The command imports the actual `probe.start`
acknowledgments from the external state file, verifies that each matches the
native assignment and agent identity, and saves the six start times in
`acceptance-ledger.json`. A solver recommendation alone is not recorded as a
start. `initial-native-state.json` archives the six actual starts from the
external state file. Each packet remains open until an author receipt records
a final decision.

An observed lead decision without an author receipt can be preserved with
`record-observation`. Such an observation is explicitly not an author result
and cannot unlock cross-review. For example, a bounded amendment request is
kept on the original packet; the author can append a later accepted receipt
for that same packet.

## Author receipts and review gating

Materialize each lead acceptance from the actual author report as JSON using
this shape, then record it with `record-author-result`. `source_report` retains
the worker's actual completion text; `decision_by` identifies who made the
acceptance decision. The adapter does not treat an agent's started or completed
message by itself as an accepted packet.

```json
{
  "schema": "chainspot.renderer-replacement-packet-receipt/v1",
  "packet_id": "E1",
  "worker": "W4",
  "agent": "/root/replace_react",
  "decision": "accepted",
  "decision_by": "/root",
  "summary": "The lead's actual acceptance decision and concise evidence summary.",
  "recorded_at": "2026-10-30T00:00:00+00:00",
  "source_report": "The actual author completion report, preserved verbatim.",
  "deliverables": ["backend-replacement/react-backend.mjs"]
}
```

Allowed author decisions are `accepted`, `amend`, `blocked`, and `rejected`.
The adapter checks packet, worker, and agent against the initial native
assignment and requires every listed deliverable to exist within this
checkout. It binds the exact receipt bytes with SHA-256 and stores the lead's
decision, source report, and receipt reference in the ledger. Only the latest
`accepted` result for all six packets unlocks review scheduling. An amendment
leaves its original packet open; it does not create an invented repair job or
receipt.

`prepare-reviews` writes a new six-packet spec. It carries through each
author packet's original `task_kind` and `scope` in `author_packet_fields`,
adds the source receipt and deliverable paths, and excludes the author worker
from that packet's eligible reviewers. The review jobs retain explicit
`task_kind`, `stage`, and `packet_type` fields even though native Rebalancer's
legacy schema uses `kind: "extract"` as its solver-compatible packet type.

## Fresh native solve and dispatch

Run the focused coordinator guard checks from the repository root with:

```sh
python3.12 backend-replacement/coordination/test_adapter.py -v
```

`adapter-validation.log` preserves the observed run. The checks confirm that
missing receipts and a later amendment block readiness, self-review edges are
rejected, and a receipt changed after recording is detected.

Install the pinned native package and reproduce the initial assignment from a
fresh state if needed:

```sh
python3.12 -m pip install rebalancer==1.0.4
python3.12 interaction/coordination/evidence/probe.py init \
  --spec backend-replacement/coordination/initial-spec.json \
  --state /tmp/renderer-replacement-initial/state.json
python3.12 interaction/coordination/evidence/probe.py solve \
  --state /tmp/renderer-replacement-initial/state.json \
  --output-dir /tmp/renderer-replacement-initial/solve
```

Use a new run directory for every review solve:

```sh
python3.12 backend-replacement/coordination/adapter.py init-ledger \
  --repo-root . \
  --initial-spec backend-replacement/coordination/initial-spec.json \
  --initial-solve backend-replacement/coordination/initial-solve/epoch-00.json \
  --initial-state /workspace/scratch/39a56936f173/rebalancer/replacement-state.json \
  --output backend-replacement/coordination/acceptance-ledger.json

python3.12 backend-replacement/coordination/adapter.py prepare-reviews \
  --ledger backend-replacement/coordination/acceptance-ledger.json \
  --spec-output backend-replacement/coordination/cross-review/epoch-01-spec.json

python3.12 backend-replacement/coordination/adapter.py solve-reviews \
  --ledger backend-replacement/coordination/acceptance-ledger.json \
  --spec backend-replacement/coordination/cross-review/epoch-01-spec.json \
  --probe interaction/coordination/evidence/probe.py \
  --run-dir /tmp/renderer-replacement-cross-review-01 \
  --receipt-dir backend-replacement/coordination/cross-review/epoch-01/solve
```

`solve-reviews` creates a fresh native state and calls the pinned probe's
`init` and `solve`. It verifies six unique assignments, capacity, every
author-exclusion edge, zero broken constraints, and the exact maximum score
before saving the dispatch matrix to the ledger. It archives the native JSON
solve receipt and binary bundle under `--receipt-dir`; mutable state and
attempt-specific files stay in `--run-dir`. After all six real starts,
`cross-review/epoch-01/native-state.json` archives those native start events.
It does not message or start
workers. The lead dispatches the actual reviewer agents and then records each
observed start with `ack-review-start`, which calls the probe's `start` and
checks the real worker-agent identity.

Record each actual independent reviewer report with
`record-review-result`. Use this receipt shape:

```json
{
  "schema": "chainspot.renderer-replacement-review-receipt/v1",
  "packet_id": "XR-E1",
  "worker": "W1",
  "agent": "/root/replace_harness",
  "decision": "accepted",
  "decision_by": "/root/replace_harness",
  "summary": "The concrete review result and any bounded findings.",
  "recorded_at": "2026-10-30T00:00:00+00:00"
}
```

Review decisions are kept in the ledger outside native `finish`. This preserves
the actual result words and receipt bytes without pretending an implementation
or review outcome is one of the probe's extraction outcomes. No source-manifest
hash is computed here; source freezing remains a lead-owned step.

The archived native state files intentionally retain their `running` packet
statuses: they preserve actual solver dispatch/start history, while
`acceptance-ledger.json` records author and review decisions separately. After
the six independent review receipts are recorded, `manifest.json` binds every
file in this coordination directory except the manifest itself.
