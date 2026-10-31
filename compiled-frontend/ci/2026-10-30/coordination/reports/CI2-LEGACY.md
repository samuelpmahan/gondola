# CI2-LEGACY — PR #11 inherited workflow audit (head 184ccda)

**Decision: accepted for this bounded CI and preservation packet.** At 2026-10-30 23:51:16 UTC, all 11 pull-request-triggered workflows for PR #11 completed successfully on head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281` (tree `ca99e9432dca87a6bf6718c20186b1223b870126`, parent `408e330517b1dd5e5f865e2ff1914465f98bcf66`). This is a fresh run set for the repaired head; the 10/11 result and compiled-frontend failure on parent head `408e330` remain historical evidence in `CI-LEGACY.md` and are not carried into this conclusion.

## Final PR workflow results

The final PR-triggered run and job snapshots are saved in `audits/CI2-LEGACY/workflow-runs.final.json` (SHA-256 `f2e465ca1e543a02df576f37ef31d5967fc0956658c2f3172452e26fcdb32850`) and `workflow-jobs.final.json` (SHA-256 `0948cd50f6443feeaa8f40b43088406f95a9ea32ccc9e066155d86646aa43678`). I fetched the completed job log for each run and retained all 11 logs under `audits/CI2-LEGACY/`.

| PR workflow | Run / job | Result | Added parity evidence from its completed log |
|---|---:|---|---|
| Counter interaction parity | 41144116468 / 124365058811 | success | 107 scripts, 4,473 ticks |
| Gobi backend replacement | 41144116458 / 124365058812 | success | 103 scripts, 5,249 ticks |
| Gobi controlled input | 41144116513 / 124365059027 | success | 216 scripts, 10,149 observations |
| Gobi async effects | 41144116565 / 124365059314 | success | 76 scripts, 1,552 observations |
| Gobi HTTP effects | 41144116494 / 124365059043 | success | 82 scripts, 1,572 observations |
| Gobi keyed collection editor | 41144116527 / 124365059261 | success | 70 scripts, 1,113 observations |
| Gobi renderer conformance | 41144116518 / 124365058837 | success | 71 scripts, 1,184 observations |
| Gobi multi-root sessions | 41144116510 / 124365059205 | success | 63 scripts, 1,896 actions, 1,959 ticks, 11,754 actor observations |
| Gobi nested session tree | 41144116622 / 124365059491 | success | 63 scripts, 1,591 actions, 1,654 global ticks, 5,176 native frame pairs, 0 mismatches; browser smoke passed |
| Gobi typed parent and child composition | 41144116560 / 124365059421 | success | 63 scripts, 2,463 actions/native frames, 4,926 actor comparisons, 0 mismatches |
| Gobi compiled Go frontend | 41144116537 / 124365059288 | success | Four apps compiled and checked across five scripts: 43 ticks, 0 mismatches; demo smoke passed |

The compiled-frontend job ran the repaired full chain through completion. Its log records the inherited root baseline, Go unit/race/vet commands for root packages (`./compilercontract ./fixtures/compiled/... ./cmd/compiled-native`) and compiled-frontend packages (`./analyze ./build ./cmd/... ./emit`), Node tests, `go run ./cmd/gobi-build`, native build, native/direct/browser comparisons for counter, form, list, effect, and list-growth fixtures, and the demo smoke. The execution summary is `{"status":"passed","apps":4,"scripts":5,"ticks":43,"mismatches":0}`. Its upload step reports artifact `13020568606`, size 124,558,516 bytes, archive digest `c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e`. N5 did not download or independently materialize this artifact; root owns the single primary artifact materialization.

## Inherited baseline and toolchain

All 11 workflow definitions declare Go `1.24.x` and Node `22`; the completed logs show Go `1.24.13 linux/amd64`, Node `v22.23.4`, and npm `10.9.9`. The compiled-frontend log records downloading the separate frontend toolchain `go1.27.3` before running its package gates. Each workflow log records the inherited root baseline commands:

- `npm ci --no-audit --no-fund`
- `go run ./cmd/gobi emit react`
- `go vet ./...`
- `go test ./...`
- `go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json`
- `sha256sum -c --quiet SHA256SUMS`

Each completed log reports `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`. The source inventory independently identifies 59 executable React rule literals and 24 checksum pins. The emitter creates the generated `react-map.gen.mjs` pin during the baseline; the completed runs validate the emitted file along with the remaining pins.

## Source preservation and trigger scope

The read-only source inventory binds the checkout to head `184ccda...`, tree `ca99e943...`, and parent `408e330...`; tracked worktree was clean. Compared with base `42df6883337605d901a23e9fed874768c7ce1824`, the head has 1,841 tracked paths versus 1,228 at base, a diff of 613 additions, 0 modifications, and 0 deletions. Thus every one of the 1,228 predecessor paths remains unchanged. The preceding PR head-to-head delta is 14 paths (3 modified PR-added paths and 11 additions).

The PR-only wrapper is the source for the final per-workflow table above. A separate fresh unfiltered API snapshot (`audits/CI2-LEGACY/workflow-runs-unfiltered.final.json`, SHA-256 `57817099659ac3d8f8939b0eda26f69c458d2dfb38c2ca8d5e0484d346372dd5`, observed 23:51:16 UTC) returned 22 runs for the exact head: 11 `pull_request` and 11 `push`; all 22 were completed with conclusion `success`. The retained per-job logs are the 11 PR-triggered logs listed below; I did not fetch duplicate logs for the corresponding push runs. The earlier unfiltered snapshot (`workflow-runs-unfiltered.snapshot-1.json`, SHA-256 `f5e2fd33088dca68bf37265b58271d4f850c04cb4cb298ba96de880edea17410`, observed 23:33:13 UTC) is preserved as an in-progress historical snapshot (4 push runs success, 7 push runs in progress at that time).

## Raw job-log hashes

All paths are relative to `compiled-frontend/ci/2026-10-30/`.

| Raw log | SHA-256 |
|---|---|
| `audits/CI2-LEGACY/interaction-run-41144116468-job-124365058811.log` | `4a92d8d97e5c52c021d9ea92d36f186b6f4b338ef246b4876e8b9ca76c6dd2f9` |
| `audits/CI2-LEGACY/backend-replacement-run-41144116458-job-124365058812.log` | `402601364cf27218841fe83704193f1484d9d3ee243c895b9ad60bb0ffd97140` |
| `audits/CI2-LEGACY/controlled-input-run-41144116513-job-124365059027.log` | `2568ea6342a9b6aea67cfbba9dc1aa58d4383d66b666c55bfedf6300104b1a69` |
| `audits/CI2-LEGACY/async-effects-run-41144116565-job-124365059314.log` | `7e3372d351b5f53c3f07e42b3b48d61e0641671034d8b25c2276a229734ea60e` |
| `audits/CI2-LEGACY/http-effects-run-41144116494-job-124365059043.log` | `7b3d4517481d4ba442d5a1f930a2d0b0e76fe8864962d0e74c56e2cbfdf3de44` |
| `audits/CI2-LEGACY/keyed-editor-run-41144116527-job-124365059261.log` | `3b08c64b98c9b19750a950cd4b7f277f5b3fab45f6465312ed0e0e7ae9d72988` |
| `audits/CI2-LEGACY/renderer-conformance-run-41144116518-job-124365058837.log` | `e5689a17a69298c1145b687ced025d9c6fe08811e98b3265462dbceb6ee095bb` |
| `audits/CI2-LEGACY/multi-root-run-41144116510-job-124365059205.log` | `ad12701441a5ebee491c09dba777a534666d3b606f5a5f7ea883e69ab2fc4580` |
| `audits/CI2-LEGACY/session-tree-run-41144116622-job-124365059491.log` | `3a96b4508546e31396b9ecdd827cbb25f1959a8324cb233c7f92215de77863cc` |
| `audits/CI2-LEGACY/typed-composition-run-41144116560-job-124365059421.log` | `7ddc5da87b22010d3075ed894b34e46c89251f1ffa0b3e436bfc123c30ac0f59` |
| `audits/CI2-LEGACY/compiled-frontend-run-41144116537-job-124365059288.log` | `e705351874b8053731f74f43c626e8c5be7f4d469981554d697390eff6c42ec8` |

The exact source inventory and final workflow snapshots accompany these logs under `audits/CI2-LEGACY/`. This packet accepts inherited CI reuse and preservation for the specified PR head. It does not make a deployment, merge, general compiler correctness, or all-events CI claim.
