# E-ATOMIC

**Worker:** N4  
**Outcome:** `mixed_change`

## Change

Updated only `compiled-capabilities/archive-helper.mjs` and its owned `compiled-capabilities/archive-helper.test.mjs`; exported APIs and caller arguments are unchanged.

`archiveAndVerify` now creates an exclusive, uniquely named staging archive in the final archive’s directory. Tar writes only to that stage. The helper hashes and lists it, extracts it into the verification directory, checks every member and reads the immutable pre-archive snapshot, then publishes the completed archive with an atomic hard link. Hard-link publication fails if the final path already exists; it never replaces that file. A `finally` block removes the NUL list and this invocation’s stage on success or failure.

This prevents readers from observing the final path while tar is still writing and preserves any existing final archive. It does not establish the cause of previously observed truncated archives.

## Tests

Added and extended coverage for:

- real tar staging in the same directory, with checks that the final path stays absent through tar, listing, extraction, and round-trip verification, then appears complete;
- a simulated tar failure, confirming no final archive or owned staging file remains and an unrelated similarly named file is preserved;
- a real round-trip against a preexisting final file, confirming publication fails with `EEXIST`, the old bytes remain unchanged, and the new stage is removed.

Before the helper change, the three targeted regressions failed because tar received the final path directly and the no-clobber test observed an overwritten archive. After the change, the focused three-test run passed. The complete helper test file also passed all seven tests.

Environment: Node `v22.23.4`, GNU tar `1.35`, Linux. The full helper test command was:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-capabilities/archive-helper.test.mjs
```

Result: exit 0, 7 tests passed, no failures/skips/todos; TAP duration 816.272 ms. Focused output and the initial red run are preserved under `portable-coordination/rawlogs/E-ATOMIC/`.

## Pins and limits

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `compiled-capabilities/archive-helper.mjs` | 3,691 | `df6c99a645d9164461889b8f0585fc79d3c486fc399a84ff7016e8648d2e7e5f` |
| `compiled-capabilities/archive-helper.test.mjs` | 17,475 | `1697da7cbbe9927d75a6907feaba9dc0e4212e8f3e714dca2131715ad23466db` |

The focused tests exercised atomic publication locally; the root-owned fresh full producer profile is a separate gate and was not run by N4. No Node producer, runner, application, fixture, Git, or shared state was changed. The Linux hard-link publication path is not evidence for other operating systems. The cause of the previously damaged archive files remains unknown.
