# E-CLI — native module qualification verifier and CLI

**Worker:** N5  
**Outcome:** `mixed_change`

## Implementation

Added `modulequalification.VerifyDirectory(root)` and the standalone `cmd/module-qualify` command. Directory mode verifies source identity, composes N3's ABI checker with N1's Go capture checker, and hashes the actual profile files before and after those checks. It rejects unsafe file entries and enforces the archive-aligned limits of 4,096 files, 8,192 tree entries, 32 MiB per file, and 128 MiB total. Archive mode verifies and extracts through N2's `VerifyArchive` into a private temporary parent, runs the same directory checks, verifies that the manifest commit matches the profile identity, removes the temporary directory, then emits the report.

The source identity check strictly decodes the run context, before/after Git closure, execution snapshot, and both source pin manifests. It requires the manifests to agree and hashes each embedded `source/<path>` file against its recorded size and SHA-256. The tested profile contained 147 source pins (1,321,637 bytes); all matched. The complete directory inventory contained 529 files. The commit is checked for 40-character hex format and internal consistency; the report does not claim that this authenticates Git history or proves the verifier binary was built from those embedded source bytes.

The CLI accepts exactly `--directory ROOT` or `--archive TAR --manifest MANIFEST`. It emits one JSON report on success; failures return nonzero, write an error to stderr, and do not emit partial JSON. It is Go-only and does not launch Node or Chromium. The capture field comes from N1's independent Go checker; its `mutationControls: 0` remains zero. The separate Go test suite executed N4's ten real-capture mutation controls; producer-captured mutation metadata is not treated as those test results.

## Verification

On the final stable source checkpoint, `go test -count=1 ./modulequalification` passed (24.511 s) and `go test -count=1 ./cmd/module-qualify` passed. The module package run included N1 capture, N2 archive/strict JSON, N3 ABI, N4's ten mutation-control cases, and N5 source identity/inventory tests.

Both CLI modes passed against the actual 7bd profile. Directory mode verified `/tmp/gobi-published-restore-check`. Archive mode verified `compiled-modules/output/attempts/attempt-20261031T213332911Z-35.tar.gz` with its manifest, extracted it, and ran the same checks. Both reports agreed on all 529 file hashes, source identity, capture summary, ABI result, and scope. The archive report additionally recorded 529 members, 6,373,581 compressed bytes, and the matching source commit.

The final reports contain 12 profiles, 144 events, 99 Go updates, seeds 20261031–20261033, and zero Go-executed mutation controls in the capture report. ABI checks accepted four builds and two React/DOM parent-child pairs. No browser was launched by the verifier.

Several earlier checks were run while N1's shared capture implementation was being completed. Their compile errors and temporary capture mismatches are preserved in rawlogs; they are not presented as final-code failures. The final full package run and both final CLI modes passed after N1 reported the healthy capture replay stable.

## Reviewed source and output identities

- Final N5 verifier source `modulequalification/verify.go`: `9364afe971892bf4866d2ab1576b5704db1fede2f89de63211e06c1a385e81ba`
- Final N5 verifier tests `modulequalification/verify_test.go`: `3397127791dd6768b2755fb195e0cecf4931040a807f07556481700416aac0ba`
- Final CLI source `cmd/module-qualify/main.go`: `9c38a3eb1786a5c0125a8a144373fa99d8490d435268c84741e06effb9e743ea`
- Final CLI tests `cmd/module-qualify/main_test.go`: `c0d745255b59272faefda017531a6ab6bd5910be75bf466381586a3d0fd2e6f9`
- Directory report: 102,929 bytes, `6b87484cf1b954525b0005ce93de6176ca13ea831e8a86da0655de665a16dfc8`
- Archive report: 103,054 bytes, `37182053941c25863b91a65f94821f9550b1fd10810c75d9cf941d0327a6b4a5`
- Archive input: `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c`

Tested N1/N2/N3 dependency hashes and all commands, outputs, and earlier failures are recorded under `native-module-coordination/rawlogs/E-CLI/`. The full repository pipeline, fresh producer run, CI, verifier-binary reproducibility, and Git authenticity were not established by this packet.
