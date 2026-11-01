# E-FINALAUDIT — bounded final custody recovery

**Worker:** N1  
**Outcome:** `insufficient_evidence`

## Result

The only item root's final-pack audit reported missing is the derived metadata file `rawlogs/XR-ORDER/review-packet.sha256`, expected size 470 bytes and SHA-256 `d8e41fcbdfe6b2af4582bdefbe08e2ac2bdadf8ac2c257ebf0a7263480c91c8b`. Root reported that the other 825 indexed rawlog entries, 115 sealed source copies, and solver checks validate. No runtime, browser, compiler, or production-directory checks were rerun for this task.

I tried two deterministic reconstructions. The post-seal report/receipt/index hashes observed before root restored canonical files produce a 470-byte checksum list with SHA-256 `c1002b278144aab37f6c88099d8b15e95c40f3c60aa19ba59022aabe933d3a63`. After root restored the canonical report, receipt, and index from their seal copies, checksumming those three current files produces 470 bytes with SHA-256 `05713c3604cb417595921b194af3c80d8ba058a9645d7b07317eac8a575116e6`. The latter is also the candidate formed from the three sealed hashes and their canonical absolute paths. Neither matches the required original digest.

The candidates and the pre-restore hashes are preserved under `rawlogs/E-FINALAUDIT/`. The missing file remains absent; I did not restore a candidate to `rawlogs/XR-ORDER/`. Canonical XR-ORDER report, receipt, and index now match their seal copies. Root reports that post-seal versions are preserved additively. Since the missing artifact is derived packet-checksum metadata, this result leaves the runtime, source, and command traces intact; it only prevents claiming exhaustive recovery of that checksum file.

## Coordinator and source counts

At the captured coordinator-state snapshot there were 30 native jobs: 14 extract jobs complete and E-FINALAUDIT running; 12 reviews complete, XR-SOURCE and XR-FRESH running, and XR-FINALAUDIT pending. All six original extraction jobs and their six initial independent reviews were complete.

The published Gondola source is commit `4338255bf8800d521b7f932fb530fe2cedebbf72`, tree `146daa2199e0c2ee679c622b6c765a2c0ff5b356`. The checkout contains 236 tracked Go files. The separately reported E-SOURCE closure count is 142 package records, 62 Go closure files, and 72 bound paths. E-FRESH separately reports 236 pinned source paths totaling 2,700,650 bytes, including 73 test source files. These counts have different scopes and are not interchangeable.

## Limits and follow-up

The exact original checksum-list bytes were not recovered from author tool history or the known sealed/current packet versions. No replacement is claimed. Root should retain the historical missing-file qualification in the final publication notes and avoid an exhaustive authoring-metadata claim. The coordinator's final independent review remains `XR-FINALAUDIT`.

## Evidence

- Candidate generation and exact byte/hash results: `rawlogs/E-FINALAUDIT/reconstruct-candidates.py`, `candidate-verification.stdout`, `postseal-packet-hashes.txt`, and the three `review-packet.*.candidate` files.
- Seal restoration check and target absence: `xr-order-canonical-check.*`, `missing-target-status.*`.
- Native job and source counts: `native-jobs-snapshot.json`, `root-source-id.txt`, `tracked-go-file-count.txt`, and `root-audit-context.txt`.
- Exact commands and raw evidence index: `rawlogs/E-FINALAUDIT/commands.txt`, `rawlogs/E-FINALAUDIT/index.json`.
