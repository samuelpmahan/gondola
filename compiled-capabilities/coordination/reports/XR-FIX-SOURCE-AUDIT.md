# XR-FIX-SOURCE-AUDIT: independent review of provenance and scheduler audit fixes

## Decision

**Accepted for the bounded auditor repair.** N1's finalized provenance and scheduler auditors pass their focused suites and the current event evidence checks. The historical E-BUILD attempt remains failed; this review does not accept that run or the milestone.

N1 made a late fixture-independence/commented-decoy adjustment after its first close. I reviewed and pinned the finalized author receipt (`4aa73c491f97452eac101c051f132d9fbb3f790f54191c09a46dcbae883aed05`) and reran the 7-test Node suite after that adjustment against the finalized test source.

## Provenance auditor

The parser reads the actual source runner declarations, including `new Set([...])`, while ignoring a commented decoy declaration. Its focused cases exercise escaped quotes and bracket characters in string literals and reject empty elements, nested arrays, non-string syntax, and malformed wrappers. The actual historical source audit test uses the pinned `031c462` runner bytes and the exact 161-pin failed E-BUILD receipt fixture. It verifies all 161 before/after pins, tree/blob bytes, local/remote source identity, source ancestry, and the original M0 manifest. It finds no source-pin or M0 failures; the only failure is the expected E-BUILD failed-status ledger, and `finalAcceptance` stays false.

The follow-up regression creates disposable local and remote commits with the historical source tree and the published `a2e1164d68abaaa7d028bdaf6a20bea842a131ae` as direct parent. It verifies equal trees and ordered parent arrays, actual Git commit identity, and ancestry to the frozen `00da54ad…` base. Additional cases permit equal local/remote commit IDs and reject a changed parent identity. The signed M0 map is pinned at SHA-256 `9cb7fa3ff84042c36b9ac211dfe2b97a69169e4fb880283e8f000495a8216a54`; the manifest remains 24 rows, 23 tracked inputs plus the generated map.

The pinned runner lists root `go.sum` as a candidate but stats and omits absent files on `ENOENT`. That file is absent from both the pinned `031c462` Git tree and the working tree. The provenance auditor mirrors the single absent-Git-entry exception for root `go.sum`; all other declared files must exist as regular blobs. Exact source-set comparison ensures this optional input does not excuse other missing or unpinned source files.

## Scheduler auditor

The scheduler audit recognizes the original startup failure and the exact second runner-acceptance failure event. I compared the second event with the pinned constant and its log: local source `031c462…`, remote source `a2e1164…`, exact command and failure text, observed CLI exit 0, repo-relative log path, SHA-256 `bf66825486126f9ee1bfa6438a4c0f939efcec5356eec9e136c51e3f2ef0468d`, and the `compiled-capabilities: failed (full)` marker all match. The event adds the exact two repair/review pairs, with each review depending on its corresponding extraction repair. The original startup-event fields and log hash remain pinned.

N1's Python suite rejects changes to the second event's remote source and repair-review dependency, still rejects the original startup log hash mutation, and rejects moving an AMEND extension before completion of its amend-decision review. I also ran in-memory mutations against the second event: a changed pinned log hash, changed remote source, broken source-audit review dependency, and reordered AMEND extension were all rejected. The stored scheduler state was not modified by these probes.

The current read-only scheduler audit is `INCOMPLETE`, with zero structural errors. It reports 28 accepted native epochs, six actual initial spawns, and 60 packets. The open-job finding lists 13 packets as pending or running, including this XR-FIX-SOURCE-AUDIT review and the queued acceptance jobs. This is an open-work status, not an audit failure.

## Verification

- Node `v22.23.4`: `node --test compiled-capabilities/coordination/acceptance/provenance/audit.test.mjs` passed 7/7 after the final fixture adjustment. The end-to-end regression uses the 161-pin failed receipt and synthetic `a2e1164d`-parented commits in a disposable Git object store.
- Python `3.12.14`: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v test_audit.py`, from `compiled-capabilities/coordination/acceptance/scheduler/`, passed 16/16.
- `python3 compiled-capabilities/coordination/acceptance/scheduler/audit.py --json` exited 0 and returned `INCOMPLETE` with no structural errors. The review audit separately verified the current event and in-memory mutation results.

The independent review audit and command logs are under `coordination/reviews/XR-FIX-SOURCE-AUDIT/`. No production, author, Git, native, or scheduler state was changed by this review.

## Limits

The historical full E-BUILD receipt remains failed at `inherited-static-and-interaction-lifecycle`; its failed status is intentionally preserved by the provenance auditor. The live scheduler remains incomplete while the listed packets are pending or running. This review covers the two auditor repairs and their finite regressions only.
