# Backend qualification results

This file describes the reproducible acceptance profile. It does not claim a run until an immutable per-attempt receipt records one.

## Acceptance evidence

The focused runner requires all 13 cases: three healthy profiles and five actual fault families on each backend. Healthy cases must complete the full 50-event source scenario and 46 state checkpoints. Fault cases must activate on the actual mounted renderer or callback path and produce a Go-recognized observation channel from live evidence. Infrastructure errors, page errors, generic exceptions, inactive faults, duplicate/missing cases, and evidence hash mismatches fail qualification.

The Go certificate is authoritative. It checks the complete case registry, validates each evidence file against the raw-report SHA-256, derives expected channels from the registry, and rejects unknown or insufficient measurements. It certifies the measured backend/evidence pairs and source pins; it is not proof against a malicious producer that fabricates browser evidence. The demo renders the captured evidence and certificate without reclassifying results.

This matrix qualifies the admitted React and DOM backends and the healthy renderer-swap case. It does not automatically certify another backend. A third backend requires an explicit shared-renderer ABI and host policy, a Go registry/profile extension, and the same positive and activated-negative browser evidence. Existing 16 captured-data mutation controls remain distinct from the ten new mounted fault cases.

## Reproduction

Run `bash run-backend-qualification.sh --source-commit <candidate-commit-sha>` with the pinned toolchains and locked dependencies. Each attempt records exact commands, versions, source pins, case counts, activation counts, observed and expected channels, failures, mismatches, archive hashes, and independent-consumer output under `backend-qualification/evidence/attempts/<attempt>/`. The source tree and archive are checked again after consumer execution.

Do not infer a successful qualification from unit-level mutation controls or from the presence of the demo. Only a complete 13-case mounted capture followed by a successful Go certificate and HTTP smoke qualifies. The full inherited regression pipeline is outside this focused runner and remains a separate root/CI gate.
