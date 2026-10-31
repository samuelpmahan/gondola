# XR-PACKAGE — independent review of the frozen evidence package

**Decision:** `accepted`. **Reviewer:** N4.

## Package integrity

I independently checked the frozen package at `/tmp/modules-publish/audit/packages/final-audit-root-release`. All 27 part files match their indexed byte counts and SHA-256 values, respect the 1 MiB ceiling, concatenate in declared order to the 27,304,234-byte archive, and match the archive SHA-256 `9fa92163b8bf249ef547fe80369749982b7ec522d00f3ed6e6f4fbff7271aadf`.

The archive has 3,583 unique safe regular-file members totaling 392,724,461 bytes. I checked each member's path, mode, size, and SHA-256 against the external `members.json`; the archive order matches the path-component-sorted manifest. The member manifest is exactly equal to the stable inventory's `payload_files` list. The snapshot inventory reports 11 source roots with byte-identical before/after copies, including 1,522 coordination files, four original build outputs, two numeric build outputs, the post-UTF-8 builds, and preserved failed-attempt trees.

## Release freshness and candidate history

The package includes the final producer receipt for source `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`, tree `bcc71cef48f3a4e141daf181b43f8e12a2132f83`. Its status is passed, Git head matches, the worktree is clean, and all 147 source pins match. The lead-acceptance record binds that same source commit and tree. The frozen source snapshot was created at `2026-10-31T21:44:54.867827+00:00` and its source roots are stable.

The archive's `candidate-source.json` is an earlier 45-file ledger for initial commit `85a13949a4daf2de8e16fb285e68ce5ac966387f` and tree `25b02649aaf2b61b758f9ba0068be8a2c97c0826`. Four of those historical entries differ from the later final 147-pin receipt. The post-seal `candidate-ledger-clarification.json` (SHA-256 `71fc1650ee332ba4a7e1234b20cef5336d66332ba6dce92d30912ed5b4118fbf`) identifies the historical ledger and lists exactly the four hash/size differences. Its values match the archived ledger and final receipt; the captured README likewise labels it historical. Root reports a read-only Git tree check confirming the initial commit maps to the historical tree. The package archive is unchanged.

The independent GitHub readback record `/tmp/modules-publish/github-readback.json` (SHA-256 `b9a816275666e7c779d3d9b0db96cef99664fae7177f876a55feeaade2999c37`) reports passed at source `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`, clean `sourceHead`, 169 files matched, and all 147 source pins matched. Its audit archive record exactly matches this package's 27 parts, 3,583 members, byte count, and archive hash.

## Custody and self-reference

All five listed failed producer attempts have their matching `failure-receipt.json` in the archive; each receipt's bytes and hash match the member manifest. The included `custody-notes.json` discloses two unavailable historical items and does not reconstruct them. The package index, member manifest, snapshot inventory, and E-PACKAGE report/receipt are absent from the archive, avoiding a self-hash cycle. External E-PACKAGE report and receipt copies match their sealed copies byte-for-byte. A convenience assembler script beside the package is intentionally outside the archive/index and its hash matches the author receipt.

The initial reviewer pass incorrectly used Python string sorting, which disagreed with path-component sorting for names such as `archive-verify` and `archive-verify-final`. That failed check and output are preserved. Rechecking with path-component order matched both the manifest and the packer's verification order.

## Limits

This review verifies the frozen package, its referenced final-producer provenance, and the later source readback; it did not rerun the producer or browser profile. The captured GitHub reconnaissance in the package recorded 37 workflow runs queued with no conclusions at that time. I do not claim hosted CI passed.
