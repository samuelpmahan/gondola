# XR-ACCEPT-PROVENANCE

**Decision: accepted within the source and execution provenance scope.** E-ACCEPT-PROVENANCE accurately binds source `60b5aeff3172837ad7831c2b78b210454a3d81a2` and records the verified same-source hosted full archive as authoritative while explicitly rejecting the truncated local archive. This review makes no overall source-milestone completion claim.

## Checks

The reviewed E-ACCEPT-PROVENANCE receipt is 49,664 bytes, SHA-256 `e6218fc639438c2bd58b0500e03058990fb9452ef4092d09aceb36422babbeb4`; its report is 6,493 bytes, SHA-256 `6f602eb57ff05211a70a210ff3471a3f7f60b22949d96f9a9daaf9c603855b1f`. All nine receipt-listed evidence files and the four publication-binding/auditor files matched their recorded byte counts and hashes.

The source record is internally consistent: commit `60b5aeff…`, tree `cc3a129b…`, direct parent `a2e1164d…`, and frozen M0 base `00da54ad…`. The synthetic PR merge `07fc827…` has the same source tree and the stated ordered base/source parents. The PR job log hash matched, and its checkout lines show it fetched and checked out that merge commit. The N1 auditor source was reviewed: it compares the local and published commit/tree/parent facts, checks source pin coverage against the pinned runner and Git blobs, checks frozen-base ancestry, and validates the original M0 `SHA256SUMS` and `EXPECTED.json` bytes. The independent local and hosted audit outputs both passed with 163 source pins and the 24-row M0 manifest (23 tracked files plus the signed generated map).

The local full E-BUILD record says passed, with 17 successful commands, 12 passed stages, and 163 stable source pins; root observed exit code zero. The on-disk archive does not match its receipt binding: the receipt records 14,983,690 bytes and SHA-256 `1a4fd17f…`, while the actual file is 12,845,056 bytes and SHA-256 `91e3d977…`. The complete verifier rejected it, and the cause remains unknown. The 189 loose files match the manifest, but that does not validate the rejected archive container. The 16 MiB witness record identifies a producer-completed-before-observer, non-concurrent observation; it does not reproduce or explain the truncation.

The authoritative hosted push run `41193504188`, job `124514913013`, has a passed full E-BUILD receipt with 17 successful commands, 12 passed stages, and 163 matching source pins. The hosted inner archive is 14,960,460 bytes, SHA-256 `ba178053…`; its 189 members match the manifest and the complete archive verifier returned `verified` with `completeAcceptance: true`. The terminal catalog hash and byte count match; it contains 30 completed-success runs and jobs (15 push, 15 pull request), with every run head on the reviewed source. The primary push and PR records are present and successful.

The report bounds cancellation inference to admitted exact keyed typed descriptors in Update-reachable functions. It records that the local archive is rejected and keeps remaining acceptance gates open. It does not claim UI focus identity preservation. I interpret E-ACCEPT-PROVENANCE's `finalAcceptance` as source/execution provenance acceptance only, consistent with its stated remaining gates; this is not a claim that all work for source `60b5aeff` is complete.

## Disposition

The provenance packet is accurate for its bounded scope. Its acceptance is supported by the independently verified same-source CI archive and source audits; local archive integrity is not accepted. Root scheduling and delivery-custody gates remain separate.
