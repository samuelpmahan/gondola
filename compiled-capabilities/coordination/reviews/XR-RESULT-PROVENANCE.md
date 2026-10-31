# XR-RESULT-PROVENANCE: independent review of the failed cohort

## Decision

**Accepted as a provenance packet.** E-RESULT-PROVENANCE accurately records the 031c462 failed cohort as `insufficient_evidence`, preserves the source binding, and makes no milestone acceptance claim. This review does not establish a milestone pass.

## Local source binding and failed run

I recomputed the publication-binding SHA-256 (`3ef9f4bd…f87a8`) and verified its values against the closed E-RESULT receipt: local commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c` and published commit `a2e1164d68abaaa7d028bdaf6a20bea842a131ae` share tree `d22b75e18c7bea70a743cc79d53461b287c7d045` and direct parent `00da54ad0f5a4006b13a5cded18ce291845978bc`. The receipt also records the hosted PR merge commit and its expected base/source parents. The closed packet's report, receipt, binding, failed execution receipt, command log, nested lifecycle receipt, pre-archive snapshot, verifier result, archive, and manifest match the cited hashes and sizes. The complete checked path/hash inventory is in `XR-RESULT-PROVENANCE/audit.stdout.json`.

The local full execution ran from `09:53:56.051Z` to `10:16:59.067Z`. Its outer receipt is failed at `inherited-static-and-interaction-lifecycle`; the nested lifecycle receipt is passed with no failures. The 16-command ledger entries all returned zero, and the root-observed process exit was also zero. Thus the packet correctly distinguishes a failed outer receipt from the green process exit and identifies the false-negative text predicate and false-green CI risk. The archived run verifies structurally, but `completeAcceptance` is false.

## Hosted CI timestamps and later artifact

The 10:08Z catalog is a bounded historical snapshot: 11 runs were complete and 19 remained in progress. Both focused push run `41190743932` and PR run `41190759391` were in progress, with no artifact available at that retrieval time. The preserved 10:22:29Z poll also shows both still in progress.

A later provider record, retrieved at `10:22:46Z`, binds the same push run to published commit `a2e1164d…` and tree `d22b75e…`; Actions reports the workflow/job completed successfully. I checked its artifact digest against the downloaded ZIP (`40dd8c6f…35a8`, 76,821,513 bytes) and checked the extracted E-BUILD receipt against the immutable member catalog. The embedded full E-BUILD receipt is `failed`, finished at `10:22:34.074Z`, and records the same inherited-lifecycle predicate failure. It claims no process exit code. The hosted artifact is therefore failed-cohort evidence despite the successful Actions conclusion. The PR's later terminal status is not established by the preserved 10:22:29Z poll.

This later artifact updates the earlier packet's pending-CI question; it does not contradict the packet's timestamped 10:08Z account or change the insufficient-evidence result. It reinforces that the hosted green conclusion cannot be used as milestone acceptance.

## Hash coverage and limitation

The independent audit verified 17 author-cited immutable evidence files, including the preserved local command/log/receipt set, source audit output and auditor, archive evidence, and the 10:08 catalog/raw API snapshots. The result and command logs are retained in this review directory.

One cited item is a mutable source file rather than an immutable run artifact: the receipt records historical SHA-256 `c121b32b…7355` for `coordination/acceptance/provenance/audit.mjs`, while the current shared path has since advanced. The HEAD-refresh supplement documents the earlier transition to that `c121…` version; the historical source bytes are not present for reconstruction in this packet. I therefore did not count that source hash among the immutable evidence checks. The associated failed-run JSON remains present and matches its cited SHA-256. This limitation does not affect the failed E-BUILD receipt, archive status, or publication-binding facts.

## Scope

This review is limited to the closed 031c462/a2e1164d failed-cohort packet and the later hosted primary-push artifact. It does not inspect or judge current source repairs, rerun the full suite, or claim current milestone acceptance. No author packet, provider artifact, Git state, or production file was changed.
