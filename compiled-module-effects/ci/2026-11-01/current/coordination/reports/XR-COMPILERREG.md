# XR-COMPILERREG — Independent review

**Decision:** accepted  
**Scope:** frozen E-COMPILERREG nested compiler Go-suite evidence only.

## Review performed

I verified the frozen E-COMPILERREG seal and confirmed that the report, receipt, and raw evidence index still match the seal hashes. All 17 files declared by the E-COMPILERREG raw index match their recorded byte lengths and SHA-256 values.

The checkout is at commit `e0933465725e470dc610e3f81b4bbee95538c1d0`, tree `0a52ae23ab32e0ca35f6b1385ea851e3edeede3a`, with a clean worktree. The before and after source-pin snapshots both contain 203 paths and 73 Go test source files; their physical maps and Git blob maps are identical. I independently resolved every pinned path at the commit, read its Git blob, and compared both the blob and current regular file with the recorded byte count and SHA-256. All 203 Git blobs and all 203 working files match.

I did not rerun the Go suite. I parsed the preserved `go test -json` stream and checked its counts against the summary, command record, verification record, receipt, and captured toolchain outputs. The command was run from `compiled-frontend/`:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:/tmp/gondola-go/go/bin:$PATH \
GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false \
/tmp/gondola-go/go/bin/go test -json ./...
```

The saved command record and wrapper agree on argv and environment. The effective Go toolchain is `go1.27.3`; bootstrap Go is `go1.24.0`; preflight records Node `v22.23.4` on `PATH`.

## Results independently derived from the saved stream

The command exited 0 and emitted 355 valid JSON events across 8 packages (90,455 stdout bytes, empty stderr). Three packages passed: `analyze` with 45 terminal test events, `build` with 28, and `emit` with 9. That is 82 passing terminal test events including subtests, with zero failed or skipped test events. Five packages reported no test files; these package-level `skip` results are not skipped tests. No package was cached.

The saved preflight also contains an earlier source-selection attempt that failed with `ENOENT` on a skip-worktree historical coordination/rawlog file. Its record states that no test command started and no checkout files changed. The final selection excluded coordination evidence and output directories, then captured the verified 203-path pin set before and after the suite.

## Boundary

This review accepts the evidence for the nested `compiled-frontend` Go suite at the pinned commit. It does not establish that the root-wide Go suite, M0/counter regressions, prior keyed regression, browser behavior, or end-to-end delivery acceptance passed. No source, Git, branch, ref, or scheduler state was changed during this review.

Independent audit evidence: `module-effects-coordination/rawlogs/XR-COMPILERREG/index.json` (7 indexed files; SHA-256 `0955ab765e04e3c121f3acd9a926657073a8439159eadad1224d70e35a867712`).
