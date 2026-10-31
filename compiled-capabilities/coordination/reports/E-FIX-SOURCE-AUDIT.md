# E-FIX-SOURCE-AUDIT: provenance and scheduler evidence auditors

**Worker:** N1  
**Outcome:** `mixed_change`  
**Status:** repair verified against the current source evidence; the historical E-BUILD receipt remains failed and is not accepted

## Repairs

The provenance auditor now parses the pinned `compiled-capabilities/run.mjs` declarations as literal string arrays, including `new Set([...])`. It scans to the matching closing bracket while respecting escaped double quotes, rejects non-string expressions, array holes, nested arrays, missing commas, and an unterminated Set wrapper. The declared root `go.sum` candidate is treated as optional only when absent from the Git tree, matching the runner's own `stat` behavior; all other declared source files remain required.

Publication binding still freezes `base.commit` to `00da54ad0f5a4006b13a5cded18ce291845978bc` and verifies its actual tree and original M0 bytes. Local and remote source records must have the same tree and the same ordered direct-parent list. The auditor compares each record against Git's actual commit tree and parents, requires the frozen base to be an ancestor of both source commits, and requires the local source commit to be the tested `HEAD`. This accepts a normal follow-up commit parented by the published `a2e1164d68abaaa7d028bdaf6a20bea842a131ae` while retaining the original base. It also permits local and remote to name the same commit when their exact Git identity matches.

The scheduler auditor now recognizes exactly the original startup failure event and the epoch-18 runner-acceptance failure event. For the latter it checks source `031c462bcd72c0ae0bee2dc05a0972b3902ca40c`, remote source `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`, the pinned command and failure text, observed CLI exit `0`, the log path and SHA-256, the log marker, exact four-job extension order, and both repair/review relationships. The original startup-event constants and evidence checks remain intact.

## Verification

- Node `v22.23.4` syntax checks passed for `audit.mjs` and `audit.test.mjs`.
- The provenance suite passed all 7 tests. Its end-to-end regression uses byte-for-byte copies of the actual historical E-BUILD receipt and signed generated map under `acceptance/provenance/fixtures/`, materializes the source tree at `031c462bcd72c0ae0bee2dc05a0972b3902ca40c`, and audits all 161 before/after pins. In a disposable temporary Git object store, it creates distinct local/remote follow-up commits with the source tree and direct parent `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`. The auditor confirms Git parent identity, ancestry to frozen base `00da54ad…`, the 161 pins, the original 24-row/23-tracked-plus-generated M0 manifest, and M0 bytes. A parent-identity mutation is rejected. Temporary commits and files are removed after the test; no shared Git refs, index, objects, or worktree are changed.
- The actual historical E-BUILD receipt remains `status: failed`, so the end-to-end audit correctly keeps `finalAcceptance: false`; this test verifies provenance and M0 integrity without converting the failed run into acceptance.
- The scheduler suite passed all 16 tests. The live event ledger remains explicitly incomplete while jobs are open, with no audit errors. Negative mutations to the epoch-18 remote source and source-audit review dependency are rejected; the original startup-log hash mutation is still rejected.
- A missing-binding preflight remains `status: incomplete` with `finalAcceptance: false`.

Raw outputs and SHA-256 pins are recorded in the E-FIX-SOURCE-AUDIT directories under `acceptance/provenance/logs/` and `acceptance/scheduler/logs/`.

## Scope and limits

Only `compiled-capabilities/coordination/acceptance/provenance/**`, `compiled-capabilities/coordination/acceptance/scheduler/**`, and this packet's report and receipt were changed. Original E-PREP-PROVENANCE, XR-PREP-PROVENANCE, startup-failure logs, and earlier review evidence were left unchanged. The auditor repair does not change the failed E-BUILD receipt or claim full capability acceptance. No state/native/shared-Git changes, commit, merge, or deployment were made.
