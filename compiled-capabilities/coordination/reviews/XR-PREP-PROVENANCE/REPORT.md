# XR-PREP-PROVENANCE — independent preparation review

## Decision

**Accepted for preparation only.** The refreshed auditor passes its focused checks, the missing-evidence path does not accept, and the original M0 inputs verify against the frozen base. This review does not establish full-run source pins, publication binding, or milestone acceptance.

## Source and binding review

The reviewed source is `audit.mjs` SHA-256 `c121b32bfb6874f7e5480096e1ea309b4c8eead04408556b8465f912cfd4dd9e`; its focused tests are `audit.test.mjs` SHA-256 `9b09726dca8f29f3a73f9a135efc138007396d79dbb18d98dff77ee5375b6a36`. Both hashes match the refreshed values in `HEAD-refresh-supplement.md`.

Code inspection confirms the intended gates:

- `sourceBefore` and `sourceAfter` normalize to unique safe relative paths, nonnegative safe integer byte counts, and SHA-256 values; the two sets must match independent of row order.
- The required path set is derived from `sourceFiles`, `sourceDirectories`, and `ignoredSourceDirectories` in the source commit's pinned `compiled-capabilities/run.mjs`, plus the signed manifest rows. It is compared with both the pinned Git tree and the current worktree. Each listed working file and local Git blob is hash/length checked; with a binding, each published Git blob is also checked.
- The generated `react-map.gen.mjs` exception must match its signed row and remain absent from both source and published Git trees.
- The binding requires the frozen base, equal local/remote trees, identical ordered direct-parent lists, and exactly one direct parent equal to the frozen base. The audit resolves the commits and verifies actual trees and parents. Distinct local and remote commit IDs are accepted when those constraints hold.
- The original `SHA256SUMS` bytes must match the frozen base. Its 24 rows are checked as 23 tracked inputs plus the signed generated map. Tracked M0 bytes are compared across base, source commit, and worktree; `EXPECTED.json` is explicitly included.

Focused tests passed 3/3 under Node v22.23.4. They cover safe/unique pin rows and order-independent matching, an envelope with distinct local/remote commit IDs and equal trees/direct parents, and a missing-evidence invocation. The publication-binding test is an envelope test; no actual remote binding was available for end-to-end validation.

## Missing evidence and fail-closed probe

The current preparation fixture has no full-run source pins or publication binding. The independently rerun CLI exits 2 with `status: incomplete`, `finalAcceptance: false`, and missing inputs including `sourceBefore pins`, `sourceAfter pins`, `sourcePinsMatch=true`, full-run status, and `--binding`. It independently confirms the original `EXPECTED.json`, 23 tracked M0 files, and signed generated map.

A preserved synthetic complete-shape receipt with empty before/after arrays and no binding exercises the binding-absent edge. It exits 1 with `status: failed` and `finalAcceptance: false`, due to `remoteInfo.commit` being read while `remoteInfo` is null. This is a nonblocking status-classification mismatch for preparation: it fails closed and does not produce acceptance. The probe is retained as `missing-binding-probe.json`; it is not a real E-BUILD receipt.

The source commit exercised here is `232406843678f46c569e1c54b34b268c84e7764e`, tree `4cf0a6bf06f5aac29788ddd77fc61ed79a34e3a1`, directly parented by frozen base `00da54ad0f5a4006b13a5cded18ce291845978bc`. This is the pre-full-run checkpoint only. The auditor requires `--source-commit` to equal current `HEAD`; root must rerun source validation after the final source checkpoint and provide the complete E-BUILD receipt and binding.

## Receipt and log custody

The additive `HEAD-refresh-supplement.md` discloses the source/test refresh and the original closed packet restoration. I verified the restored report hash `4faf7d74621659d562930bd83854e319fd4fe1e740217f891ec97d3ceac21ef2` and receipt hash `07605b2872369ba866a57ae54730f007383f3771a5e281295944056dfe73ce96`; both match the supplement. The refreshed source hashes above are recorded in that supplement. The original receipt's source hashes refer to the closed versions and are historical.

The supplement also discloses that four original log files were overwritten during the HEAD refresh. I do not treat their old contents as retained or reconstruct them. The receipt's old hashes and the current replacement hashes are:

| Log | Closed receipt hash | Current replacement hash | Review treatment |
|---|---|---|---|
| `audit-syntax.log` | `e0cb71fe601c6aa0bc77d1c72b7de24eb689cec9d73775860edf39dc4fa5755c` | `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8` | Old bytes not retained; use independent review run |
| `test-syntax.log` | `202a87a00ef76091d8a32984349b989f52b738f07047864bf3713d162d3dcc74` | `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8` | Old bytes not retained; use independent review run |
| `node-test.log` | `8cfd5ea1620453ffc8e47b21063b82cc9eae6cc463639d41e4efab10562aec04` | `3e15a0b62fdb2d0e1f67c9b3ee098b316e240bc7c1d1ddea898e27530d7333d3` | Old bytes not retained; use independent review run |
| `missing-input-exercise.json` | `eb05ca9b4a6ab4c61167826590e98da26dfbc55b0309266824a09b31f93fa4bd` | `27c373367ed3b58ebeec9e2747a834a066aaf9a2f3c4c60b749a7e6e87925f71` | Old bytes not retained; use independent review run |

The supplement records `node-version.log` and `missing-input-exercise.stderr.log` as unchanged. Fresh independent outputs, exit codes, and the missing-binding probe are under this review directory. No original missing log bytes were recreated.

## Scope and limitations

This review checks auditor preparation, M0 preservation, missing-evidence behavior, and the binding gate by code inspection and focused tests. There is no completed full-run receipt, `sourceBefore`/`sourceAfter` set, or publication binding in the available evidence, so actual source-pin coverage and local/remote Git equivalence remain pending. Archive/build validation is outside this review. The current workspace contains other agents' uncommitted changes; this review made no Git or production changes.
