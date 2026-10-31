# XR-CI-TRACE — independent review

**Decision: accepted**, for N2's account of the failed first attempt only. This review does not accept the four-app/five-script CI trace gate.

## Review findings

- The report and receipt identify workflow run `41140265213`, artifact `13019432197`, tested head `408e330517b1dd5e5f865e2ff1914465f98bcf66`, and archive SHA-256 `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`. Their values agree with the canonical provider evidence.
- I compared N2's pinned 19-file inventory with the extraction manifest by path, bytes, SHA-256, and ZIP CRC32, and recomputed the extracted files' byte lengths and SHA-256 values. All 19 match; the original archive SHA also matches. The independent comparison result is preserved in `audits/XR-CI-TRACE/metadata-crosscheck.json`.
- The archived execution receipt records status `failed`, sourceBefore count 116, no sourceAfter, and ends at `node-tests` with exit code 1. The 81-test output shows 79 pass and two no-WASM browser tests failing because Chromium was missing at `/tmp/chromium`.
- There is no `compile-four` command, build result, or new native/direct-JavaScript/browser trace in the compiled-frontend artifact selection. The manifest also includes inherited aggregate reports; those do not establish this run's new trace gate.

N2 correctly classifies trace conformance as `insufficient_evidence`, limits the packet to the failed first attempt, and does not claim app trace success. No amendment is needed for this bounded report and receipt. The later repaired workflow must supply its own completed run and trace artifacts before CI-TRACE can be accepted.

## Reviewed files and hashes

- `coordination/reports/CI-TRACE.md` — SHA-256 `b19bbdf9e3e2e42daaa4e60371f1847c9cac08ce521383b8c13606afeca25ab7`
- `coordination/receipts/CI-TRACE.json` — SHA-256 `df5e25c6480179d3142d09f2ab42377c8bd8508f7b7131a15fb9d457423fe54f`
- `audits/CI-TRACE/partial-failure-41140265213.json` — SHA-256 `61f1846ad3f97e9d764df1d55e8d3698f851636c921d7144a541a8c67824cc7b`
- `provider/extracted/extraction-manifest.json` — SHA-256 `504a7b04f88da14d79fa0c6d91e3792c44badebb089220d8a152acc81c8dda4c`
- `provider/extracted/compiled-frontend/artifacts/execution.json` — SHA-256 `26d4f82477d0989543f0fdaa9e6885c53990961e0a4c7de74bb9bd5d1c825c86`

No source, N2 packet, or provider artifact was changed, downloaded, or rerun for this review.
