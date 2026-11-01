# E-PUBPLAN — finite evidence publication guide draft

**Worker:** N1  
**Outcome:** `mixed_change`

## Deliverable

Drafted `/tmp/effectsqual-publish/publication-guide-template.md` for the planned acceptance branch `codex/gobi-native-effects-qualification-acceptance-20261101` and prefix `module-effects-qualification/ci/2026-11-01/current/README.md`. It defines a three-stage publication: immutable Payload A, Guide B that points to A, and root URL-review/closure record C. The guide avoids self-hashes and does not claim a publication, package, or readback has already happened.

The guide includes the accepted packer CLI, exact Git fetch/archive/readback steps, package verification and restore commands, Go-only CLI archive invocation, and the fresh wrapper command from a clean Git checkout. It describes the plaintext report/data prefix and the compressed archive contents, and leaves explicit placeholders for the corrected source SHA, test/CI outcomes, final source pins, fresh attempt/archive/manifest results, and package/readback hashes. The source-433 E17 measurements are labeled historical baseline values rather than the corrected-source result.

The guide also retains the two known evidence metadata qualifications: the unavailable 470-byte derived XR-ORDER checksum file and the pre-epoch-20 author-index serialization that was not preserved. It states that the available fresh captures, source copies, and execution evidence remain packaged, and does not make an exhaustive authoring-metadata claim.

## Evidence and limits

The guide is 12,623 bytes, SHA-256 `026c05833a31b19b6d381391db66785691b993c8d2649c911206a785b56097a3`. Sixteen unique unresolved placeholders are listed in `rawlogs/E-PUBPLAN/placeholders.txt`. The underlying source checkout currently shows N2's pending test-only changes, so final source identifiers and results remain placeholders. The draft notes the recorded success of the existing source-433 hosted native check and does not convert the inherited M0 failure into a pass.

Packer behavior and fresh-run counts were taken from E-PACK/XR-PACK and E-FRESH/XR-FRESH records and the root continuation. I inspected the packer CLI and runner source for command syntax. I did not build a stage, run the packer, execute tests, mutate Git, publish Payload A, or create a URL-review claim. Root must fill the placeholders after the test-only correction, final source publication, fresh/M0 reruns, and real payload readback.

## Evidence

- Guide draft: `/tmp/effectsqual-publish/publication-guide-template.md`
- Guide size/hash and placeholder inventory: `rawlogs/E-PUBPLAN/guide-bytes.txt`, `guide-sha256.txt`, `placeholders.txt`
- Source state and measured context: `rawlogs/E-PUBPLAN/source-status.txt`, `context-facts.txt`
- Raw evidence index and exact inspection commands: `rawlogs/E-PUBPLAN/index.json`, `commands.txt`
- Exact research commands: `rawlogs/E-PUBPLAN/commands.txt`
