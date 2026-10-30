# XR-O-CHECK — independent checker review

## Decision

**Accepted.** The frozen checker implements the reviewed O-CHECK contract. I found no blocking mismatch in the required actor channels, transport accounting, input/focus evidence, rejection comparison, or native frame/shard retention.

## Review basis

I read `coordination/reports/O-CHECK.md`, `coordination/ORACLE-REPAIR.md`, `DESIGN.md`, the frozen positive helper and focused tests, and inspected the current `check.mjs` without running the O-PROBE mutations again. The checker SHA-256 is `fea6e333b301a010fab306475b2d9b5eae8c2b918b8defa4045c8384b8f1d422`, matching the hash in O-CHECK. The positive helper SHA-256 is `9012ba366e959cecd8791c25c1f35267f9dd822394427cb219af8b094b163174`; the focused test hash is `ea153f9dc5b2b6a9a70a9ffec13786434c6e48490e95c9b9349ed8c293a6dc76`.

## Findings

- **Required channels and frame coverage:** Each candidate and reference action frame must provide `managerEffects`, `managerCalls`, `transportCalls`, and a safe nonnegative `{before, after}` transport clock. Missing or malformed channels produce mismatches. Native, model, and browser frame arrays must be nonempty and action-count aligned; each native frame must contain `tree`, `sessions`, and `changes`. The runner records each complete scenario, including native input and frames, in a JSON shard and records its byte count and SHA-256 in the raw manifest.
- **Transport and Go command matching:** Per-actor clocks chain from zero, each clock delta must equal the events recorded for that action, and each event sequence must be contiguous. Events must identify the actor side, positive session, positive host generation, known kind, and payload. Start/cancel events are matched in order to successful Go `effects` results and `disposeTree` command bundles; cancellation ownership state and ignored invocations are checked. Delivery is tied separately to `complete` actions and shares the same clock. Candidate/reference parity is an additional check, not a replacement for per-actor validation.
- **Input and focus evidence:** Expected input mode is derived from the preceding native snapshot and keyed input node, including its disabled flag. Declared witnesses require actor observations. Enabled witnesses bind requested/effective values to the event Step and manager dispatch. Disabled witnesses require a real click with zero click/input handlers and manager dispatches, unchanged input value and native/manager snapshot, and empty change receipts. A direct-manager guard is separately identified and checked when supplied. Focus eligibility is derived per session from the native state/tree and enabled input action; required candidate replacement evidence checks keyed physical focus, a backward noncollapsed range before, immediately after, and after settling, stable state/tree, and a changed renderer. Reference physical focus is checked from that action's reference frame.
- **Error-result scope:** Operation results compare successful values exactly and compare failures by rejection outcome. This intentionally permits independently worded errors, while the tested wrong-parent rejection-to-success mutation fails. The checker makes no verbatim error-text claim.
- **Independent controls:** The frozen O-PROBE report binds the executed checker and positive helper hashes above. Its 14-action baseline passed with zero issues; required channel, focus, blocked-input, transport-order/omission, and changed-outcome mutations were rejected, while an error-prose-only change remained accepted as specified. This review did not rerun that probe or the default/full replay.

## Boundary

The checker rejects invalid or absent event host-generation metadata rather than weakening that validation. Root separately reported a producer-side `generation=null` finding from its actual replay, with N5 assigned to repair the fixture producer. That producer finding does not indicate a checker defect and remains a separate integration gate. No default replay or full inherited runner result is claimed here.
