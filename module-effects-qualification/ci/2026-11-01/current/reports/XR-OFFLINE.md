# XR-OFFLINE — independent review of E-OFFLINE

**Reviewer:** N1  
**Decision:** `accepted`

## Review summary

The sealed E-OFFLINE report, receipt, rawlog index, source inventory, and seal hashes verify. The report, receipt, and rawlog index in the working coordinator match their sealed copies. I accept the prior-input execution evidence with the post-seal metadata-recovery qualification below.

The root's E-OFFLINE post-seal addendum documents the late invalid-CLI control and records recovery of `commands.txt`, `byte-counts.txt`, and `sha256sums.txt`. I independently verified that `sha256sums.txt` is restored to the original seal-pinned 1,133-byte file with SHA-256 `a201c2d9a38409755c0144a3af1045c17131b9cd500fb10519cab1983928b929`; every entry in the sealed rawlog index now passes. The restored checksum list includes a historical E-OFFLINE report digest (`11d72fa...`), which differs from the final canonical report hash (`61966352...`). The addendum identifies that digest as a historical report revision. Running the list against current files therefore reports only the historical report line as mismatched; the canonical report itself matches the original seal. The earlier `sealed-rawindex-recheck.*` and `seal-integrity.stdout` files preserve checks made during restoration; the final passing result is `seal-raw-index.*`. No E-OFFLINE file was changed by this reviewer.

## Source and binary

The sealed source-publication record identifies verifier commit `4338255bf8800d521b7f932fb530fe2cedebbf72`, tree `146daa2199e0c2ee679c622b6c765a2c0ff5b356`, equal API/staged/fetched trees, and a clean published snapshot. The original verifier status evidence recorded an empty porcelain status. The binary is an executable ELF, mode `0755`, size 5,068,138 bytes, SHA-256 `91ba287c7333c5291bd81ad0cc8f2586639bc19b8570c9562744eaeecf29b1ee`. Go 1.24.0 build information names the verifier revision and `vcs.modified=false`; all remaining build fields match the sealed build-info output. The saved closure contains 35 repository Go files in 14 local packages, and every source hash matches the current checkout.

At review time the checkout has two untracked E-FRESH report/receipt files outside the verifier Go source closure. I do not treat the checkout as currently clean; the published clean status is the historical status captured during E-OFFLINE's build and run. The E-OFFLINE sealed source inventory is empty, so this review relies on the pinned publication metadata, recorded build-time status, embedded Go build information, and the separately indexed source-closure hashes. These facts do not authenticate the binary or Git history.

## Independent input and output checks

The directory input is the actual prior Git-readback directory, with the expected root entries and saved source-closure identity: producer commit `e0933465725e470dc610e3f81b4bbee95538c1d0`, clean input, 202 source pins, no pin mismatches. I independently reran the published binary with `PATH=/nonexistent`; it exited 0, wrote no stderr, and produced stdout byte-identical to the saved 123,355-byte directory report (SHA-256 `03fdd5ee715dd225554e05ea95dc955907312a4ef70676afc834285a9e07fae8`).

Both saved Go CLI reports identify the same producer commit and source identity and report 4 scenarios, 20 profiles, 178 events, 182 states, 58 effects, 116 transport events, and ABI status `passed` with 4 builds and 2 pairs. The archive report additionally records 639 members and 8,667,568 bytes. The nine published bundle parts each pass their recorded SHA-256 checks. Their reconstructed 8,667,568-byte aggregate is byte-identical to the saved archive, SHA-256 `7eb9f28fc6504bf43207436dfc916549bb28e34059cee69bc138376be7940087`; the manifest hash is `457073a81f1c93ba0edfe51b06667bb39f9baed95fd32ad3a9c630f9f476b1b9`. The canonical directory/archive reports compare equal after removing only archive metadata. The saved invalid-argument control exits 2 with zero stdout and a usage diagnostic on stderr.

## Limits

This review covers the published verifier against the prior PR23 readback directory and archive only. It makes no fresh-profile claim. Passing results do not authenticate the binary or Git history, prove a compiler invocation, or qualify arbitrary module graphs. The Go CLI made the acceptance decisions; the Python standard-library helper only compared the two Go JSON reports. No production files or Git state were changed by this review.

## Evidence

- Exact verification commands and review harness: `rawlogs/XR-OFFLINE/commands.txt`, `rawlogs/XR-OFFLINE/run-review-checks.sh`
- Sealed metadata and rawlog integrity results: `rawlogs/XR-OFFLINE/seal-hashes.stdout`, `packet-copies.status`, `seal-raw-index.stdout`, `seal-raw-index.status`, `custody-recovery-note.txt`, `custody-checkpoint.stdout`
- Build/source facts: `rawlogs/XR-OFFLINE/verifier-identity.stdout`, `binary-metadata.stdout`, `buildinfo-equivalence.status`, `source-closure.stdout`
- Actual readback rerun: `rawlogs/XR-OFFLINE/readback-rerun.stdout.json`, `readback-rerun.exit-code`, `readback-rerun.stderr.txt`, `readback-rerun.sha256`, `readback-rerun.bytes`
- Archive reconstruction and report comparison: `rawlogs/XR-OFFLINE/publication-parts.stdout`, `reconstructed-archive.stdout`, `report-comparison-recheck.stdout`
- Summaries and negative CLI control: `rawlogs/XR-OFFLINE/directory-summary.stdout`, `archive-summary.stdout`, `invalid-cli-control.stdout`
