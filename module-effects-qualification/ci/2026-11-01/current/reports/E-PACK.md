# E-PACK — deterministic evidence packager

## Result

Implemented `/tmp/effectsqual-publish/pack_evidence.py` and its seven-test regression suite at `/tmp/effectsqual-publish/test_pack_evidence.py`.

Pack a frozen directory into a new output directory outside the input tree:

```sh
python3 /tmp/effectsqual-publish/pack_evidence.py --input ROOT --output NEW_PACKAGE_DIR
```

The package contains `index.json` and sequential `part-00000.bin` files. The index records the aggregate compressed archive size/SHA-256, a byte-count/SHA-256 pin for every part, and a path/size/SHA-256 inventory of every regular-file member. Each part is at most 900,000 bytes.

The archive is a sorted tar/PAX stream inside gzip with gzip mtime zero and normalized tar ownership, timestamp, and mode. Pack rejects symlinks, special files, unsafe or non-portable paths, output paths inside the input tree, and existing output paths.

Verify a package, or verify and restore it into a new directory:

```sh
python3 /tmp/effectsqual-publish/pack_evidence.py --verify --input PACKAGE_DIR
python3 /tmp/effectsqual-publish/pack_evidence.py --verify --input PACKAGE_DIR --restore NEW_RESTORE_DIR
```

Verification checks the strict JSON index, exact part set and pins, aggregate hash, gzip header, tar members and normalized metadata, and every member's size and hash before restoration. Restore writes only validated regular-file bytes with exclusive-create semantics; it rejects traversal paths and existing destinations and does not use `tarfile.extractall`.

## Verification

The final command was:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s /tmp/effectsqual-publish -p 'test_pack_evidence.py' -v
```

It passed all seven tests. Coverage includes deterministic repeat packaging, multi-part splitting and per-part limits, gzip/tar metadata, verify-and-restore equality, aggregate/member hash checks, tampered and missing parts, traversal and bad member paths, symlink/special-file rejection, nested-output rejection, and no-overwrite behavior. Full output is in `rawlogs/E-PACK/test-final.stdout.log`; exit status is `0`.

A separate explicit frozen smoke tree at `/tmp/effectsqual-publish/frozen-smoke-stage-v1` was packed twice. The two new packages matched the earlier smoke package and each other byte-for-byte. Verification and restore succeeded, and a recursive diff confirmed the restored tree matched the staging tree. This fixture contains only two fixed text/JSON files; it is not the coordination directory. See `rawlogs/E-PACK/smoke-final.command` and `smoke-final.stdout.log`.

The test-first red control ran before the packer existed and failed with the expected missing-script error. It is preserved as `rawlogs/E-PACK/test-red.*`; it is not counted as a passing run.

## Frozen source pins

The final reviewed source bytes and SHA-256 values are:

| File | Bytes | SHA-256 |
|---|---:|---|
| `/tmp/effectsqual-publish/pack_evidence.py` | 24,169 | `b7c5dae9c30869d78aed949d5ac4f33e766009ff5a4e56332ea84cd0dccb3e01` |
| `/tmp/effectsqual-publish/test_pack_evidence.py` | 9,396 | `e6a392092c0b33593d37bb3009f7deaa92299021ba215c7d232352cdaa3db945` |

Python was `3.12.14`. The same environment and standard library are expected for byte-for-byte reproduction.

## Scope and limits

The format inventories regular files and intentionally normalizes ownership, timestamp, and permissions; it does not preserve empty directories or source permission bits. The implementation reads a finite staging tree into memory while creating the archive. The final coordination snapshot is not packaged here; root should select and freeze that staging directory after all lanes close.
