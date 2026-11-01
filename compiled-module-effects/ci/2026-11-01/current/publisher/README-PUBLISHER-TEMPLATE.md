# Effects archive publication guide (template)

This guide describes the prepared publisher tools. Replace every angle-bracket placeholder with a recorded immutable value before sharing a reproduction link. The primary effects archive is produced by the clean E-RUN/E-DELIVERY path; this publisher prepares its strict segment metadata and packages the coordination audit. It does not publish Git refs or perform network writes.

## Fill these values from the accepted clean run

```sh
SOURCE_COMMIT=<40-character-clean-source-commit>
PRIMARY_ARCHIVE=<exact-clean-E-DELIVERY-tar-gz-path>
PRIMARY_MANIFEST=<exact-adjacent-E-DELIVERY-manifest-json-path>
SOURCE_ROOT=<clean-gondola-worktree-root-at-SOURCE_COMMIT>
PRIMARY_RAW_DIRECTORY_URL=<immutable-raw-directory-url-at-publication-commit>
AUDIT_RAW_DIRECTORY_URL=<immutable-audit-raw-directory-url-at-publication-commit>
EVIDENCE_REPORT_URL=<immutable-review-report-url>
```

`PRIMARY_RAW_DIRECTORY_URL` and `AUDIT_RAW_DIRECTORY_URL` must point to immutable raw Git directories containing the corresponding `bundle-parts.json` / `audit-parts.json`, manifest, and named segment parts. `SOURCE_COMMIT` is the verified source commit, not the later publication commit. Keep the run evidence URL exact; do not use a moving branch URL.

## Prepare primary archive segments

Run only after the primary manifest reports matching source pins, a verified archived snapshot, `verifierGitDirty: false`, and a `verifierGitHead` equal to `sourceCommit`. The tool independently checks that the current Git worktree is clean at that commit, checks the full source closure against every source pin, verifies the archive path/length/SHA-256, and reads every regular tar member against the closed manifest before splitting.

```sh
python3 /tmp/module-effects-publish/publisher/prepare_parts.py \
  --archive "$PRIMARY_ARCHIVE" \
  --manifest "$PRIMARY_MANIFEST" \
  --source-root "$SOURCE_ROOT" \
  --output /tmp/module-effects-publish/publisher/output/primary
```

The output contains `bundle-parts.json`, `bundle.manifest.json`, `bundle/`, `bundle-upload-index.json`, and `bundle-part-hashes.json`. The restore-facing index uses exactly the effects schema and required keys, with `memberCount` and `sourcePinCount` derived from the validated manifest. Parts are consecutive `bundle.part-NNN` files of at most 1 MiB; the three-digit restore naming contract bounds a set at 1,000 parts. Each detailed sidecar row records exact bytes, SHA-256, and a read-only Git blob SHA-1 computed with `git hash-object --stdin` (without `-w`). The existing output path must not exist; the tool never overwrites it.

## Package the coordination audit

The audit includes all regular coordination files by default, including reports, receipts, seals, native ledgers, protocol addenda, raw logs, failed witnesses, and traces. It rejects symlinks and special files. Only recognized cache directories, an exact extracted copy of the verified primary archive, or a file whose complete bytes match the separately published primary archive can be excluded. Each exclusion is recorded with its exact path, byte count, SHA-256, reason, primary archive pin where applicable, and any authoritative index rows that refer to it. That record is included in the audit tar itself. An indexed file with a mismatching recorded pin is retained.

The tool compares source file/directory snapshots before and after packing and checks the bytes read into the deterministic tar. It writes a sorted member manifest using `gobi.module-effects-audit-members/v1` and an index using `gobi.module-effects-segments/v1` with `sourcePinCount: 0`.

```sh
python3 /tmp/module-effects-publish/publisher/pack_audit.py \
  --coordination-root <path-to-module-effects-coordination> \
  --source-root "$SOURCE_ROOT" \
  --primary-archive "$PRIMARY_ARCHIVE" \
  --primary-manifest "$PRIMARY_MANIFEST" \
  --output /tmp/module-effects-publish/publisher/output/audit
```

If there is no primary archive to cross-check yet, omit both `--primary-archive` and `--primary-manifest`; no archive/extraction duplicate is excluded in that case. The CLI still requires a clean source Git worktree and binds the audit index to its `HEAD`.

## Restore and run

Use new, nonexistent destinations. The frozen restore tool verifies the exact schemas, bounded counts, segment sizes and hashes, source commit/manifest binding, regular tar members, full gzip EOF, and member bytes/hashes before atomically publishing a destination without replacing an existing one. The restore guarantee requires Linux `renameat2(RENAME_NOREPLACE)`; unsupported platforms fail closed.

```sh
python3 /tmp/module-effects-publish/restore.py <new-primary-destination> \
  --base-url "$PRIMARY_RAW_DIRECTORY_URL"
python3 /tmp/module-effects-publish/restore.py <new-audit-destination> \
  --audit --base-url "$AUDIT_RAW_DIRECTORY_URL"
python3 -m http.server 9000 --directory <new-primary-destination>/demo/site
```

Open `http://localhost:9000/` to run the packaged demo when `demo/site/` is present in the accepted primary archive. To replay native scenarios, follow the exact Go version and commands in the immutable accepted run report at `$EVIDENCE_REPORT_URL`; do not substitute a different checkout or alter captured fixture JSON.

## Integrity and publication boundary

These tools compute consistency hashes and verify exact bytes; they do not authenticate the publisher or sign a Git ref. Git checks are read-only: the packer uses `rev-parse`, `status`, and `hash-object --stdin`; it never invokes `git hash-object -w`, commits, pushes, or changes the scheduler. The final immutable publication commit and exact source/evidence URLs are filled only after the clean effects run and review gates complete.
