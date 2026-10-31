# XR-ATOMIC — independent N5 review

## Decision: accepted

The sealed N4 archive-helper change implements complete-before-publish archive visibility without changing the exported helper signatures or the `backend-qualification/run.mjs` call site. The review found no must-fix issue within this Linux-tested helper scope.

## Findings

- The helper makes a random, exclusive staging file in the final archive's directory, then passes that staging path to tar. It hashes and lists the stage, extracts it, compares every extracted member's byte count and SHA-256 against the inventory, reads the pre-archive snapshot, and only then publishes by hard link. Because the link is created in the same directory, publication is atomic on the tested Linux filesystem and fails rather than replacing an existing final path.
- Its `finally` removes the temporary NUL list and any stage file created by this invocation when write, tar, list, extraction, member hash, snapshot read, or link operations throw. It preserves a preexisting final archive on `EEXIST` and does not delete a similarly named stage file it did not create.
- The test file has seven tests. The three focused staging/publication cases include a tightened real-tar test that checks final-path invisibility while tar runs, a simulated tar failure, and a preexisting-final/no-clobber failure. The full suite also covers a real inventory-byte mutation rejection. Direct failure injection covers tar and link errors; the cleanup logic for list/hash errors is also inside the common `finally` block, though the suite does not separately inject every list/hash syscall error.
- The current full helper suite passed independently: 7/7 under Node `v22.23.4`, GNU tar `1.35`, Linux. The sealed E-ATOMIC packet's 22 raw-log entries and both source-file pins match their recorded hashes; its native receipt validates.
- The report correctly leaves the cause of previously truncated archives unknown. Staging prevents the final archive path from exposing tar's in-progress output; it does not diagnose or claim to fix that historical cause. Hard-link behavior was exercised on Linux only.

## Independent verification

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-capabilities/archive-helper.test.mjs
```

Result: exit 0, 7 passed, 0 failed, 0 skipped; TAP duration 749.699 ms. GNU tar was `1.35`. The exported `archiveAndVerify`, `createExclusiveAttemptDirectory`, and `writeImmutableSnapshot` function signatures match the parent revision, and the caller diff for `backend-qualification/run.mjs` is empty.

No browser, producer, or full qualification run was performed by this reviewer. The root-owned fresh producer profile remains a separate gate.

## Pins reviewed

| Evidence | SHA-256 |
|---|---|
| Sealed E-ATOMIC report | `80efa71073ec73998f3199c813e00646d56a6a99ea9563e76651e354b4f3e397` |
| Sealed E-ATOMIC receipt | `89bffefe975b9146504e99dc8a92662c59ec7f3d331da54c9e7766cb6628289b` |
| E-ATOMIC rawlog index | `c521d573b588879690c8c5b89653028db8a1a4eaa9c367e03b2c2422469939fd` |
| `compiled-capabilities/archive-helper.mjs` | `df6c99a645d9164461889b8f0585fc79d3c486fc399a84ff7016e8648d2e7e5f` |
| `compiled-capabilities/archive-helper.test.mjs` | `1697da7cbbe9927d75a6907feaba9dc0e4212e8f3e714dca2131715ad23466db` |
| Candidate tree | `a33e9c526f56e981f56cf0d06edb12e0976381b2` |

No source, Git, or shared state was changed during this review.
