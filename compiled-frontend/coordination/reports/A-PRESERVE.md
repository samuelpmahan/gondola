# A-PRESERVE

**Outcome: confirmed reuse.** The inherited typed-composition run is intact and reproducible from preserved logs and its manifest. The 24 pinned SHA-256 entries still match; every pre-existing tracked file matches commit `42df6883337605d901a23e9fed874768c7ce1824`; repository-root `go.mod` is byte-identical to that baseline and no root `go.sum` is present.

## Baseline and repository state

- Current branch: `codex/gobi-compiled-frontend-20261030`.
- Current `HEAD`: `42df6883337605d901a23e9fed874768c7ce1824` (parent `d6d425765ee9d48eae22342a3cb75fab2e2871ba`).
- `git diff --exit-code 42df6883337605d901a23e9fed874768c7ce1824 --` and the cached diff both exited 0. The baseline tree contains 1,228 tracked paths; no tracked path has a content, mode, addition, or deletion difference from the baseline.
- `git status` shows the current implementation and generated evidence as untracked paths. The checkout is therefore not globally clean, but the original tracked tree and index remain unchanged. No file was staged or committed in this review. No merge or deployment occurred.

The inherited root `SHA256SUMS` contains 24 pinned entries. I reran only the bounded checksum verification, not the full suite:

```text
sha256sum -c SHA256SUMS
```

Result: 24/24 `OK`. `SHA256SUMS` SHA-256 is `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`; the saved verification output is `coordination/reviews/preserve/sha-check.log` with SHA-256 `e43918e16a1399d0d91ec6b9b428bb8a13679f0f880b97960aab21d419d99e0a`.

Repository-root `go.mod` SHA-256 is `e5dba8ed15a331f2bcdc7a35604cadd927fd486bca2543e83953f6a73716c5fa`, matching both `git show 42df6883337605d901a23e9fed874768c7ce1824:go.mod` and the pinned checksum. A prior `go get` incident was reported during this work; I am not claiming it never occurred. The final repository-root state has the baseline `go.mod` bytes and no root `go.sum` in either the worktree or baseline tree. The separate nested `compiled-frontend/go.sum` belongs to the new compiled-frontend module and is not a root-module checksum file.

## Inherited run evidence

The preserved execution manifest is `compiled-frontend/evidence/inherited/execution.json`, SHA-256 `795b36bfd55cbf3e55ec523676efd99e42fbe38009a6054c51aa47edc549e671`. It records the final inherited command as:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 CHROMIUM_EXECUTABLE_PATH=/tmp/chromium bash run-typed-composition.sh
```

The full log `compiled-frontend/evidence/inherited/full.log` has SHA-256 `8041da184cf0b6255c5dc0fc2801a659f7fd0dbbc99abf6635bbef98e365113f`. The manifest records exit 0 at `2026-10-30T22:20:22.454666+00:00`, using Go `go1.24.0 linux/amd64`, Node `v22.23.4`, React and ReactDOM `19.3.1`, Playwright `1.64.1`, and Chromium `153.0.8010.0`.

The first recorded attempt used the same command without `GOFLAGS=-buildvcs=false` and exited 1 before the interaction run. Its log is preserved at `compiled-frontend/evidence/inherited/attempt-1-vcs-failure.log`, SHA-256 `b7db793bce560f1a606cb6ca920c7b5641d650c237e024f6578870cfd55d4518`. The recorded cause is Go 1.24 VCS stamping in a linked worktree: the build runs from `/workspace`, while this worktree represents `.git` as a file. The successful retry disabled only binary VCS stamping. This was a Go/worktree build workaround, not an application-source fix.

## Verified result and limits

The inherited `typed-composition/build/report.json` is present, 259,933 bytes, and its current SHA-256 matches the execution manifest's `7f3bfc90929aa38d481f791d2dc45e7b8488b4a8d8f32afd5d9c044a02923387`. It reports status `matched`, 63 scripts, 2,463 actions, 63 native executions, 2,463 native frames, 4,926 actor/native frame comparisons, and 0 mismatches. The raw mismatch artifact reports count 0. The inherited log also records matching behavior over 5,000 inputs and `SHA256SUMS ok`.

This was an inherited typed-composition run, not a fresh run of the compiled-frontend compiler milestone. The execution manifest explicitly says the new `compilercontract` codec was repaired after the inherited root Go test phase. Therefore this evidence does **not** establish that the post-repair codec or new compiled-frontend packages passed current Go 1.24 tests, race, or vet; the root integration runner must cover those gates separately. No new full test run was started for this preservation audit.
