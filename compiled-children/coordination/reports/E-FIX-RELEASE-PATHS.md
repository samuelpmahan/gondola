# E-FIX-RELEASE-PATHS (N2)

**Outcome: `mixed_change`.** Corrected only the artifact-location paragraph in `compiled-children/README.md`. The previous text placed the canonical report, receipt, and archive beneath the attempt directory; the runner writes the canonical report and receipt under `compiled-children/coordination/` and writes the archive plus external manifest beside the attempt directory.

The updated paragraph now identifies these locations from `compiled-children/run.mjs`:

- The attempt directory is `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/`. Logs, raw captures, React and DOM builds, and demo files including `demo/site/` and `demo/screenshot.png` are inside it.
- The canonical report and receipt are `compiled-children/coordination/reports/E-DELIVERY.md` and `compiled-children/coordination/receipts/E-DELIVERY.json`.
- The byte-checked tarball and external manifest are sibling paths: `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>.tar.gz` and `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>.archive-manifest.json`.

The read-only audit verifies the runner’s path construction and confirms the README differs from its preserved original only at that paragraph. All three preserved originals match their manifest. `git diff --check -- compiled-children/README.md` passes. No tests or full delivery run were started.

See the receipt for exact source and evidence hashes. No other production or documentation files were changed for this repair.
