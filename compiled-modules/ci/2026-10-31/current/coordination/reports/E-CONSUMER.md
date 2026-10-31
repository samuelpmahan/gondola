# E-CONSUMER — source-attested archive consumption

**Worker:** N3  
**Outcome:** `mixed_change`

## Result

Consumed the passed producer attempt `attempt-20261031T213332911Z-35` from published Git commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`, tree `bcc71cef48f3a4e141daf181b43f8e12a2132f83`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Archive `compiled-modules/output/attempts/attempt-20261031T213332911Z-35.tar.gz` | 6,373,581 | `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c` |
| Manifest `compiled-modules/output/attempts/attempt-20261031T213332911Z-35.manifest.json` | 125,900 | `ef2f332d15e306daabc290d127a42bfc2f9486fa43219785192f1674d7804fb2` |
| Producer receipt `compiled-modules/evidence/attempts/attempt-20261031T213332911Z-35/receipt.json` | 472,432 | `38246a62989fd77ef7f6af32752be1e23249c262f15cb8bd8f33fc29fab3093c` |

The producer receipt reports `passed`, 529 archive members, a fresh fixed native capture, 12 browser profiles, and six detected mutation controls. Its source commit, archive and manifest hashes, and all 147 `sourcePins` match the manifest.

## Independent archive checks

The consumer rejected duplicate JSON keys and a BOM, checked the exact manifest schema and archive path, size, and SHA-256, then validated all 529 regular-file members and their exact byte hashes before extraction. It rejected noncanonical or unsafe paths, duplicate or unlisted members, file/directory conflicts, and size-limit violations. The archived `source/` paths exactly equal the 147 `sourcePinsBefore` entries.

For each source pin, the consumer checked its length and SHA-256, its Git blob ID in the published commit, and byte equality with `git cat-file blob`. The commit tree matched the pinned tree above. Only after these checks did it extract into a new private directory. The root `execution-before-archive.json` snapshot agrees with the manifest and source commit. The extracted source remained byte-identical before and after native replay.

The validated archive expands to 67,486,104 bytes. The final extraction is `/tmp/gobi-econsumer-7bd0-extraction-final-checked`; its source files were written read-only. The complete verification command and result are in [consume-final.command.json](../rawlogs/E-CONSUMER/archive-verify-final/consume-final.command.json) and [consume-final.stdout.bin](../rawlogs/E-CONSUMER/archive-verify/consume-final.stdout.bin).

## Archived native replay

Using Go `go1.24.0 linux/amd64`, with `GOTOOLCHAIN=local`, `GOPROXY=off`, `GOSUMDB=off`, and `GOWORK=off`, the archived source ran:

```text
go run ./cmd/compiled-modules-native --script fixtures/compiled/moduleparent/scenario.json
```

It exited 0 and emitted 209,146 bytes. The output SHA-256 is `579c8c4a17d26682fc30bfdbbc4de677ee63cda322b7bfdd00bd624c22b4ceec`, equal byte-for-byte to the archived `logs/native-trace.stdout.bin` and the normalized `native/native-trace.json`. The trace has 24 source events and 16 Go updates. The replay summary and command are [archived-native-replay.json](../rawlogs/E-CONSUMER/archive-verify-final/archived-native-replay.json) and [archived-native.command.json](../rawlogs/E-CONSUMER/archive-verify-final/archived-native.command.json).

## Offline archived conformance check

Node `v22.23.4` ran the archived production checker and ABI validator against the archived build manifests, captures, fixtures, and expectations. It passed:

- The fixed native, direct React/DOM, and captured browser React/DOM/swap profiles.
- Three 40-event seeded scenarios (`20261031`, `20261032`, `20261033`) across React, DOM, and swap, for 12 captured browser profiles total.
- All six fixed mutation controls: parent state field, child view tree, physical DOM HTML, disabled control, bridge order, and ABI-role-before-reject.

No browser was launched in this consumer run. This checks the archived captures and their semantic comparisons; it is distinct from the producer’s browser run and from the existing 13-case `backendqualification` certificate. It does not add cases to, or claim certification from, that separate schema.

The archived checker output is [checker.stdout.bin](../rawlogs/E-CONSUMER/archive-verify-final/checker.stdout.bin); its exact command is [check-archived.command.json](../rawlogs/E-CONSUMER/archive-verify/check-archived.command.json).

## Preserved verifier corrections

Two first-draft consumer assumptions failed before changing any archive bytes. The member-order check expected Python code-point order, while the producer emitted `localeCompare` order; the inventory contained 529 unique members. The checker helper also expected the old `metadata/execution-before-archive.json` location after E-SNAPSHOT moved the file to archive root. Both red records are preserved in [red-history.json](../rawlogs/E-CONSUMER/red-history.json). The verifier now checks exact path inventories and archive/source bindings without imposing Python’s unrelated sort order, and reads the root snapshot. The final strengthened archive pass, native replay, and checker all passed.

## Verification commands and limits

The final verifier scripts passed Python compile checks and Node syntax checking. Commands, versions, and script hashes are in [final-preflight.json](../rawlogs/E-CONSUMER/final-preflight.json). The native receipt validator accepted the job/worker/outcome fields, and the coordination state SHA-256 was unchanged across that read-only check; see [native-receipt-validation.command.json](../rawlogs/E-CONSUMER/native-receipt-validation.command.json).

[The raw-log index](../rawlogs/E-CONSUMER/index.json) pins all consumer commands and outputs.

This is finite evidence for this exact archive, commit, two-module fixture, fixed scenario, three recorded seeds, and 12 captured profiles. Git blob matching checks the archived source bytes against this local published Git commit; it is not a signature or independent publisher-authenticity claim. The offline checker did not launch a browser. No arbitrary module graph, malicious-code isolation, or `backendqualification` certification is claimed.
