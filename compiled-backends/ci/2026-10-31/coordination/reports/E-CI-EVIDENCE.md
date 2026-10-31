# E-CI-EVIDENCE (N6)

**Outcome: `mixed_change`.** The published backend milestone adds a DOM renderer/build target while reusing the existing Go application functions and one concrete emitted module per app in the mixed-renderer harness/demo. The CI evidence supports the bounded build and swap claims below. This packet audits retained records; it does not replace the independent CI review packets or root's native/PR-readiness closure.

## Published source and historical baseline

The repaired PR12 head is `195c9433179218348d4b9f2477ae1e0725337d15`, tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`, with direct parent source `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb` and PR11 base `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`. The 832 source tree is `bc8883df935c7d0c8b7265831cacdf5521fb70d2`; its synthetic PR merge `32bdafa0337bfeda55058e9afb36ff06cc6f8496` has the expected base/source parents and same source tree. A retained raw runner log independently shows checkout of that merge.

The historical `compiled-backends/DELIVERY.json` has 324 entries; I verified every entry against the Git blob at source 832 and confirmed the current file is byte-identical to that historical blob. The accepted prior evidence archive contains 2,019 unique files (9,577,956 bytes compressed; 356,910,490 uncompressed) and matches its full member index. Comparison with the PR11 tree finds all 1,251 tracked paths outside `compiled-frontend/` unchanged.

Source 832's completed CI inventory was 20/24 successful and 4/24 failed, split evenly across push and pull-request events. Both compiled-frontend and compiled-backends workflows failed on each event. The archived compiled-backends run stopped in the inherited runner before application checks; its 97-test log records 92 passes and 5 failures, all browser launches looking for absent `/tmp/chromium`. The follow-up repair manifest pins the two browser-test launcher edits plus historical-scope docs, with six pinned local reports/logs; fresh source-195 CI below establishes the managed-browser path. I did not rewrite the old DELIVERY or 832 receipts.

## Primary full CI artifact

The primary run is full push run `41155530877`, job `124401386239`, artifact `13025112465`. The raw Actions log records checkout of exact source 195, installation of managed Playwright Chromium, execution of `bash run-compiled-backends.sh`, and success. Run/job metadata and the log agree on the source, event, and successful status.

I independently rehashed provider ZIP `original.zip`: 14,931,201 bytes, SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. All 817 ZIP members match the retained size/SHA index, CRC/compressed-size inventory, and extracted files (87,153,279 uncompressed bytes). The distributable `ci-artifacts.tar.xz` is 5,217,080 bytes, SHA-256 `91b781500ff5379cf118918f545b6593969cb28d5495014b68c9a3ea6ca9218d`; I checked all 817 tar members against the same index.

The artifact's compiled-backends execution record is `full`/`passed`, with 18/18 commands successful, the inherited runner passing, and 126/126 source pins unchanged. The compiled-frontend record has 33/33 successful commands, 122/122 source pins unchanged, root/compiler Go test, race and vet commands successful, and 97/97 Node tests passing. Both Chromium environment overrides were unset; the smoke reports managed Chromium `156.0.8078.4`.

| Evidence | Recomputed result |
| --- | --- |
| React and DOM builds | 4 apps and 209 outputs each; all source/output before-after pins stable |
| Cross-build outputs | 204 paths byte-identical; only four raw GoScript bundles and the backend-tagged manifest differ; no bundle normalization/equivalence claim |
| Shared module use | Four app modules, one load each in the harness/demo renderer set `{react, dom}` |
| Native/direct/browser/swap matrix | Counter, form, list, effect and list-growth all matched; 43 ticks, 37 swaps, 9 focus swaps, 45 mutation controls detected |
| HTTP demo | 5 checks passed, 0 errors, 0 WASM requests; form focus/backward selection and pending effect are covered |

The typed-composition PR artifact is a separate run (`41155534348`, artifact `13025895217`). Its provider ZIP rehashes to 120,564,373 bytes and SHA-256 `eda966eb257998dd01c350e76375b216c1b9c7e69bf6a222057bae58ebe8b23e`; the complete 2,372-member index, ZIP metadata and sizes match. Its report has 63 scripts, 2,463 actions/native frames, 4,926 actor comparisons and zero positive mismatches across seeds `20261030`/`20261031`. Nine selected files/553,021 bytes and the complete member inventory are retained here; the 3.3 GB uncompressed provider artifact is not Git-retained.

## Current-head statuses and scope

The immutable `runs-source195-final.json` snapshot SHA-256 is `f51925822e16899aa2f8951cf749a8696a30d89c2543dcd836291c1d2128ef8b`. Its 24 distinct workflow runs all completed successfully at source 195/tree c0e4a66: 12 `pull_request` and 12 `push`. The separate primary full run above remains specifically a push artifact. Two detailed repaired-head PR logs independently show checkout of synthetic merge `ce26da0cb62e4ba3fd1ddd2c2f2456c42969b131` (base 184cc/source 195, tree c0e4a66) and record inherited M0 (5,000 cases/receipt/SHA checks) plus the interaction and backend-replacement seed-20261030 results. The status snapshot includes all other runs; per `status.json`, decoded logs are retained for the 12 PR runs and primary push, while other push runs are status records only.

The README draft's inspected source, count, hash, run-selection, browser, typed-artifact and coverage claims agree with the records audited here. One source repair note is contemporaneous and still says fresh CI is required; root will clarify in the dated CI README that this run closes that managed-browser gate. This report does not claim native peer-review closure, merge readiness, deployment, a retained native DOM listener invocation, raw React/DOM bundle identity, or any unarchived traces.

## Audit record

The read-only verifier is [`audit_published_packet.py`](../../lanes/evidence/audit_published_packet.py), SHA-256 `3df9d5c9f3e5001edc766dce569f1732c6b7e60b60599075452d723cf6b40fc0`. It was run with:

```sh
python3 compiled-backends/ci/2026-10-31/lanes/evidence/audit_published_packet.py
```

It returned `passed`. The machine-readable audit is [`published-packet-audit.json`](../../lanes/evidence/published-packet-audit.json), SHA-256 `e718a62deeec6ba2c2298f5cd394c7a31430e94b54c4eb56a781273fc543ca37`. This read-only review did not edit production source, test files, CI provider evidence, Git history, or other workers' packets.
