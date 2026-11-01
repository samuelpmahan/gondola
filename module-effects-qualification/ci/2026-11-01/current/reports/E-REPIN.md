# E-REPIN — corrected-source binding

**Worker:** N3  
**Outcome:** `mixed_change` (test-only delta from E17 source 433)  
**Source:** `8632f139354c0863482eb625c3ba99b4f607ea0c`  
**Tree:** `25af3c13551870e10873f74722cabd2e4e38b0fa`

## Source comparison

The final checkout is at the requested source commit, its tree matches the recorded tree, and its porcelain status is empty. The read-only source binder enumerated 142 Go package records, 63 Go closure files, and 73 unique selected paths. All 73 current files match the local Git blob bytes for the final source. A production-Go diff against source `4338255bf8800d521b7f932fb530fe2cedebbf72`, excluding `_test.go`, exited 0.

The only Go deltas from source 433 are test files:

- `effectqualification/integration_test.go` changed to resolve an explicit fixture as a hard requirement and skip only when the default fixture is absent. Current SHA-256: `07319c7308c8f9d0391a484fbda2436a1dbbcad69d3cfa26882b18dd09c906ec`.
- `effectqualification/fixture_selection_test.go` is the new resolver test file. Current SHA-256: `1972a4fa8ff3a63aa6e77f371cc50ce95b42519885666421ef17d580a7b6795a`.

The accepted E-SOURCE binding for 433 had 62 Go closure files and 72 selected paths. The final closure adds the new test file and includes the changed test helper. The production Go source remains byte-identical to 433. Exact source/test diffs and hashes are in `rawlogs/E-REPIN/`.

## Fresh producer binding

N6's E35 attempt is `/tmp/effectsqual-cifinal-fresh-8632f139354c0863482eb625c3ba99b4f607ea0c-E35/attempt-20261101T062545178Z-121-4b515620`. The read-only `source_bind.go -require-closure-pins` run exited 0. Producer source commit and verifier-head declarations both equal `8632f139354c0863482eb625c3ba99b4f607ea0c`; the before/after pin manifests are byte-identical. The helper validated stable producer bytes and pins for all **63/63 Go closure files** and **44/44 app/runner inputs**; all **73/73 unique selected paths** match the current checkout, target Git blobs, and producer source bytes. Both test-only deltas are included and pinned.

Each source-pin manifest has 237 entries, is 35,821 bytes, and has SHA-256 `ab3e2b96b67a20fd81a8c10edfbda72114c6af090bd67f05d133248a1f45bc9d`. This count is the full manifest entry count; the binding validates the selected closure and app/runner inputs described above.

The sibling archive is 8,792,006 bytes with SHA-256 `d1503bec6ac4f280f5576670eac3b6c5c7de143b4d0bc32a0dd79a634125c272`. Its manifest is 174,195 bytes with SHA-256 `d8f7f6a1f8ab17762e56bfae838772f95cae01ddd815094b48b6dabfaa2ce51e`. The producer qualification report records 677 archive members.

## Runtime gate and limits

N6's final gate reports the fresh wrapper and M0 no-fixture checks exited 0; the explicit fixture-backed `effectqualification` suite passed without skips, while five unrelated `modulequalification` legacy cases skipped. The captured E-CIFINAL wrapper and M0 exit records are referenced in `rawlogs/E-REPIN/runtime-gate-references.txt`. N3 did not rerun the suite or wrapper.

This is a source-byte and pin-consistency result, not Git history authentication. Source IDs are consistency metadata; this report makes no claim that the commit history, producer, or compiler invocation was authenticated.
