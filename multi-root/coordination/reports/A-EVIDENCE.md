# A-EVIDENCE — Executed evidence and preservation audit

## Scope and result

I checked the published PR #8 head (`bd8455a0656a28d303266e8bc0f39e893769a0bd`), its GitHub Actions records, the recorded integration report, historical source pins, and the current coordination receipts. The preservation and published CI summaries are supported by the records. Review state must be read with its timestamp: the current follow-up review found an additional replay-oracle gap after the published CI run.

## Published CI and integration evidence

- PR #8 is open on the stated head. GitHub returned eight PR-triggered workflows for that commit, all completed with `success`: counter interaction, backend replacement, controlled input, async effects, HTTP effects, keyed editor, renderer conformance, and multi-root sessions.
- Multi-root run `41079481294` is successful and records the PR head SHA. Its job log confirms 34/34 multi-root Node tests, five real-browser demo assertions, 63 replay scripts / 1,896 actions / 1,959 ticks / 11,754 actor observations, zero replay mismatches, and 193/193 native session segments matched.
- The run uploaded artifact `gobi-multi-root-artifacts` (ID `12988914272`, 65,891,207 bytes); the upload log says 1,663 files were included.
- The PR body still contains a dated “Fresh CI status” note saying runs were in progress at inspection. It was accurate then; current run records supersede it with success, so refresh that note if the PR page is meant to show current status.
- `integration-final.json`'s raw report exists at the recorded local path and independently hashes to 350,530,239 bytes and SHA-256 `9a07a712e25ebaee207bfd8589d42bf030394af37157d224cf36a5d9c92009aa`. Its result fields agree with the report's final replay line and the GitHub run log.
- `replay-final.json` records an earlier author run (1,764 actions / 1,827 ticks). `RESULTS.md` correctly labels those counts historical; they are not the final integrated counts.

## Preservation

- `sha256sum -c SHA256SUMS` passes all 24 root entries.
- The seven historical delivery manifests contain exactly 650 pins. I found no missing pinned files and exactly four hash differences, all listed by `integration-final.json` under `renderer-conformance/evidence/delivery-manifest.json`.
- Each listed new hash matches the current file. For all four paths, `git show 47728575f6f9a7989e3e380bc0acf2d4b242180b:<path>` hashes to the pinned old value. The other 646 pins match current files.
- The existing `packet-status.json` still says `pending_root_integration`; it is the earlier packet-local status and is superseded by the later integration report, not evidence against the completed run.

## Receipt history and current follow-up

The acceptance trail distinguishes repair from acceptance: queued-disposal cancellation and raw Go error-frame fixes have later accepted receipts (`XR-RP-RP-E1`, `XR-RH-RH-E4`); XR-E2, XR-E3, XR-E4, and XR-E6 are accepted. XR-E5 requested amendment for lifecycle-history validation and generated-action bounds; RE5 records those repairs.

At the published PR head, the `XR-RE5-RE5` receipt and report do not exist (GitHub returned 404 at that commit), so the published `RESULTS.md` and `integration-final.json` accurately state that the reviewer had not accepted the final RE5 repair. A resumed review during this audit has since written a local `XR-RE5-RE5` **amend** receipt. It demonstrates that a synthetic `renderer-failure` trace can change the candidate's active backend while passing the replay oracle. The passing published CI run predates this review result and therefore does not resolve it.

During the audit, the lead added a backend-transition check and a regression test in the shared working tree. The focused Node suite passed 40/40 under Node v24.22.1, including the new failed-replacement backend test; this was before the next active repair and is only follow-up local evidence, not part of the published PR head or run `41079481294`. A separate direct GoDOM audit has since reported duplicate-root mount interference and seven retained Go callbacks per mount. Repair `R-GODOM` is active under W2. Independent `XR-BACKEND` review is also pending. The published CI and older evidence do not cover either follow-up finding; do not mark the milestone accepted until both repairs have independent review and current integrated evidence.

## Reproduction notes

```sh
sha256sum -c SHA256SUMS
python3 - <<'PY'
import hashlib, json, glob, os
manifests = glob.glob('*/evidence/delivery-manifest.json')
pins = [(f, p, h) for f in manifests
        for p, h in json.load(open(f))['sha256'].items()]
changed = [(f, p, h) for f, p, h in pins
           if hashlib.sha256(open(p, 'rb').read()).hexdigest() != h]
print(len(pins), len(changed))
PY
```
