# XR-PUBPLAN — publication guide protocol review

**Reviewer:** N2  
**Decision:** `accepted` (template; complete root-owned fill steps before publication)

## Review result

No blocking command, path, or publication-protocol mismatch was found in the guide template. I did not edit the template, packer, source tree, or publication artifacts.

The inspected packer matches the E-PACK sealed source byte-for-byte. Its schema is `effects-qualification-pack/v1`, its deterministic part limit is 900,000 bytes, and its CLI is `--input`, `--output`, `--verify`, and `--restore`. The template's `data/index.json`, `data/part-*.bin`, `tools/pack_evidence.py`, and `reports/` layout matches the packer and the planned Payload A prefix. The index names parts as `part-00000.bin` and records each part, archive aggregate, and regular-file members.

The readback path is coherent: Git archives Payload A's `data/`, packer, and reports beneath `payload/`; verification consumes `$TMP/readback/payload/$PREFIX/data`; restore creates the new root `$TMP/restored`. The later Go-only CLI build archives corrected source beneath `source/` and builds from `$TMP/source/source`, where `cmd/module-effects-qualify` resolves. The fresh archive and manifest names match the producer's `<attempt-id>.tar.gz` and `<attempt-id>.manifest.json` outputs. The Go CLI accepts `--archive` plus `--manifest` and does not require Node, Python, Chromium, or a JavaScript checker at verification time.

Payload A, Guide B, and URL-review record C are separated to avoid a self-hash cycle: Guide B points to immutable Payload A; Guide B is excluded from Payload A; record C can pin both final URLs without editing Guide B. The guide marks all 16 author-listed placeholders as publication-time values and does not present the corrected-source/fresh run, package, readback, or URL review as already complete. Its historical source-433/E17 measurements remain explicitly separate from the corrected-source placeholders.

The template also retains the two required metadata qualifications: the unavailable 470-byte derived XR-ORDER checksum file and the pre-epoch-20 author-index serialization. It avoids an exhaustive authoring-metadata claim, limits runtime claims to the finite capture set, names backend requirements, identifies live mounted asynchronous fault injection as the next milestone, and says the publication is not a merge or deployment.

## Publication-time update

The draft currently says N2 “is completing” the test-only CI-helper correction. E-CIFIX is now complete, while corrected-source publication and reruns remain pending. Root should update this sentence when filling the final Guide B so it reports the correction as complete and the source publication/reruns as pending at that point.

All 16 placeholders still need values from the corrected source, final M0/fresh results, payload creation, Git readback, and URL review. I did not substitute estimates or historical values for them.

## Evidence and limits

The template is 12,623 bytes with SHA-256 `026c05833a31b19b6d381391db66785691b993c8d2649c911206a785b56097a3`. Its 16 unique placeholders exactly match E-PUBPLAN's author inventory. The verified old PR23 input hashes match `EXPECTED.json` and `SHA256SUMS` in the workspace. The Go CLI package resolves as `github.com/samuelpmahan/gondola/cmd/module-effects-qualify`.

Raw checks are indexed in `rawlogs/XR-PUBPLAN/index.json`. This was a bounded read-only protocol review; no pack, restore, broad test, Git mutation, or publication was performed.
