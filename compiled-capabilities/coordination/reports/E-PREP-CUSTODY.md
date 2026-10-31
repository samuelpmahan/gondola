# E-PREP-CUSTODY: Pre-repair evidence custody package

## Result

**Verified.** Frozen the selected surviving pre-repair evidence without changing any source attempt or closed author/review packet. The package catalogs 127 files totaling 295,193,643 bytes. The deterministic compressed tar is 13,252,799 bytes and has SHA-256 `c40e8a0c2fecef574c118992dc85ba4ca1e2f5b1785a9b29fc588ff49f034324`. It is split into thirteen chunks, each at most 1 MiB. The last chunk is 669,887 bytes.

The manifest is [`acceptance/custody/manifest.json`](../acceptance/custody/manifest.json); it contains every member's repository-relative path, byte length, mode, and SHA-256, plus the archive and per-chunk hashes. `build_custody.py` records the exact selection and generates the archive; `verify_custody.py` independently reconstructs the archive from the chunks, verifies the archive and every member hash, safely extracts all members to a temporary directory, and compares all 127 current source files to the frozen catalog.

## Frozen selection

- Original conformance attempts 01, 02, and 03, including captured failed attempts, native/direct/browser traces, run/check manifests, bundles, and stdout/stderr logs.
- Demo evidence attempt 00.
- Closed author packets E-BUILD, E-DEMO, E-FIX-GO, E-GO, E-HARNESS, E-HOST, and E-ORACLE.
- Closed review packets XR-BUILD, XR-DEMO, XR-FIX-GO, XR-GO, XR-HARNESS, XR-HOST, and XR-ORACLE, including every file under each named review directory.
- The preserved `coordination/epoch-03-failed-nonoptimal.log`.

The custody selection excludes mutable coordination state, ongoing E-FIX-HARNESS and E-FIX-BUILD work, XR-FIX-HARNESS, PREP packets, newer evidence attempts, and this custody output itself. The archive contains only explicitly selected evidence paths; it does not include production sources or claim the full milestone passed.

File contents are copied byte-for-byte in binary mode, including newline bytes. Tar metadata uses relative paths, sorted members, numeric owner/group zero, and timestamp zero; the gzip header timestamp is zero and its filename field is empty. Four consecutive builds of the same selection produced the same archive SHA-256.

## Verification

`python compiled-capabilities/coordination/acceptance/custody/build_custody.py` completed with 127 members round-tripped and unchanged source hashes. `python compiled-capabilities/coordination/acceptance/custody/verify_custody.py` independently reported:

- 13/13 chunk hashes verified individually and exact reconstruction of the compressed archive.
- 127/127 tar members matched the manifest hashes and restored byte-for-byte.
- 127/127 original files still matched their pre-build catalog hashes.
- Attempt contents: 10 files in attempt 01, 14 in attempt 02, 15 in attempt 03, and 3 in demo attempt 00.
- The failed native epoch-03 log is present; no post-freeze attempt 04 or custody output appears in the archive.

The package preserves the reports that identify missing raw outputs. In particular, E-DEMO records an initial selector failure whose tool output was not saved. E-HOST records early environment-missing runs and an intermediate replacement regression whose raw output was not captured. This archive contains only the surviving evidence; it does not recreate those missing logs. E-HARNESS attempts 01 and 02 do have captured files and are included.

## Restore

Run these commands from the repository root. The destination must be a new empty directory; the archive contains only relative, non-traversing regular-file member paths.

```sh
cat compiled-capabilities/coordination/acceptance/custody/chunks/part-*.bin > /tmp/capability-evidence.tar.gz
printf '%s  %s\n' 'c40e8a0c2fecef574c118992dc85ba4ca1e2f5b1785a9b29fc588ff49f034324' /tmp/capability-evidence.tar.gz | sha256sum --check
tar -tzf /tmp/capability-evidence.tar.gz
mkdir /tmp/capability-evidence-restore
tar --no-same-owner -xzf /tmp/capability-evidence.tar.gz -C /tmp/capability-evidence-restore
```

The restored tree retains the `compiled-capabilities/...` repository-relative prefixes. Use the manifest's member list to verify any selected file after extraction.

No production files, Git state, dependency locks, original attempt directories, author packets, or review packets were modified. No full-run acceptance claim is made.
