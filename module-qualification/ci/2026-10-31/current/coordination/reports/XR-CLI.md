# XR-CLI — independent review of the native module verifier and CLI

**Worker:** N2  
**Decision:** `accepted`

## Sealed author packet

The E-CLI report, receipt, and raw-log index match their seal exactly: report SHA-256 `2a0ba0c0721355815662170443c94f570fffb8ce05024ec9e5417d6ef8064e0c`, receipt SHA-256 `d1b5e833eccfdf5fbbe31b15cbf2a752ac8b5591964e52bd84ef8b3a34566b70`, and index SHA-256 `033efb2202dd2a5ec08f62470a3caca8415e5dbe5aa8beaa7bbd15971b30c21e`. All four E-CLI-owned source files match its source inventory, and all 23 indexed author raw files match their recorded bytes and hashes.

The E-CLI receipt pins `modulequalification/semantics.go` at `f00677f33b1a6f74f3f02be78543a6a7fdb201419715c704ff16e93242afdf3a`. That file was subsequently changed by N1; the frozen current implementation is `9283255ef119718d3fb59ba3ce9d103dd3871d8d0aa8177afb403b241ab5cff4` (80,145 bytes). The other seven source hashes listed in the historical E-CLI tested-source set still match. I preserve the original packet as its historical result and separately reran the current frozen source; the pre-freeze observation is explicitly labeled incomplete in raw logs and is not acceptance evidence.

## Independent source and input checks

I compared the execution snapshot’s 147 source pins with both before/after pin manifests: the three maps are equal, and all 147 actual `source/<path>` files match their pinned byte counts and SHA-256 values. The actual source directory contains exactly those 147 paths (1,321,637 bytes total). Independently hashing the full restored tree found 529 regular files and 67,486,104 bytes; all file hashes and paths match E-CLI’s captured directory `inputs` inventory. The detailed audit is [source-closure-and-author-log-audit.json](../rawlogs/XR-CLI/source-closure-and-author-log-audit.json), SHA-256 `3ed7ae5d57a4f0a358dc9d5fdf9a7031a1c456e0be3b7c4ce67992a1de83ac9d`.

## Current Go 1.24 rerun

After N1 froze `semantics.go` at `9283255ef119718d3fb59ba3ce9d103dd3871d8d0aa8177afb403b241ab5cff4` and `semantics_test.go` at `7a0757ab98dce3b46e91e6f6fb25947820bcd4e6c9df511906a46645483f44c7`, I captured hashes of the tested verifier, CLI, archive, ABI, semantics, and strict-JSON source files before and after the Go commands. They remained identical throughout.

The Go 1.24 package tests passed with all four integration environment inputs set (`GOBI_MODULE_CAPTURE_ROOT`, `GOBI_MODULE_ARCHIVE`, `GOBI_MODULE_MANIFEST`, and `GOBI_MODULE_EXPECTED_SOURCE`): `modulequalification` passed in 49.825 seconds and `cmd/module-qualify` passed. The exact command, environment, and output hashes are in [focused-go-tests.command.json](../rawlogs/XR-CLI/focused-go-tests.command.json).

The actual CLI passed in directory mode and archive mode. Both emitted one valid JSON report on stdout, wrote no stderr, and produced byte-identical reports to the sealed E-CLI attempt-010 outputs. The shared report says source commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`, 529 inputs, 147 checked source pins, 12 profiles, 144 events, 99 updates, and ABI admission for four builds/two pairs. `capture.mutationControls` is `0`; this is not treated as a producer mutation-control count. The archive report additionally records 529 members and 6,373,581 archive bytes. Exact outputs are 102,929 bytes (directory, SHA-256 `6b87484cf1b954525b0005ce93de6176ca13ea831e8a86da0655de665a16dfc8`) and 103,054 bytes (archive, SHA-256 `37182053941c25863b91a65f94821f9550b1fd10810c75d9cf941d0327a6b4a5`).

I also invoked the CLI with a missing directory and with mixed directory/archive flags. Both failed with nonzero status, wrote zero stdout bytes, and produced an error on stderr. The mixed-mode error identifies the modes as mutually exclusive. The unit tests additionally cover duplicate, missing, unknown, and malformed arguments, help, and stdout cleanliness on verifier failure.

## Acceptance boundary

The CLI verifies the declared source commit’s format and consistency with the supplied metadata and checks the embedded source bytes; it does not authenticate Git history or attest that its executable was built from those source pins. Its capture report does not launch a browser and reports zero Go-executed mutation controls. This review verifies the archived/direct CLI boundary and focused Go packages; it does not claim a fresh browser run, full producer pipeline, CI acceptance, or publisher authenticity.

No production source, Git, or native scheduler state was changed. XR-CLI raw-log index SHA-256: `9dce0b2b7ca187d38f8802a479e764cecff8d3e1e24f4c031aa4d81c4426eeb6` (18 entries).
