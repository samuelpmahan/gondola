# E-PACKAGE

## Result

A stable, frozen evidence snapshot was packed into a deterministic gzip tar and split into 27 parts. The archive verifier passed. The final archive contains 3,583 regular-file members totaling 392,724,461 uncompressed file bytes; the compressed archive is 27,304,234 bytes. Every part is at most 1 MiB (26 full-size parts and a 41,258-byte final part).

## Included evidence

The snapshot includes the complete current `module-coordination` tree (1,522 files), the M0 counter trace copy, all ten referenced backend build output roots, and all five failed producer attempt output directories with their matching evidence attempt directories and receipts. The M0 source copy is byte-identical to the coordination rawlog copy. The five preserved producer failures are 85a (source-pin mismatch for the UTF-8 test fixture), 2173 (pretty-printed native JSON parser), f984 (duplicate Git log output path / EEXIST), ae701 (Git working-tree change during profile), and 50ec (archive round-trip snapshot lookup failure).

The successful producer attempt archive is not duplicated in this package. Its exact archive SHA-256 `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c` and manifest SHA-256 `ef2f332d15e306daabc290d127a42bfc2f9486fa43219785192f1674d7804fb2` are bound by the included E-CONSUMER report and receipt; root binds the primary runtime archive separately.

## Custody limits

The included `custody-notes.json` records two unavailable items without reconstruction: the original pre-fix `moduleabi/descriptor.go` hash was not captured for the accepted unsafe-size witness; and the XR-REBUILDS transient failed pin-validation stderr was overwritten by final passing output. The corresponding accepted witness and available final/preceding logs remain included.

## Verification

The packer verified the archive and then `--verify` independently reassembled the 27 parts, checked all hashes and lengths, validated the full member manifest, and checked every archive member as a sorted safe regular file. Snapshot copies were verified byte-for-byte against their source inventories before packaging. The package index lists every part SHA-256; the sidecar `members.json` lists every archive member path, size, mode, and SHA-256.

## Artifact hashes

- Package index: `91febd22c18cc4ca3d55c1deb5435eaa9f8ce444d554287447d9b40edce8b442`
- Archive: `9fa92163b8bf249ef547fe80369749982b7ec522d00f3ed6e6f4fbff7271aadf`
- Member manifest: `b8a5d3798af98e957a4838f19f3d375423f2b57e16fa422dfb389fc501bd48eb`
- Frozen snapshot inventory: `b7178d96f867192adc778591c5efc7a9881725062dd1f5ae7efc4b97796f488d`

The report and receipt are outside the archive to avoid a self-hash cycle. Root can add their hashes to the final package metadata addendum.
