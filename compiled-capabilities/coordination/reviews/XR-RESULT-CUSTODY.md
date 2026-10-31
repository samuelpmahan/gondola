# XR-RESULT-CUSTODY: independent review of the hosted failed cohort

## Decision

**Accepted as a custody and provenance packet.** The retained provider artifact and its embedded archive are bound to the stated a2e1164 source, and the canonical E-BUILD receipt remains failed. This review does not establish milestone acceptance.

## Provider artifact and source binding

The provider metadata binds push run `41190743932`, job `124506858858`, and artifact `13039351554` to commit `a2e1164d68abaaa7d028bdaf6a20bea842a131ae` and tree `d22b75e18c7bea70a743cc79d53461b287c7d045`. The retained ZIP is exactly 76,821,513 bytes with SHA-256 `40dd8c6fea08e9d7fec280e1a31b448ced0d56a2245834c074cb05bfba4353a`, matching the provider metadata and E-RESULT-CUSTODY receipt. The 1,474-entry member catalog and cited provider logs, metadata, raw catalog files, and verification outputs match their recorded hashes.

I independently matched the canonical E-BUILD receipt's bytes across the ZIP member, extracted file, and member catalog. The canonical receipt is 548,783 bytes with SHA-256 `4430b2bdc89d496c695465f6477b010f131fbaaf7ae4f005e2b5d8258c16cc4f` and says `status: failed`, `outcome: mixed_change`. Its single failed stage is `inherited-static-and-interaction-lifecycle`, with error `fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain`. The embedded inherited lifecycle and canonical compiled-lifecycle receipts both passed; this does not change the enclosing E-BUILD failure.

## Embedded archive and receipt state

The 548,010-byte pre-archive snapshot matches SHA-256 `8b5cd0ecf671b9a72be4e333004c98ccf9bf001d33b73dc1912c1d8f79113149` and explicitly records `archiveStatus: PENDING`, `acceptanceStatus: NOT_FINAL`, and `finalAcceptance: false`. The 34,872-byte manifest matches SHA-256 `f26488f0529b3160c2a590c205879cd0d5ef884e7d4a303201d7196c0f165887`.

I read the 14,970,737-byte inner tar.gz through its gzip trailer and independently compared its 187 regular files by path, byte count, and SHA-256 to the manifest. The 61 directory entries were zero-byte directories with safe relative paths. The attempt's `execution.json` is byte-identical to the canonical E-BUILD receipt. The audit also confirmed the cited verifier and preserved verifier-failure log hashes; the closed packet distinguishes those two earlier checker failures from its final passing inner-archive verification.

## Hosted status and time bounds

The provider metadata reports both the GitHub Actions workflow and job completed successfully. The canonical receipt inside that same source-bound artifact is failed, so the green Actions conclusion cannot be treated as milestone acceptance. The author's recorded 10:08Z catalog is correctly time-bounded: it contains 30 runs/jobs, 15 push and 15 pull-request runs, with 11 completed and 19 in progress. The latest preserved PR poll is 10:30:01Z and still shows the PR run and job in progress; no PR artifact or job log is claimed.

## Scope

The cited report, receipt, 22 referenced immutable files, provider ZIP digest, canonical receipt, inner manifest/archive, and pre-archive state were checked. This review is limited to the closed a2e1164 failed cohort. The separately labeled local historical supplement and its already disclosed output anomaly were not re-audited here. No provider download, author-file rewrite, source change, Git operation, PR operation, or acceptance claim was made.
