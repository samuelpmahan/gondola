# XR-NATIVE-PATH — independent native executable path review

**Decision: accepted** (`confirmed_reuse`) for the resolver repair and its local lifecycle-only verification. The preceding hosted primary run remains failed; this review does not claim hosted CI success.

## Frozen change and RED reproduction

I reviewed N1's dated author packet: report SHA-256 `734f1b10f5957ddb047e38b2a194d8eda1e55ae207d6415e275bcaea2f2ef3eb`, receipt SHA-256 `93246f5b6cf12d9681bcc26fb0419553ed14069b426646464aa2545d30fc2b3a`. The dated CI copies match the source-worktree copies byte-for-byte. I also checked all 34 entries in `lanes/repair-native-path/copy-custody.json` against both worktrees; the retained RED captures, GREEN logs, and author packet match their recorded sizes and hashes.

Before the repair, the new regression test packet records two failures out of three tests. With `--native-go go`, the resolver rewrote the bare command to `/workspace/scratch/39a56936f173/gondola/go`, and native replay failed with `ENOENT`. The old full matrix retained direct and browser captures, but marked native replay failed and withheld the final conformance check. Those RED files remain preserved and are not counted as passing evidence.

The frozen change in `compiled-lifecycle/conformance/run.mjs` leaves bare executable names available to `spawnSync` PATH lookup, resolves explicit relative paths against the invoking working directory before the child switches to repository-root CWD, and keeps `GOBI_GO_BIN` configurable with bare `go` as the unset default. The new `native-path.test.mjs` exercises the real native Go CLI, explicit absolute/relative paths, cross-CWD relative resolution through a fake executable, and configured/unset default behavior.

## Independent verification

I reran the targeted tests from the source worktree with `GOBI_GO_BIN` unset and `GOBI_GO_EXECUTABLE=go`:

```text
node --test compiled-lifecycle/conformance/native-path.test.mjs
4 passed, 0 failed
```

Then I independently ran `conformance/run.mjs` against N1's final, pinned React and DOM build directories, with `--native-go go`, using the same portable PATH and writing all new conformance outputs to this review lane. The fresh run returned `matched`; its native, direct, React, DOM, and alternating-swap browser stages completed. The result records the bare native command `go run ./cmd/compiled-lifecycle-native`, empty native stderr, 26 ticks, 17 renderer swaps, and all eight mutation controls detected. The literal oracle checks cover native, direct, browser traces, and physical DOM behavior. The runner's 179 source pins and eight final React/DOM output pins remained unchanged and match the source worktree.

The N1 lifecycle-only receipt independently records all 13 stages passed, 123 stable source pins, and 67 stable output files for each backend. Its native/direct/browser oracle matched 26 ticks, 17 swaps, and eight mutation controls; its HTTP demo passed all 12 checks. I validated the original archive at the source attempt path, without copying or rewriting it: SHA-256 `f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf`, 719 regular files, 168,200,217 uncompressed bytes. Every file matched the attempt manifest (SHA-256 `27e0ade2164813d3fba831cc44f19b9f9bf56ef862ee68d8f6942dd0e7064c46`); no unsafe tar paths were present.

An earlier post-fix lifecycle-only invocation is retained as failed because its deliberately minimal PATH omitted `npm` (`spawnSync npm ENOENT`). The other lifecycle stages, including the matrix, completed in that attempt, but I do not count it as the green run. N1's subsequent lifecycle-only attempt used the recorded normal npm 11.9.0 PATH and passed. This repair review does not modify or replace either receipt.

## Commands, versions, and evidence

Targeted test command:

```text
node --test compiled-lifecycle/conformance/native-path.test.mjs
```

Fresh matrix command: `node /workspace/scratch/39a56936f173/gondola/compiled-lifecycle/conformance/run.mjs ... --native-go go ... --output /workspace/scratch/39a56936f173/gondola-lifecycle-ci/compiled-lifecycle/ci/2026-10-31/lanes/review-native-path/matrix/lifecycle --chromium /tmp/chromium`. The full argument vector and environment are retained in `lanes/review-native-path/matrix/command.json`; `GOBI_GO_BIN` was unset and PATH began with `/tmp/gondola-go/bin`.

Tool versions: Node `v22.23.4`, npm `11.9.0`, Go on PATH `go1.24.0 linux/amd64`, Chromium `153.0.8010.0`, Python `3.12.14`. N1's full lifecycle-only record also pins compiler Go `1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2`.

- Independent audit: `compiled-lifecycle/ci/2026-10-31/lanes/review-native-path/audit.json`, SHA-256 `a96d95abbb8b5e3b088ecd6b48ede07a63b788003b26c7a58215aefd39afaefe`.
- Read-only audit script: `compiled-lifecycle/ci/2026-10-31/lanes/review-native-path/audit_native_path.py`, SHA-256 `11276ce197cd5813061ebce7dca1968993d1325a145b5084429a9291ec5d930f`.
- Independent test log SHA-256 `5b2c2dcac77a3d4c9239f87f1226b3b88a090170ec872f952f03cfe5e74ba7f7`.
- Fresh matrix check SHA-256 `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a`; run record SHA-256 `ccaf13af2402b0525f980dfb9ab3ad3e70726c368ffe66789f153ac03228280d`.

This accepts the portable resolver fix for the reproduced failure and the local lifecycle-only evidence. The earlier hosted failure remains historical, and no hosted full-CI pass is claimed.
