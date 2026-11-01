# XR-RESTORE — independent consumer review

**Worker:** N4  
**Job:** XR-RESTORE  
**Decision:** `accepted` for the translated PR22 baseline  
**Boundary:** The clean E-DELIVERY module-effects archive has not been tested; its consumption remains a separate gate.

## Review scope and result

I reviewed sealed E-RESTORE v2, including its adapter, report, receipt, final 15-test packet, raw-log index, and preserved first 14-test checkpoint. The sealed adapter is 33,703 bytes with SHA-256 `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98`. The sealed report and receipt match the hashes in the seal. I independently verified all 73 indexed raw files and their external mirror, plus all 36 files in the preserved first-version checkpoint. Its index hash remains `c0eca9a45e4d82dc3ba3d07fc29ea6e82a7708c1720add3e48f57427905b407b`.

The accepted prior restore source is pinned at SHA-256 `0dac505c5e9949a2b6168dac955e40c7af805847f73ef27652e1962d603d3f68`. AST-extracted source for the seven critical safety functions is identical to that base: `_safe_member_path`, `_commit_no_replace`, `_extract`, `_assemble`, `_hash_file`, `_pairs_no_duplicates`, and `_json_bytes`. The translated adapter, test file, translator, and both translated manifests/indexes match their sealed byte and SHA pins.

## Archive and schema evidence

The translated fixture retains the 25 original PR22 archive segments. I checked every old segment against its pin and every translated copy against both the old bytes and the pin. Concatenation produces 25,697,770 bytes with archive SHA-256 `1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7`; no archive copy was added to this review packet.

The translated index and manifests use the three module-effects schemas. The primary manifest has the exact closed 14-field keyset. Its bounded counts are derived and checked: 600 members and 157 source pins. Member paths and source paths are unique; the source member set equals the source-pin set; the test-source pin list matches the derived subset; the archive pin matches the index; and the old and translated inventory sets are equal. The root `go.sum` absence declaration is supported by the pinned root `go.mod` and no `go.sum` pin. Excluded log and regenerable-bundle metadata has the expected typed, scoped, disjoint paths.

The historical fixture records `excludedCompilerLogs:false` because the preserved source snapshot contains compiler logs. The validator checks the field’s boolean type and rejects declared excluded compiler logs when the field is true. This does not qualify the current E-DELIVERY closure, which declares true.

## Runtime and fail-closed checks

The sealed final suite passed again with Python 3.12.14: 15 tests, 0 failures. This includes a full restore of the translated PR22 archive with 600 members and 157 verified source pins; duplicate tar paths, links, traversal, truncated gzip trailer, missing archive members, and mismatched pins/counts fail closed; and the excluded-directory basename correction passes.

I added eight reviewer-only probes, kept outside the adapter: six schema/path/archive probes and two commit probes. All eight passed. They verify duplicate JSON-key rejection, declared compiler-log and exit-code exclusions, unexpected and missing tar members, acceptance of a file whose basename matches an excluded directory name, a destination created immediately at the `renameat2` commit call, and fail-closed behavior when `renameat2` is unavailable. The injected commit race preserved both the raced destination sentinel and the staged tree; no fallback move was attempted.

The adapter commits with Linux `renameat2(RENAME_NOREPLACE)`. Existing destination protection and unsupported-platform behavior also passed in the sealed suite. The focused suite and extra probes are recorded under `rawlogs/XR-RESTORE/`; `commands.log` records exact invocations and the one corrected reviewer-script setup error. That initial error was in the review-only helper ordering and was corrected before the six relevant probes ran; it did not involve adapter code.

## Decision and remaining gate

I accept E-RESTORE v2 for consuming the translated PR22 baseline. The evidence supports its dynamic index counts, strict source/member pins and schemas, gzip trailer validation, path/type rejection, atomic no-overwrite commit, and fail-closed behavior without a fallback.

The baseline is not a clean module-effects archive. The new E-DELIVERY primary archive is unavailable, so this review does not claim its manifest or archive has been consumed. E-CONSUME and root readback must run the frozen adapter against that clean archive before the consumer gate is complete. SHA-256 pins establish byte consistency, not publisher authenticity; atomic no-overwrite commit requires Linux `renameat2(RENAME_NOREPLACE)`.

No production source, archive, repository Git state, or scheduler state was modified. Reviewer-only evidence, commands, and hashes are indexed in `rawlogs/XR-RESTORE/index.json`.
