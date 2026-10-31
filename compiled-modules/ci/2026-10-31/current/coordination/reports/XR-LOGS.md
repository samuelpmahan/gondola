# XR-LOGS — independent review of unique producer logs and test discovery

**Reviewer:** N2  
**Decision:** accepted  
**Author packet:** N4 E-LOGS  
**Scope:** sealed run.mjs at SHA-256 707226121e9baf65fd092d8a574dbc7df9e9c88904e3f1b97bdf7fd25ac2f668, its source diff, four actual Git metadata command records and 12 output files, test discovery and captured helper-test/syntax results, plus the preserved f984 collision failure.

## Finding

E-LOGS fixes the recorded final-check log collision. Before and after Git metadata commands now use distinct labels (git-before-head, git-before-status, git-after-head, git-after-status). I verified the regression run’s actual temporary directory contains exactly the four command records and their eight stdout/stderr files. Each command exited 0, each stderr file is empty, the output and command-record hashes match the copied raw evidence, and no log contains EEXIST.

The sealed discovery function keeps the four existing compiled-modules test directories and appends only compiled-capabilities/archive-helper.test.mjs. It deduplicates and sorts the list. The actual discovery result contains the four expected module suites plus that one helper test, exactly once. The helper suite output reports 7 passed and 0 failed; the syntax check exited 0.

The E-LOGS report, receipt, source copy and indexed evidence match their seal and source pins. The stored diff from E-PARSER matches the sealed source bytes. Its change set contains the phase-specific Git names/call sites and the narrow helper-test discovery adjustment; the whole-stdout JSON parser correction was already present in the E-PARSER baseline. Profile counts and schemas are unchanged.

## Later full-run status

The root-designated later producer attempt is pinned to source commit ae701cfd47c631aa005a73e9d16273414486b24d. Its captured before-status output is empty; after-status contains only the untracked generated fixture fixtures/compiled/utf8boundary-2424491191/app.go. The attempt's conformance summary is matched for 12 profiles, and its demo HTTP smoke is passed. Its before and after Git HEAD outputs are identical. This is a source-tree cleanup issue at final status comparison, separate from the EEXIST log collision; it does not invalidate the E-LOGS unique-name fix or establish final producer acceptance.

The E-LOGS source has since been overlaid by the separately authorized E-TEMP cleanup repair. At the final source comparison for this review, the live file was 46,726 bytes with SHA-256 b0286a398073eb6e7fa01d965714628457d1ee0a6c1a83565629580cc644ca42. Its Git metadata and discovery functions, before/after Git call sites, helper source pin and focused Node invocation remained unchanged from the sealed E-LOGS source. The E-TEMP Go-test cleanup implementation is outside this review.

## Preserved failure and limits

The original f984 producer failure remains intact: it failed with EEXIST while opening the second git-head.stdout.bin. Its source command record and log hashes are independently verified. E-LOGS is accepted as the bounded log naming and test discovery repair; this review does not claim the later ae701 full producer passed final source comparison or overall acceptance.

The reviewer audit required corrections: one pass used the old f984 log's byte count for the later producer log, another observed a changing live overlay, and the coordinator's later producer log was replaced while this review was in progress. Those raw audit outputs are preserved. The final audit uses the sealed E-LOGS source as the reviewed artifact and separately checks the stable attempt artifacts and that the observed live overlay left the logging/discovery behavior unchanged.

Exact artifact, command-record, log and evidence hashes are recorded in module-coordination/rawlogs/XR-LOGS/independent-audit.json and index.json.
