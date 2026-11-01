# XR-RUNPORTABLE — independent review of the portable producer run

**Worker:** N1  
**Job:** XR-RUNPORTABLE  
**Decision:** `accepted` — accepted as a clean, source-bound producer run and built-in archive round-trip only. External consumption and publication readback remain pending.

## Source and archive verification

The reviewed source commit is `e0933465725e470dc610e3f81b4bbee95538c1d0`, tree `0a52ae23ab32e0ca35f6b1385ea851e3edeede3a`, parent `f6c9da1b9299a983f8a55c86ddbb0ab7543a1204`. The checked out worktree was at that commit and clean. I independently compared all 202 source pins against the worktree, `git cat-file` blobs at the source commit, and corresponding `source/` archive members; all 202 matched. The 58-file pinned test-source inventory derives from the source pins. The seven executed Node test files are all pinned and include the loader relocation regression.

The archive hash and size match the manifest and report: 8,667,568 bytes, SHA-256 `7eb9f28fc6504bf43207436dfc916549bb28e34059cee69bc138376be7940087`. I streamed every member from the archive and verified the exact 639-member unique regular-file inventory and each member’s size and SHA-256 against the manifest. The manifest, runner receipt, build index, and copied runner receipt match their recorded pins. The built-in independent Python archive consumer and round-trip are recorded as passed. The archive itself was not copied into this review packet.

The raw evidence index lists 118 files totaling 90,539,194 bytes; every listed path, byte count, and hash matched. The runner receipt, command JSON records, and archived snapshot bind the same source commit and pin map. The archived before/after Git command outputs record the expected commit and empty status.

## Command, test, and count review

All 20 runner command records and three separately recorded archive helper records have unique names, successful exit codes, and matching command JSON files. The 19 pre-archive command records match the archived execution-snapshot prefix exactly; the receipt has exactly one post-archive independent Python consumer command. All 23 command JSON files match the runner receipt records exactly. Materialized command streams (38 of 46 stdout/stderr streams) match their recorded byte and hash pins. Eight streams have `null` log paths; their byte/hash records remain in the command JSON. The build summary is byte-identical to its command stdout pin; the conformance and demo results are preserved as separate artifacts. The underlying stdout/stderr bytes for those eight streams were not independently rehashed from separate files.

I derived the scenario and capture totals from the archived JSON rather than relying on printed totals. Four scenarios contain 178 native events; the four native captures contain 182 states and 58 effects. Twenty captures across the five direct/browser profiles contain 890 events and 910 snapshots. The oracle’s application matrix contains 64 rejected applications: 16 IDs in each of four scenarios. The capture and build admission controls contain 16 and 7 rejected controls respectively.

The test summaries and runner counts agree: 13 Go tests across two packages, one module ABI regression, four compiler regression tests across eight cases, one build-stage regression, and 36 Node tests across seven executed files. The four React/DOM parent/child builds are present in the build summary and index. The pinned source inventory has 30 Node test source files, of which the recorded run executed the seven listed in its Node test summary.

## Browser and qualification boundary

The recorded Chromium smoke contains six passing steps and four transport-start observations. Each start observed Go pending state together with rendered “Saving”, disabled Save, and enabled Cancel. The saved trace includes three renderer swaps, two accepted timer replies, cancellation of the pending old `b:g1` request, and remount completion at `b:g2`. It records zero page errors and zero failed requests. The demo uses `HTMLElement.click()` and completes by echoing the opaque Go token; it does not claim persistence or an HTTP request.

This review accepts the producer’s clean source-bound build, conformance, demo, archive, and built-in Python round-trip evidence. It does not accept the independent N5 consumer or published Git readback. The outer archive consumer must still complete a fresh clean archive run, and publication readback remains a separate gate. E-REG M0/counter and E-KEYEDREG are separate evidence and were not rerun.

Exact audit commands, all 202 pin comparisons, all 639 member checks, command checks, and the verified result are indexed in `rawlogs/XR-RUNPORTABLE/index.json`.
