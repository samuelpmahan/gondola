# XR-PACK — independent review of E-PACK

**Reviewer:** N2  
**Decision:** `accepted`

## Review result

The live `/tmp/effectsqual-publish/pack_evidence.py` and `test_pack_evidence.py` match the sealed `source/external` copies byte for byte. Their sizes and SHA-256 hashes match `seals/E-PACK/source-inventory.json` and the E-PACK source pins. No packer or test source was modified during this review.

The seven-test suite passed under Python 3.12.14. It covers repeat determinism, multipart splitting and the 900,000-byte per-part cap, gzip/tar normalized metadata, verification and exact regular-file restoration, tampered and missing parts, aggregate and member hashes, traversal paths, overwrites, symlinks/special files, and nested output.

An independent probe packed the separate frozen smoke input twice and compared every package file byte for byte. Verification passed; restoring produced the exact source regular-file inventory: `README.txt` (108 bytes) and `notes/pins.json` (68 bytes), with matching SHA-256 values. The probe also rejected a flipped part byte, a traversal member before creating a restore destination, duplicate JSON keys, an unknown index key, an unlisted package entry, output inside the input tree, and pack/restore destinations that already existed. Existing marker files remained unchanged.

The package verifier checks strict index object shapes, duplicate keys, canonical part names/counts/sizes, sorted unique safe member paths, each member hash and size, and exact package-directory closure (`index.json` plus declared parts). Packing and restoration use new destinations; restore validates all archive members before creating the destination. Test and probe outputs are preserved in `rawlogs/XR-PACK/`.

## Decision and limits

The frozen implementation satisfies the reviewed packaging and verification contract. It is a self-consistent evidence container, not a signed or authenticated archive: a party able to rewrite the package can recompute its hashes. It packages regular files, omits empty directories, normalizes metadata, and holds the selected finite input tree in memory while constructing the archive. The smoke probe used a separate two-file fixture; it did not package the live coordination directory.
