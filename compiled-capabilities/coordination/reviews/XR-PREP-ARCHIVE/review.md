# XR-PREP-ARCHIVE: Independent verifier review

**Decision: amend.** The verifier is read-only and does not claim a real archive exists, but several consistent in-memory mutations still pass `--require-complete`. No verifier, runner, or scheduler file was edited during this review.

## Reviewed protocol and source custody

Compared N5's verifier with N6's repaired archive implementation in `compiled-capabilities/run.mjs`, `compiled-capabilities/archive-helper.mjs`, and the E-FIX-BUILD report and receipt. The expected immutable member is `execution-before-archive.json`; the current runner writes `status: archive_pending`, `archiveStatus: PENDING`, `archivePending: true`, `acceptanceStatus: NOT_FINAL`, and `finalAcceptance: false`. It records nested `toolchainAndDependencies`, the pre-archive command ledger and source pins, then binds the tar and external manifest in the outer receipt and records source pins after archive creation.

The N5 receipt's three declared source pins for the verifier, README, and E-PREP-ARCHIVE report all match their current byte counts and SHA-256 values. Hashes for the reviewed verifier, documentation, E-FIX-BUILD runner/helper protocol, receipts, report, and review probes are recorded in `XR-PREP-ARCHIVE.json`.

## Checks performed

- N5's `--self-test` passed: one valid complete fixture and five rejected mutations. Output: [`self-test.stdout.log`](self-test.stdout.log), SHA-256 `bddc1fd0aca1784622f5876a57f00545ac8da6151d57ca70c70edfdbf5ba1dbe`.
- The current E-BUILD author receipt has no archive metadata. `--require-complete` failed closed with exit 2 and `outer receipt is missing archive metadata`; no actual full-run archive was present or accepted. Output: [`no-full-archive.stderr.log`](no-full-archive.stderr.log), SHA-256 `de825409f133e54b76fea180f874c3ec19ba0e452f1e0fcbb1d2c7b66657a70a`.
- Replayed adversarial tests used internally consistent fixtures and recomputed tar, manifest, and outer receipt hash bindings where applicable. The verifier rejected a wrong React version, symlink/hardlink members, an extra unmanifested member, a missing listed member, and changed `sourceAfter` pins. It also rejected the self-test's traversal path, missing provenance member, tampered member, and inconsistent source pins.
- The following mutations were accepted with `completeAcceptance: true`; these are the amendment findings below: nonzero command exit codes, contradictory pending-state labels, Node 18 and mismatched locked React metadata, and a file/directory path collision. Output and reproducible probe code: [`deep-probes.log`](deep-probes.log), SHA-256 `d325e79eec157e26f8dd62d792066dc7a940ab1c1c09d8b9065ba15a9a603e65`; [`deep-probes.py`](deep-probes.py), SHA-256 `a9fb33eefc49bbde128184228713ef6807c2d3fa084de8ba095e490ecb1fcd26`.

## Findings

### XRPA-1: Complete acceptance ignores nonzero command exit codes

`validate_command_rows()` in `verify_archive.py` (lines 155–168) validates only the optional integer type of `exitCode`. In complete mode, lines 390–398 check that the last three command names are the archive/list/extract sequence, but do not require zero exits or absence of signals/errors. A consistent pre-archive ledger and embedded receipt with `exitCode: 23`, or a final archive command with `exitCode: 17`, both pass and return `completeAcceptance: true`.

The current runner records exit codes and its `execute()` path fails on nonzero exit (lines 308–326), so such a passed receipt would contradict the producer's own command log. Require successful command rows and reject signals/errors for the full receipt and its immutable prefix.

### XRPA-2: Redundant pending-state labels are not all enforced

The verifier checks `archiveStatus`, `archivePending`, `acceptanceStatus`, and `finalAcceptance` at lines 299–304. It does not check the snapshot's top-level `status`, the outer `archive.executionSnapshot.status`, or the embedded pre-archive receipt's expected running status. Setting either the snapshot or outer snapshot status to `passed`, while retaining the other pending flags and refreshing all hashes, still yields `completeAcceptance: true`.

Require the immutable snapshot and its outer metadata to carry the expected `archive_pending` status, and validate the embedded receipt status/schema/mode expected at the pre-archive boundary.

### XRPA-3: Toolchain/lock consistency is weaker than the current runner contract

The verifier compares nested toolchain records to the outer receipt and, in complete mode, pins `versions.dependencies.react` and `reactDOM` to `19.3.1` (lines 334–344, 405–407). It does not check the runner's Node 22 requirement or consistency between installed and locked dependency versions. A fully consistent Node `v18.0.0` claim and a consistent `lockedDependencies.react: 18.0.0` claim both pass complete acceptance, although `run.mjs` rejects Node versions outside `v22.*` and records installed/locked versions separately.

Validate Node 22 and require installed dependency versions to match their lock-derived versions (at minimum React and ReactDOM), or state explicitly which toolchain values are provenance-only rather than acceptance gates.

### XRPA-4: A file can occupy a required directory path

`hash_tar_members()` tracks regular files and directories in separate sets and compares each set against the manifest and expected parent directories (lines 188–250). It does not reject a path present in both sets. A tar containing directory `react/`, regular file `react`, and regular member `react/build-result.json` matches the current inventory checks and is accepted. This path/type collision is ambiguous and cannot be safely extracted as a normal tree.

Reject any archive where a regular-file path also appears as a directory or parent directory.

## Verdict and limit

The positive checks establish useful archive-byte/member hashing, exact manifest inventories, safe relative path checks, unsupported link/special-member rejection, and post-archive pin equality. The current self-test does not cover the four accepted cases above. Because complete acceptance can be asserted while the immutable pending labels, command outcomes, and required toolchain claims contradict the current N6 protocol, the verifier preparation needs amendment. There is no actual full-run archive here; this review does not make an archive acceptance claim.
