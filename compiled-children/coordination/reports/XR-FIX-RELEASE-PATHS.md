# XR-FIX-RELEASE-PATHS (N1)

**Decision: `accepted`.** Independently reviewed N2’s README artifact-location correction against the current runner, author report and receipt, preserved originals, and their hash-pinned evidence. The documented paths match the runner; the README differs from its preserved source only in the target paragraph.

## Path verification

`compiled-children/run.mjs` sets the attempt root to `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/`. It creates the canonical report and receipt at `compiled-children/coordination/reports/E-DELIVERY.md` and `compiled-children/coordination/receipts/E-DELIVERY.json`. Logs, React and DOM outputs, harness and oracle captures, and `demo/site/` plus `demo/screenshot.png` are rooted under the attempt. The archive is built as a sibling `<attempt>.tar.gz`; the external manifest is a sibling `<attempt>.archive-manifest.json`. These match the corrected paragraph and the exact runner source.

The preserved README comparison confirms a single replacement of the artifact-location paragraph; all surrounding bytes/text are unchanged. The replacement names the canonical report/receipt separately from the attempt contents and sibling archive files. It says “After a successful run” conditionally and does not claim a run has already passed.

## Evidence review

N2’s repair report and receipt are internally consistent about the bounded documentation-only change and state that no tests or full delivery run were started. The receipt’s current README and runner pins match disk. The preservation manifest hash and all three original files (README, E-RELEASE-DOCS report, E-RELEASE-DOCS receipt) match their recorded byte counts and SHA-256 values. All 14 N2 rawlog pins also match current bytes and hashes, including its initial audit red and the corrected audit, whitespace check, and receipt-validation evidence.

My independent read-only audit passed. It verified the source and artifact pins, original preservation hashes, exact README delta, runner/README path correspondence, and absence of a premature full-run success claim. No tests or full delivery run were performed for this factual documentation review.

## Pinned evidence

- README: `fdc9ace6856e4e5446355dcdcd8734f1b90ebef413e5f01c0a8b3d41a4cf811e`
- Current runner: `deb687ae94cb58d7dab574c973a05d52b3adcb6bf68e70b0c49cdefd77a8eb4f`
- N2 repair report: `13de65fabfd6acf95bf8d345ea08628640e774980eb0eaadb90ee8fdc5345479`
- N2 preservation manifest: `51063dbdca24bec9f276f2bef014d0142760183d23788c8fb14306bb04d5870f`
- Preserved README: `d599a2e235df8d60b453debc6633000dc2bf71309b96fe4caec0274ce6ca84f1`
- Preserved E-RELEASE-DOCS receipt: `72df26c57064975040432d092abc54723030e97ed31bf8056179c00aa9b961db`
- Preserved E-RELEASE-DOCS report: `cc495d55d04d2f2ec608edf33f0c18a37bf2947a21f6db6a87254d45857cabef`

The independent audit output and exit code are recorded in [`../rawlogs/XR-FIX-RELEASE-PATHS`](../rawlogs/XR-FIX-RELEASE-PATHS/). No production source, Git state, scheduler state, or archived original was edited by this review.
