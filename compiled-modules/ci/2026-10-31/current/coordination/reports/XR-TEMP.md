# XR-TEMP — independent review of UTF-8 fixture cleanup

**Decision:** `accepted`. **Reviewer:** N5.

## Findings

The sealed E-TEMP runner snapshots names with the `utf8boundary-` prefix before focused tests, then reads the canonical tracked `app.go` bytes. Its cleanup considers only newly appearing, direct prefix entries. Before any removal it requires an ordinary directory with exactly one ordinary `app.go` whose bytes match the tracked fixture; it collects all unsafe entries and fails before deleting any candidate if one is unsafe. Before unlinking it rechecks directory and file type, directory children, device/inode identity, and exact bytes. It removes the file with `unlink` and the now-empty directory with `rmdir`; it never recursively removes an unknown tree.

The cleanup helper region in sealed E-TEMP `run.mjs` is byte-identical to the region in final source commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`. The current file differs from the sealed E-TEMP copy only in the separately approved archive-snapshot location/inventory overlay; the diff is preserved in the reviewer rawlogs. The final committed file is the source used by the final producer attempt.

I replayed the five focused cleanup cases against the current source: a new exact copy is removed; a preexisting matching directory is retained; changed bytes are rejected and preserved; an extra file is rejected with both entries preserved; and a symlink is rejected and preserved. An additional independent witness replaced the candidate directory after initial validation; the identity recheck rejected it before removal and left both the replacement and moved original intact. Node syntax validation passed, and the shared archive-helper tests passed 7/7.

The final producer receipt for source commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0` is `passed`, has matching source pins, and reports a clean Git source closure before and after. Its focused compiler test record observed no newly generated `utf8boundary-*` directory, so that full run did not exercise a positive cleanup. The focused regression supplies the positive deletion evidence. The producer completed 24 fixed source events / 16 Go updates / 17 state checkpoints, 12 browser profiles, 6 mutation controls, and an independently consumed 529-member archive; these are producer-receipt context, not a full rerun by this reviewer.

The original E-TEMP failure witness remains accurately bounded: `ae701` recorded a newly appearing path `fixtures/compiled/utf8boundary-2424491191/app.go` and failed the final source/status check, while the specific action that created it was unverified. All 9 E-TEMP indexed raw files and 3 referenced inputs match their sealed hashes. The E-TEMP report and receipt also match their seal. The separate historical E-SNAPSHOT archive-location issue is not a cleanup failure; the final producer archive completed and its independent-consumer record passed.

## Scope and limits

This review does not attribute the historical temporary path to a particular command, claim that every producer run creates such a path, or claim race-free deletion against an adversarial concurrent process after the final path-based recheck. The validation was limited to cleanup behavior, source custody, syntax, the requested helper suite, and the preserved final producer receipt; I did not rerun the full producer or browser profile.

## Reviewed identities

- Sealed E-TEMP report: `a296ac2f1e64fddbbfb354bcabfc35b1b4168b3b539d89172c60a232bda144d9`
- Sealed E-TEMP receipt: `7ae32e04504d322f51c4f6eab05826853b36b30a341f68a539dbb47f19f96630`
- Sealed E-TEMP cleanup source: `b0286a398073eb6e7fa01d965714628457d1ee0a6c1a83565629580cc644ca42`
- Final committed runner: `7c46f2bb16acfefb9a2beaaea63dac750b9bb4022ab192d4c452ff9db485b12c`
- Extracted cleanup region (sealed and final): `f2f8662629623db3811386f9a4d252909df6f58dc4a11847940a4c96d9f8eebf`
- Final producer receipt: `38246a62989fd77ef7f6af32752be1e23249c262f15cb8bd8f33fc29fab3093c`
- Final producer archive: `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c`

Reviewer logs, copied regression, identity witness, and audit are indexed under `module-coordination/rawlogs/XR-TEMP/`.
