# E-REG — inherited M0 and nested compiler regression

**Worker:** N1 (`/root/qual_replay`)  
**Outcome:** `mixed_change`  
**Baseline:** PR23 `e0933465725e470dc610e3f81b4bbee95538c1d0`

## Source and toolchain

The test source came from `git archive` of commit `e0933465725e470dc610e3f81b4bbee95538c1d0`, tree `0a52ae23ab32e0ca35f6b1385ea851e3edeede3a`, extracted into `/tmp/effectsqual-reg/src`. The archive hash is in `rawlogs/E-REG/source-archive.sha256`.

The source inputs pinned for M0 were unchanged: `EXPECTED.json` SHA-256 `639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2`; `SHA256SUMS` SHA-256 `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`. These values match the shared checkout and archive snapshot. M0's own checksum verification passed before and after the additive module boundary.

Pinned tools were root Go 1.24.0, Node 22.23.4, npm 11.9.0, compiler Go 1.27.3, and esbuild 0.28.2. Exact versions and compiler lockfile hashes are in `rawlogs/E-REG/source-and-toolchain.txt` and `compiler-lock-inputs.sha256`.

## M0

Ran `bash run.sh` from the clean archive with pinned Go and Node. It passed before the nested module boundary: root Go checks passed, the seeded run reported `same over 5000 inputs`, the receipt matched, and `SHA256SUMS ok` was printed.

After adding the authorized nested module boundary described below, ran `bash run.sh` again in the same isolated snapshot. It passed with the same 5,000-input, receipt, and source-integrity results. Both full stdout and stderr streams and statuses are retained.

## Nested compiler module

The first `go test ./...` from `compiled-frontend` failed because the clean archive lacked its locked esbuild dependency and because Go recursively treated a tracked historical source snapshot as a buildable package. After installing the pinned `compiled-frontend` npm lock, the compiler code tests passed but the historical snapshot package still failed: `coordination/reviews/xr_r_abi_codec/source-snapshots` contains only `js_encoder.go` and `js_encoder_test.go`, which refer to definitions absent from that retained snapshot. The source paths are tracked at the e093 baseline; the exact two file hashes are recorded and unchanged.

Following the scope extension, added one file, `compiled-frontend/coordination/go.mod`, to both the isolated e093 snapshot and current sparse working tree. Its comments identify `coordination` as retained review/source-snapshot evidence outside the compiler package graph. No original snapshot or compiler source file was modified. The byte-identical module file SHA-256 is `4e5404a63d8ca4238ef43e70769024b229c3c88aa327574aa760b99a9fd3a463`.

With that boundary, the full compiler module package discovery is eight packages, listed in `rawlogs/E-REG/compiler-packages-with-boundary.txt`. `go test -count=1 ./...`, `go test -race -count=1 ./...`, and `go vet ./...` passed under Go 1.27.3. The raw initial all-tree failure, the dependency-repaired pre-boundary failure, and final pass are all retained; this does not claim the partial historical snippets compile or were tested.

## Scope

This E-REG record validates inherited PR23 behavior and the compiler module package graph. It does not test the new `effectqualification` verifier implementation. The only repository source addition for this lane is `compiled-frontend/coordination/go.mod`; npm installs and all generated test outputs stayed in `/tmp/effectsqual-reg`.

See `rawlogs/E-REG/commands.txt` for exact commands, working directories, environment, and log paths.
