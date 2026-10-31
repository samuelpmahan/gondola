# CI2-PUBLICATION: successful run and retained artifact

**Outcome: `confirmed_reuse`.** The successful GitHub Actions run and its artifacts are bound to PR #11 source head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`. The repaired CI job completed successfully and recorded all four app fixtures plus list growth: five matched profiles, 43 ticks, and zero mismatches.

## PR, run, and Git data

The refreshed GitHub PR API observation at 2026-10-30 23:51:34 UTC reports PR #11 open, draft, mergeable, and unmerged. The PR source head is `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`; its tree is `ca99e9432dca87a6bf6718c20186b1223b870126`, and its parent is `408e330517b1dd5e5f865e2ff1914465f98bcf66`. The PR base remains `42df6883337605d901a23e9fed874768c7ce1824`. The local alias `3b974a34f84edd1a968c2bac174f1632c6e1e097` has the same source tree and parent as recorded in the initial source snapshot.

GitHub's current PR merge ref resolves to synthetic merge commit `b51f925399376ec611fedf867503b814b6c1db13`. Its tree is the same `ca99e943...` tree; its parents are PR base `42df688...` and source head `184ccda...`. The repaired run is a pull-request event and its run `head_sha` is the source commit `184ccda...`. The artifact's workflow-run association repeats that run ID, branch, and head SHA. The completion metadata records checkout step success but does not include a checkout SHA; this report keeps the run source head and synthetic merge candidate distinct.

## GitHub run and original artifact

The run `41144116537`, attempt 1, completed with conclusion `success`. Its job `124365059288` (`compiled-frontend`) and all workflow steps completed successfully.

The GitHub artifact row is ID `13020568606`, name `gobi-compiled-frontend-artifacts`, size 124,558,516 bytes, digest `sha256:c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e`, and expiry `2027-01-28T23:22:48Z`. The provider metadata says it is not expired and associates it with run `41144116537` and head `184ccda...`. The preserved original ZIP at `provider/downloads/run-41144116537.zip` has the same byte size and SHA-256. Its digest also matches both `provider/repaired-archive.json` and the repaired extraction manifest.

## Successful CI execution

The artifact's `execution.json` records status `passed`, all 33 commands at exit code 0, and 116 source pins before and after execution with identical values. Tool versions are Go 1.24.13 for root compatibility checks, Go 1.27.3 for the compiler, Node v22.23.4, React/React DOM 19.3.1, esbuild 0.28.2, and Playwright 1.64.1. The Node log reports 81 tests passed and zero failed.

Five native/direct-JavaScript/browser profiles are marked `matched`, with 43 total ticks and zero mismatches:

| Fixture | Ticks | Result |
|---|---:|---|
| Unchanged counter add/reset/disabled | 5 | matched |
| Form text/checked/literal/save/reset | 10 | matched |
| Keyed list identity/empty/detached | 11 | matched |
| Effect commit before deterministic reply | 5 | matched |
| List growth with spare-capacity edit/reorder/reset | 12 | matched |

The real demo smoke report passed: all four compiled components mounted; counter, controlled form, keyed list, and one manual effect reply were exercised; no browser errors or WASM requests were reported.

## Retained evidence delivery

Root materialized the original GitHub ZIP once. A first attempt to extract large inherited JSON reports failed with ENOSPC; the recovery record documents removal of only duplicate ignored copies and retention of the original ZIP. The bounded extraction at `provider/repaired-extracted/` contains all 309 compiled-frontend artifact files and four selected small inherited JSON reports. Larger inherited shards remain in the original GitHub ZIP.

The permanent retained subset is `provider/repaired-compiled-artifacts.tar.xz`, 3,490,468 bytes, SHA-256 `88c6a9568a7374bd0ff6ac4bda84d70a052285e7fd8eafd53e5a1532d4279eeb`. The independent streaming `tarfile` check read it without extracting files: archive hash and size match `provider/repaired-archive.json`; all 313 manifest-listed files (309 compiled plus four inherited) match path, bytes, and SHA-256; the 314th member matches the immutable extraction manifest. No mismatches or extra file members were found. The check and output are preserved under `audits/CI2-PUBLICATION/`.

## Limits and preservation

This acceptance covers the named PR #11 head, the successful workflow run, its artifact binding, and the five recorded fixture profiles. It does not claim universal Go/compiler coverage or inspect every inherited shard in the original ZIP. The earlier failed first-attempt packet for run `41140265213` remains preserved and is not overwritten. PR #11 is still open, draft, and unmerged in the refreshed observation.
