# E-CI-EVIDENCE — fresh current-head CI audit

**Outcome: `mixed_change`.** The fresh current-head CI matrix and primary artifact pass. The only published repair relative to the initial 8ed head is the compiled-methods runner’s producer-provenance layout/final-inventory roots; the Go application, analyzer, runtime, and renderers are unchanged from 8ed. This report audits the current 6b49 run set and artifact. It does not treat old-head success, a local run, or the synthetic PR merge tree as a substitute for this primary push artifact.

## Source and workflow identity

The published source is `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`, parent `8ed5b66a223de1992756516f8d3895c6e096f842`. The current evidence worktree is at that exact commit and tree. PR #13 was open, draft, and unmerged in the captured PR metadata. Its merge-test commit is `0e8d8f962fdb2e0ff74a86bd58bb932a2be3e6a5`, with tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81` and parents `195c9433179218348d4b9f2477ae1e0725337d15` and `6b49cc0bd4c9512a041f723c86b632ec506afd9d`.

The final retained workflow snapshot was captured at `2026-10-31T05:07:32.682Z`. All **26/26** jobs completed successfully: **13 pull-request** and **13 push** jobs. Every workflow head SHA and run ID matches the current source and initial workflow inventory. I retained strict UTF-8 decoded logs for all 13 PR jobs plus the primary push job; exact bytes, lengths, event/job identity, and SHA-256 values are in `lanes/evidence/log-manifest-6b49cc0.json`.

## Primary artifact and reproducible audit

The primary artifact is push run `41169518187`, job `124444234335`, artifact `13030848292`, workflow conclusion `success`. The provider ZIP is **11,460,089 bytes**, SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`. ZIP CRC validation passed; all **968** files and their hashes/sizes match the retained member manifest (**79,084,644** uncompressed bytes).

I independently audited the extracted records and pins with:

```sh
python3 compiled-methods/ci/2026-10-31/lanes/evidence/audit-primary.py
```

The command exited 0. Its result is `lanes/evidence/primary-artifact-audit-6b49cc0.json`. It checked the primary ZIP and each member; the 26-job final snapshot against the initial run IDs/head SHAs; 14 retained UTF-8 logs; the current checkout against 126 frontend, 130 backend, and 137 methods execution source pins; and the methods matrix’s combined source/build input pins and output pins against the checkout and extracted artifact. The methods matrix’s 188 combined inputs comprise 51 checkout-source pins and 137 generated-build pins. Its 149 check-time output pins comprise 145 artifact outputs and four checkout-source inputs. Each set matched, and the 149 check-time output pins remained stable through comparison.

The primary methods execution started at `04:41:00.445Z`, finished at `05:05:25.193Z`, and reports full mode, `passed`, 17/17 successful commands, no failures, and 137 equal source pins before and after. The conformance matrix reports `matched`: 19 ticks, 18 actions, 4 suppressed disabled attempts, 18 renderer swaps, 14 value-semantics checks, and all 4 mutation controls rejected. React-only, DOM-only, and alternating-swap profiles each have 19 trace ticks, 19 independent oracle snapshots, and 19 physical DOM snapshots. The swap profile records 18 swaps. All three browser profiles report no WASM requests/API attempts and no page errors; renderer-trace hashes are identical. Native and direct JSON records are byte-identical at SHA-256 `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`; the browser record is SHA-256 `af59cc079eccee6c2b3550fec081a32f9056758aa54c6a71ef6f53cdc56cf626`.

The `PublishSaved` probes retained the original state object across calls at action indexes 4 and 13 while the returned parent count changed as expected. Direct GoScript `Update` probes for locked `childAdd` and `childReset` remained unchanged with no effects. These probes remain distinct from the four disabled browser actions.

## Inherited and new execution counts

The primary artifact’s nested full-runner logs and lane execution records show:

| Record | Result |
| --- | --- |
| Compiled frontend | 33/33 commands; 5/5 app fixtures matched; 97 Node tests passed |
| Compiled backends | 18/18 commands; 5/5 backend conformance fixtures matched |
| Compiled methods | 17/17 commands; 10 method-owned Node tests passed |
| Typed composition inherited replay | matched; 63 scripts, 2,463 actions, 63 native executions, 2,463 native frames, 4,926 actor-to-native frame comparisons, 0 mismatches |

The command-count records are nested full-runner gates and overlap; they are not additive. The typed-composition CI stdout summary is in the primary artifact. The source-pinned `run-typed-composition.sh` specifies seeds `20261030,20261031`, 30 generated cases per seed, and a 40-action maximum; its source pin matches the current checkout. The full typed-composition summary JSON itself is not a member of the primary ZIP, so its exact seeds are attributed to the checked-in source-pinned command and the counts to the retained CI stdout.

For M0, the primary inherited CI stdout contains `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`. The checked-in `run.sh` command is `go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json`. The current rule table has 59 rows. The original `SHA256SUMS` manifest has 24 entries and SHA-256 `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`; `EXPECTED.json` is SHA-256 `639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2`. The primary ZIP contains the inherited pass output; the detailed M0 metadata file is checked-in source evidence, not a ZIP member.

## Toolchain

The primary execution records report root Go `1.24.13 linux/amd64`, compiled Go `1.27.3 linux/amd64`, Node `v22.23.4`, React and ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, and Chromium `156.0.8078.4`.

## Historical 8ed result and limits

The initial `8ed5b66a223de1992756516f8d3895c6e096f842` workflow set is preserved separately: 24 successes and 2 failures, both compiled-methods jobs (primary push run `41167228825`; primary PR run `41167273600`). The failed primary artifact ZIP is retained and independently indexed in `lanes/evidence/old-head-artifact-audit.json`. Its method trace stages completed, but final validation was rejected because the old runner looked for `builds/request.json` while the build producer wrote per-backend request/result files; the check withheld full conformance acceptance. The old failure is historical and is not counted against or substituted for the all-green 6b49 workflow set.

This packet establishes successful current-head CI and its bounded recorded tests. PR #13 remains unmerged in the captured identity, so this is not a merge or release claim. The two current source workarounds/repairs and limits are represented only as the published runner-path repair; no broader claim is made about Manager/session cancellation or untested profiles.
