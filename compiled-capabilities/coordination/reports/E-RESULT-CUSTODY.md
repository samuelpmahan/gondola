# E-RESULT-CUSTODY

**Outcome: insufficient evidence.** The source-bound primary push artifact is preserved and verified, but its canonical E-BUILD receipt is `failed/mixed_change` even though the GitHub Actions run and job concluded successfully. This packet closes the old a2e1164 failed cohort as evidence only; it does not establish milestone acceptance. The repaired-source rerun is a separate cohort.

## Source and hosted workflow

The hosted source is commit `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`, tree `d22b75e18c7bea70a743cc79d53461b287c7d045`, based on `00da54ad0f5a4006b13a5cded18ce291845978bc` (PR 15, `codex/gobi-backend-capabilities-20261031`). The raw 10:08Z provider snapshot and normalized catalog bind 30 runs and 30 jobs to this head: 15 push and 15 pull-request runs; 11 were completed-success and 19 in progress at that snapshot. Raw API snapshot SHA-256 is `e76b0cf05a216648dd464416723c87f8799b523e978eeec79f6da259c972c76b`; normalized catalog SHA-256 is `54e3bcce33ca2d17e8417407d8584b22d5031c7178480ae08364237988ef636a`.

The focused push run `41190743932` completed successfully, job `124506858858` also completed successfully, and its artifact is id `13039351554`. At the latest focused poll, 10:30:01Z, PR run `41190759391` and job `124506904022` were still in progress. The latest poll snapshots are retained separately. No PR artifact was downloaded; the primary push artifact is the only artifact downloaded and retained. The 10:08 snapshot is a point-in-time cohort catalog, not a claim that all 30 runs reached terminal status.

## Primary artifact verification

Provider artifact `gobi-compiled-capabilities-artifacts` is 76,821,513 bytes with provider SHA-256 `40dd8c6fea08e9d7fec280e1a31b448ced0d56a2245834c074cb05bfba4353a8`. The saved ZIP at `compiled-capabilities/ci/2026-10-31/provider/primary-push-run-41190743932-artifact.zip` has the same byte length and digest. ZIP verification checked safe paths and regular file types, CRCs, byte sizes, and SHA-256 values for 1,474 entries (522,549,299 uncompressed file bytes). The read-only extraction and member inventory are beside the ZIP.

The embedded canonical E-BUILD receipt is 548,783 bytes, SHA-256 `4430b2bdc89d496c695465f6477b010f131fbaaf7ae4f005e2b5d8258c16cc4f`. It records `status: failed`, `outcome: mixed_change`, and one failure: `fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain`. The nested fresh lifecycle receipt and canonical compiled-lifecycle receipt both passed with zero failures; the capability check and run are recorded as matched. This identifies an outer gate failure, not an E-BUILD acceptance.

The embedded pre-archive snapshot is 548,010 bytes, SHA-256 `8b5cd0ecf671b9a72be4e333004c98ccf9bf001d33b73dc1912c1d8f79113149`, and explicitly has `archiveStatus: PENDING`, `acceptanceStatus: NOT_FINAL`, and `finalAcceptance: false`. The bound manifest is 34,872 bytes, SHA-256 `f26488f0529b3160c2a590c205879cd0d5ef884e7d4a303201d7196c0f165887`. Its inner tar is 14,970,737 bytes, SHA-256 `ef85a89bc45eefc561d55bd01e45acdd8735379926d5084f597a9edddb4f1cb1`. Verification matched all 187 regular-file members to the manifest by path, size, and SHA-256; validated 61 zero-byte directory entries and unique safe tar paths; and read the gzip stream through its trailer. The copied `execution.json` is byte-identical to the canonical receipt.

The focused Actions job log is preserved at `compiled-capabilities/ci/2026-10-31/provider/logs/primary-run-41190743932-job-124506858858.log`, SHA-256 `d3ddeebe40aa0ed30e2a381b5d38ba108bcfe55d6c7bb9805686696c2e729f35`. The successful Actions conclusion does not override the failed E-BUILD receipt. The verified inner summary lists the retained 7 demo files and 10 matrix files, including raw capability browser capture and lifecycle traces.

## Verification trail and custody notes

The final outer ZIP verifier is `provider/verify_extract_primary.py`; its output is `provider/primary-push-artifact-verification.stdout.log`. The inner check is `provider/verify_inner_archive.py`; its final run is `provider/inner-verification-03.stdout.log` with empty stderr. The checker's first attempt incorrectly compared tar entries to file-only manifest entries and rejected the archive's 61 directory records; that failed log remains at `provider/inner-verification.stderr.log`. Its second attempt listed a nonexistent lifecycle browser-capture filename; that failed log remains at `provider/inner-verification-02.stderr.log`. The verifier was corrected to check file members separately, accept only safe zero-byte directories, and use the actual ten matrix paths. The final verification passed without changing the source artifact.

Two GitHub artifact-download connector calls were issued accidentally while inspecting the first response. The second response's reusable file reference was used for the one local ZIP saved here; no second artifact or PR artifact was saved. The connector may have performed an additional backing fetch, so the duplicate call is disclosed. The saved ZIP's provider digest and exact size match the artifact metadata.

The first normalized 30-run catalog, `provider/current-source-runs-41190743932.json`, was malformed because its normalizer appended a literal backslash-n after JSON. It is preserved unchanged (SHA-256 `b38b399286adcb8f4d31d67e84507bfd8203037d14d081ef2e85310f7258b167`); a corrected snapshot was written to a new path and independently checked against the 31 raw API response hashes.

## Separate local historical supplement

The local-only supplement at `compiled-capabilities/ci/2026-10-31/lanes/custody/postrepair-local-supplement.reassembled.tar.gz` preserves attempts 04/05 and closed E-FIX/XR-FIX review and repair raw outputs. Its 165 members and source hashes are listed in `manifest.reassembled.json` (SHA-256 `c5d044c0805e39411ab7e91a7bf9ff9bb840a7c9fc37ad4a`); the reconstructed tar is 22,409,811 bytes, SHA-256 `b544f76463edb576a3af319a2fc3c7e9ed87874136f31aa2ad584ec07b3d4635`. The 22 chunks were verified individually and by concatenated archive hash; the final verifier confirmed all 165 restored members were unchanged. The archive uses deterministic gzip with mtime zero and sorted repository-relative paths.

The earlier direct output `postrepair-local-supplement.tar.gz` is preserved unchanged but truncated: 22,100,216 bytes, SHA-256 `94c47bbddc28780766a7ac3efb1c29d366dc23867decb85fd4aa86ee684b35e`, with a gzip EOF error. The cause is unknown. An initial local verifier also expected the XR-FIX-ARCHIVE-AUDIT report at the wrong path; that log is preserved, the verifier was corrected to follow the receipt's `reviewReport`, and the second verification passed. This supplement is historical local trace retention, not hosted CI or full acceptance, and does not replace the earlier 127-member pre-repair archive.

## Decision

The primary source-bound artifact and its nested archive are structurally and cryptographically verified, but the canonical E-BUILD result is failed and its pre-archive snapshot is non-final. The current-source PR run was still active at the latest poll. Therefore hosted milestone acceptance is insufficiently evidenced for this cohort. No source edits, Git operations, PR changes, merges, or deployments were made in this custody lane.
