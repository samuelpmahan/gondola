# E-DELIVERY — portable qualification verifier

**Worker:** N6  
**Outcome:** `mixed_change`  
**Author run:** uncommitted checkout at Git `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2`; source inputs independently pinned before and after execution.

## Changes

- Added `run-portable-qualification.sh`, a Go 1.24-only archive verification profile. It pins both input pairs by SHA-256, runs the two verifier Go test packages, verifies the positive bundle through the native CLI, checks the deterministic stdout/output receipt bytes, and runs the original archive as a fail-closed negative control. Each attempt uses a new output directory and retains command/version/input/source-pin data and logs.
- Added `portable-qualification/README.md` with the command, artifact source-label versus verifier checkout distinction, and the finite captured-evidence boundary.
- Added `.github/workflows/gobi-portable-qualification.yml`. Its portable job uses Go only. A separate Node 22 job runs the inventory regression test and existing Milestone 0 `bash run.sh` chain.
- Repaired the archive producer inventory after an actual complete-bundle verification showed that the recursive walk excluded the `review-evidence` subtree even though those eight files were present in the frozen source-pin map. New pure helper `backend-qualification/archive-source-inventory.mjs` unions the observed attempt inventory with every `source/<pin path>` and returns a unique sorted list. The producer continues hashing every selected file and the archive helper still consumes an explicit file list.
- Added `backend-qualification/archive-source-inventory.test.mjs`. It uses the actual 397- and 405-member manifests, checks the exact eight omitted review-evidence paths, confirms all original member sizes/digests remain unchanged, and verifies the result equals the complete manifest inventory. It does not read or create a tar archive.
- Updated `backend-qualification/run.mjs` to use the helper and include the regression test plus both manifest files it reads in its focused-test/source-pin set. No application, compiler, renderer, certificate policy, or browser behavior was changed.

## Verification

The portable runner completed at `/tmp/gobi-portable-qualification-author-attempt-04`:

- Go `go1.24.0 linux/amd64`, Bash `5.2.21(1)-release`, `GOTOOLCHAIN=local`, `GOFLAGS=-buildvcs=false`.
- `go test ./qualificationarchive ./cmd/verify-qualification` passed both packages.
- The positive `runtime-complete.tar.gz` fixture passed with 405 members and 13 certificate cases. Its SHA-256 is `5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1`; the manifest SHA-256 is `7645cb803edb5cbb053b43a5a02c04f124e3b60553f7057a6a92777f3d211dcd`.
- The deterministic verification receipt is schema `gobi.portable-qualification-verification/v1`, reports `qualified: true`, and is 11,265 bytes with SHA-256 `0aae5ce79da5211dbf836425b4f8f1ee9d40533e07235133dd5c467c33e15979`. The runner confirmed stdout and `--output` were byte-identical.
- The original 397-member fixture remained unchanged (archive SHA-256 `61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca`; manifest `8adc8f345a5b66a6ea1fbb92fe9bd510d1682f4c37d4c76e8a0660e06ce30cb1`). The CLI exited 1 with empty stdout, created no receipt, and diagnosed the missing `source/compiled-frontend/frontend/react/review-evidence/r2-go-emit.log` pin.
- The runner captured 23 Go/test/script/fixture inputs before and after; both pin-list files have SHA-256 `837e5d953b70c576551e2cc6db8bdeaf6f76eb2bb5e58b0e6f81ad5a4f05627e`, and the current source pin set still matches that snapshot.
- `/tmp/gondola-node22/node_modules/node/bin/node --test backend-qualification/archive-source-inventory.test.mjs` passed 3/3 under Node `v22.23.4`. `node --check backend-qualification/run.mjs` passed.
- `bash -n run-portable-qualification.sh` passed. PyYAML 6.0.3 parsed the workflow and both jobs; `actionlint` was not installed.
- The worker receipt passed the read-only native `validate_receipt` check using `/tmp/rebalancer-env/bin/python` with rebalancer 1.0.4. An earlier attempt used the stale `/tmp/gondola-rebalancer-env/bin/python` path and exited 127 before starting; both attempts are retained.

Attempt01 was preserved as an earlier failed integration run. The Go build reported duplicate definitions of `rejectDuplicateJSONKeys` and `consumeJSONValue` across the concurrently written archive and verification files; no archive command ran and no successful receipt was emitted. Attempt02 subsequently passed after those Go source definitions were reconciled by their owners.

## Limits

The complete 405-member file is an archive-level supplement of eight source-pinned historical compiler review-evidence files. The archived browser capture, certificate, and qualification provenance are unchanged; the augmentation record says no fresh browser execution occurred. The positive result demonstrates bounded consistency of this captured evidence under the Go verifier, not a new browser run, Git authentication, producer authenticity, or arbitrary backend qualification. The original 397-member archive remains a deliberate rejection control.

Validation was performed on Linux/amd64 only. Windows and macOS are untested. The current archive path policy has not been shown to reject every Windows reserved device name; no cross-platform secure-extraction claim is made. Hosted CI and the separate Milestone 0 workflow job were not run in this author packet; root owns the exact candidate-source run.

The initial receipt-validation command used the stale interpreter path `/tmp/gondola-rebalancer-env/bin/python`; root supplied the corrected pinned path, and the actual native package validated the final receipt successfully.

## Source hashes

| Path | SHA-256 |
|---|---|
| `run-portable-qualification.sh` | `48e76af67eeaf5a802dfc8f86a1486a59f00b0c2818e1c22cbc05f78419aedf9` |
| `portable-qualification/README.md` | `48a83cc76690a702f193e11ce0a87878a187bec730bb4268473785af18f35b13` |
| `.github/workflows/gobi-portable-qualification.yml` | `7d75b9481957099f53e33fc52fa9158fee10f3128a84483216376b6b1452d5e9` |
| `backend-qualification/run.mjs` | `7593747006e835a72384dd17111a790d103306f8b38a4d67dea99a72cd6ee825` |
| `backend-qualification/archive-source-inventory.mjs` | `531e2f2824df8228c286b53a25cc9dbad30bdde041da1d91a21c1243b739bf49` |
| `backend-qualification/archive-source-inventory.test.mjs` | `1e3fc8be757b34612294c3e9e5206330760ab4a8b47013f7420005076bb6c2cd` |

Exact raw logs and both attempt directories are listed in `portable-coordination/receipts/E-DELIVERY.json`.
