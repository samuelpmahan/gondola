# E-SOURCE — source binding audit

**Worker:** N3  
**Status:** source binding complete; E-FRESH runtime gate passed per the lead's final gate message. Outcome: `mixed_change`.

## Scope and method

This audit compares actual source bytes against local Git blob bytes and archived producer source bytes. It does not treat producer booleans as proof and does not claim Git authentication.

The read-only helper is [source_bind.go](../rawlogs/E-SOURCE/source_bind.go). It runs `go list -deps -test -json` for the same four roots used by the delivery runner: `cmd/module-effects-qualify`, `effectqualification`, `effectsreplay`, and `modulequalification`. It records each in-repository Go file in that source/test import closure, then additionally binds root `go.mod`, the producer command, and Go/JSON inputs under `counter`, `gobi`, `compilercontract`, `moduleabi`, and the selected module/effect/keyed fixture directories.

For every selected path, the helper records current byte count and SHA-256, Git object byte count and SHA-256 for both the requested source commit and historical PR23 `e0933465725e470dc610e3f81b4bbee95538c1d0`, plus archived producer bytes and validity against both `source-pins-before.json` and `source-pins-after.json`. It rereads current files, archived source files, and pin manifests after the scan and rejects symlinks. Pin JSON rejects duplicate keys, unknown fields, malformed digests, and trailing values. `-require-closure-pins` is the final profile gate; it requires stable archived bytes and pins for every Go closure path and selected app contract input, and checks the producer's declared source commit equals the supplied source commit.

## PR23 baseline findings

Evidence: [pr23-binding.json](../rawlogs/E-SOURCE/pr23-binding.json), the exact [go list JSON output](../rawlogs/E-SOURCE/pr23-go-list.json), [pr23-binding-final.log](../rawlogs/E-SOURCE/pr23-binding-final.log), and [pr23-closure-gate.json](../rawlogs/E-SOURCE/pr23-closure-gate.json).

- The helper enumerated 142 Go package records, 62 in-repository Go closure files, and 72 total bound paths. Current files and historical archive inputs remained stable through the scan.
- The current checkout head, requested source commit, historical comparator, and producer-declared source commit all read `e0933465725e470dc610e3f81b4bbee95538c1d0`. The exact before/after source-pin manifest bytes have SHA-256 `409c61740275a9ab4da75b6c03b338ae049dbca6cbf3f44b23c50928244ce6ac` for each file.
- Of 44 selected app/runner contract inputs, the historical attempt contains 41 with source bytes matching both before/after producer pin manifests. Those archived bytes match local `e093346...` Git object bytes. Thirty-eight also still match the current worktree byte-for-byte across `go.mod`, `counter`, `gobi`, `compilercontract`, `moduleabi`, and module/effect/keyed fixture Go/JSON inputs.
- Current `cmd/module-effects-native/main.go` and `_test.go` differ from e093 because the native replay was extracted. Current `compiled-module-effects/run.mjs` also differs because the runner gained new source-closure behavior. In all three cases the historical archive bytes match the e093 Git object exactly. The command-file archive SHA-256 values are `50b578091dd3d7e15d3b15d3a62688d78bcbb3fa8696d6500f8840bd61aa0043` and `9559129a3520f8023e7795d4d9c65c7dc36bfaf974448c86e5f21ae1d3edff13`.
- The historical PR23 attempt predates the new verifier closure and runner inputs. It has stable archived pins for 34 of 62 current verifier-closure files; the explicit final-profile gate therefore exited nonzero and listed the 28 missing closure paths. Three additional current inputs—`compiled-frontend/coordination/go.mod`, the new runner shell, and its workflow—are also absent from the old producer attempt. These are expected historical-snapshot boundaries, not defects in the old producer and not a fresh profile pass.
- `modulequalification/archive.go` is changed in the current worktree for effects-archive support and was absent from the historical attempt's archived source tree. The new `modulequalification/archive_effects_test.go`, `cmd/module-effects-qualify/**`, `effectqualification/**`, and `effectsreplay/**` also have no historical producer source bytes. Those verifier changes are intentionally outside the old PR23 producer snapshot.

The standalone helper tests pass, including strict source-pin JSON rejection, exact byte/hash matching, root containment, and symlink rejection. See [helper-tests-final.log](../rawlogs/E-SOURCE/helper-tests-final.log). The moving product packages were not compiled as part of this audit; `go list` was used only to enumerate the closure.

## Published source checkpoint binding

The source-publication record at [source-publication.json](../source-publication.json) names source `4338255bf8800d521b7f932fb530fe2cedebbf72` and tree `146daa2199e0c2ee679c622b6c765a2c0ff5b356`, and reports the API/staged/fetched tree equality plus a clean checkout. Independently, `git rev-parse <source>^{tree}` returned the same tree in [current-tree.txt](../rawlogs/E-SOURCE/current-tree.txt); the local audit observed `HEAD` at that source SHA and no porcelain status output; see [current-head.txt](../rawlogs/E-SOURCE/current-head.txt) and [current-status.txt](../rawlogs/E-SOURCE/current-status.txt).

Evidence: [current-binding.json](../rawlogs/E-SOURCE/current-binding.json), [current-go-list.json](../rawlogs/E-SOURCE/current-go-list.json), and [current-binding.exit-code](../rawlogs/E-SOURCE/current-binding.exit-code).

- The current source closure again enumerated 142 package records, 62 in-repository Go closure files, and 72 total bound paths. All 72 current files matched the requested `4338255...` local Git blob bytes; current files remained stable through the scan.
- Relative to historical e093, 50 of 54 paths that existed there still match byte-for-byte. Four existing paths differ: the extracted `cmd/module-effects-native/main.go` and `_test.go`, `compiled-module-effects/run.mjs` with current runner closure behavior, and `modulequalification/archive.go` with effects-archive support. Eighteen selected current paths do not exist in the e093 tree; they are the verifier and newer runner/package-discovery inputs.
- This stage confirms selected current source bytes match the supplied source checkpoint. The fresh attempt's producer bytes and pins are compared in the next section.

## Fresh producer binding

N6 supplied attempt E17 at `/tmp/effectsqual-fresh-4338255bf8800d521b7f932fb530fe2cedebbf72-E17/attempt-20261101T055628369Z-128-0d7fde3c`. The read-only `-require-closure-pins` run passed. The lead's final gate message reports N6 wrapper exit 0 and M0 exit 0. Evidence: [fresh-binding.json](../rawlogs/E-SOURCE/fresh-binding.json), [fresh-go-list.json](../rawlogs/E-SOURCE/fresh-go-list.json), and [fresh-binding.exit-code](../rawlogs/E-SOURCE/fresh-binding.exit-code).

- Attempt metadata declares source commit and verifier head `4338255bf8800d521b7f932fb530fe2cedebbf72`, matching the supplied source checkpoint. The before/after pin manifests are byte-identical, each SHA-256 `955ca8f511feb842ba361ee02f01358dc65ba193d6717fe20f2f779917a3b2bc`.
- All 62/62 Go verifier closure files and all 44/44 selected app/runner inputs have archived source bytes matching both stable producer pin manifests. All 72/72 selected current files match the producer bytes and the target source commit's local Git blob bytes. The helper reread local and archived inputs successfully after binding.
- Historical distinctions remain: 50 paths still match e093, four existing paths differ as described above, and 18 selected paths were absent from the historical tree.
- I independently checked the sibling archive and manifest fingerprints. The archive is 8,789,735 bytes with SHA-256 `aa55ace290027a44ed772d755d10071d15f1067ab3eae1d49cc2bbbf18c59a71`; the manifest is 173,787 bytes with SHA-256 `a8bd7bbe412cc1fca4af1def49356db411a4fa120ce45c66b5d34ee58ab15a7c`. The lead reports 676 archive members. See [fresh-archive-fingerprint.txt](../rawlogs/E-SOURCE/fresh-archive-fingerprint.txt).

The final source-binding outcome is `mixed_change`: the core app contract and fixture inputs are byte-identical to historical e093, while replay extraction, producer runner/archive verification, and the new verifier closure add or change source paths. This source audit does not authenticate Git history. The producer's declared source IDs are consistency metadata; the checks bind actual current bytes, producer archived source bytes, exact source pins, and local Git blob bytes.

The reported commit IDs and metadata are consistency inputs only. Git blobs were read from the local repository; this audit does not authenticate commit history, remote publication, or producer declarations.

## Commands and raw evidence

Exact commands and the corrected initial invocation are listed in [commands.txt](../rawlogs/E-SOURCE/commands.txt). The initial attempt inherited `GO111MODULE=off` into `go list`; the corrected invocation and the expected historical coverage rejection are both retained in raw logs. No production source files were changed by this audit.
