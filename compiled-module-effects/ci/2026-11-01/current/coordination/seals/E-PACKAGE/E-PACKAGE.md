# E-PACKAGE — effects publication preparation

**Worker:** N1  
**Outcome:** `mixed_change`  
**Phase:** publisher tooling prepared  
**Status:** pending clean E-RUN/E-DELIVERY primary and root final packaging  
**Source commit observed:** `f4c8f70199a8ca896c13e225a85901abe658d0de` (worktree dirty during preparation)

## Prepared toolchain

The external publisher is under `/tmp/module-effects-publish/publisher/`:

- `prepare_parts.py` accepts an effects primary archive and its manifest, checks exact manifest fields through the frozen `restore.py` validator, requires `sourceCommit == verifierGitHead == clean Git HEAD`, verifies the full declared source closure and source pins, checks archive bytes and SHA-256, and validates every tar member before splitting.
- `pack_audit.py` snapshots the coordination evidence tree, creates a deterministic gzip tar containing regular files only, writes `gobi.module-effects-audit-members/v1`, and splits the audit into exact 1 MiB parts.
- `common.py` provides strict path, Git, member, archive, segment, and hash checks. Both indexes use `gobi.module-effects-segments/v1`; `memberCount` and `sourcePinCount` come from validated manifests and are passed through the restore tool’s bounded count checks.
- Each part records exact bytes and SHA-256 in the restore-facing index. Separate detailed upload sidecars record Git blob SHA-1 from read-only `git hash-object --stdin` calls without `-w`; the legacy upload list retains the uploader’s `{name, sha}` shape.
- `README-PUBLISHER-TEMPLATE.md` gives clean-run preparation, restore, and demo commands with explicit immutable source/evidence URL placeholders. Root can fill those after the final accepted run.

The audit includes reports, receipts, seals, native ledgers, protocol addenda, raw logs, failed witnesses, and traces by default. Exclusions are limited to recognized cache folders, an extracted copy proven byte-for-byte equal to the primary manifest, or a file whose complete bytes match the separately published primary archive. When excluded files are referenced by an authoritative index, the audit embeds `audit-exclusions.json` with their path, byte count, SHA-256, reason, and referring index rows. The packer checks file bytes as it writes and compares file/directory snapshots before and after packing.

The frozen `/tmp/module-effects-publish/restore.py` remained unchanged (SHA-256 `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98`); `/tmp/module-effects-publish/consume-prep-v2.py` also remained unchanged (SHA-256 `c1d7fed5afb75ca2cecbed4df8ddca50890d3cafd60dd5b0bfbc032e2a1e8a82`).

## Fixture verification

Six fixture tests passed. They check derived member/source-pin counts, effects schema compatibility, one MiB segmentation, SHA-256 and Git blob IDs, clean-commit and source-closure binding, archive member pins, deterministic audit bytes, preservation of reports/receipts/seals/native/protocol/failed-trace evidence, explicit index-referenced duplicate exclusions, symlink rejection, and source mutation detection during packaging.

The initial test attempt failed only because its assertion expected a SHA diagnostic after appending a byte to the archive; the tool correctly rejected the earlier length mismatch. That exact failed output is preserved at `rawlogs/E-PACKAGE/tests/failure-01-assertion-mismatch.log`. The assertion now checks the observed length guard; the final suite passed 6/6. Python syntax compilation and both CLI help commands also passed.

Exact tool and test source snapshots, hashes, commands, versions, and logs are indexed in `rawlogs/E-PACKAGE/index.json`. The five final publisher source/test/guide files byte-match their captured source snapshot. The test parts use `git hash-object --stdin` without `-w`; no Git objects, refs, or source files were written.

## Acceptance boundary

No clean effects primary archive and manifest were available for this lane. I used only temporary synthetic fixtures, did not run the production packer against the dirty shared worktree, and did not create an acceptance archive or publication. The final clean source check, archive manifest, final primary/audit parts, restore exercise, and immutable Git URLs remain root’s later gate after E-RUN/E-DELIVERY.
