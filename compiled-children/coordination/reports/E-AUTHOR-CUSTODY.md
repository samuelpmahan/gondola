# E-AUTHOR-CUSTODY (N5): preserve author and review history

**Outcome: `mixed_change`.** I created a verified, read-only archive of the selected pre-repair author/review packet and added a nested Go module boundary so copied proof files do not enter the parent `go ./...` package walk. The archive is evidence custody, not final acceptance.

## Frozen packet

The native state/spec snapshot was copied once at **2026-10-31 12:51:44 UTC** into `compiled-children/evidence-preflight/frozen/native-state/`. It contains ten files: state, spec, spec history, dispatch, gates, capacity, epoch-10 log, native epoch-10 JSON and bundle, plus the timestamp. The archive contains these exact snapshot bytes under `native-state-snapshot/`.

The rawlog selection file [selection-rawlogs-235.json](../../evidence-preflight/selection-rawlogs-235.json) freezes exactly 235 coordination rawlogs through the assigned cutoff of **12:52:30 UTC**. It pins each member path, source byte count, source mtime and SHA-256. Later rawlogs and fresh harness/smoke outputs are excluded. The exact 23 post-cut paths and hashes are listed in `evidence-preflight/rawlogs/excluded-rawlogs-after-cut.json`. The N4 `/tmp` attempt set contains 251 selected files from attempts 01–12. The four closed E-HARNESS capture bundles and the XR-HARNESS mutation capture are present; all 40 gzip members passed `gzip -t`.

The packet contains 17 E-/XR- receipts and 17 matching reports at the cutoff, 20 repair-original/manifest files, the compiler investigation tree (258 files including the build subtree), fixture sources/evidence, oracle sources/evidence/custody, conformance/runtime sources, and only the two requested demo smoke outputs. The complete member inventory is external at [archive-inventory.final.json](../../evidence-preflight/archive-inventory.final.json) and is also represented inside the archive by `CONTENT-INVENTORY.json` and `CUSTODY-CUT.json`.

| Evidence group | Files |
|---|---:|
| Selected coordination rawlogs | 235 |
| E-/XR- receipts / reports | 17 / 17 |
| Preserved repair originals and manifests | 20 |
| Compiler evidence, including build outputs | 258 |
| Fixture source and native evidence | 14 |
| Oracle source, evidence and custody | 13 |
| N4 `/tmp` attempts 01–12 | 251 |
| Native state/spec snapshot | 10 |

## Archive and verification

The final archive is `compiled-children/evidence-preflight/pre-repair-author-review-history.final.tar.gz`, **164,464,000 bytes**, SHA-256 `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`, mode `0444`. Its external inventory is **189,820 bytes**, SHA-256 `e48e7cd189dc1038dc3f964937b07edaa73459d104554b5a2f619877ae960470`; it lists 875 members / 2,206,776,977 uncompressed bytes. The independent streaming consumer verified all 875 members and the archive SHA. The 40 nested gzip members in the packet were also checked successfully.

Preparation used Python 3.12.14, GNU tar 1.35, gzip 1.12 and GNU coreutils `sha256sum` 9.4. Go 1.24.0 was recorded for the module boundary; no Go or Node tests, application commands, reducers, or full regression runs were executed for this custody task.

The module boundary at [go.mod](../../evidence-preflight/go.mod) is 85 bytes, SHA-256 `4fcd5b92e2ac509a4a3b99d776adef5df5d5003c199075d1e43060f55e1c6b90`. It declares `go 1.24` and is outside the large evidence payload. This hash was sent to N1 for the root runner source pins.

## History and limitations

The closed E-ORACLE receipt pins `compiled-children/oracle/audit-native-protocol.mjs` to SHA-256 `7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e`. The superseding custody record states those original bytes are unavailable. The current accepted custody copy is preserved at 7,470 bytes with SHA-256 `f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853`; no restoration or recovery of the unavailable original is claimed.

The stale XR-ORACLE rawlog byte-count ledger is preserved as authored. The superseding custody receipt records three SHA-matching size differences: 1,497 vs 1,958 bytes, 224 vs 238 bytes, and 20 vs 21 bytes. The original ledger was not rewritten. All 15 preserved-source entries in the repair manifests match their recorded preserved byte counts and hashes. The archive inventory verifies archive members against this packet’s inventory; this work does **not** assert that every historical source pin in every original receipt matches the later live source tree.

Two archive attempts exposed evidence-boundary issues. The initial recursive tar pass failed with `file changed as we read it` and exit 1; its log is retained at `evidence-preflight/rawlogs/prepare.stdout.log`. The retry1 archive was independently verified (167,917,858 bytes, SHA-256 `954bad6b31df16f92c8297d64a53029c26159c3aeede1694d53a626a90c4f1a7`) but is superseded: a hidden temporary browser-capture member was added after its internal content inventory, and it contained rawlogs beyond the selected 235-entry cutoff. Retry1 and its matching inventory remain preserved; they are not the final packet.

The retry1 archive’s external inventory identifies the unlisted 45,875,200-byte member `.gobi-children-n4-attempt04.browser.json.K7Jswf` (SHA-256 `4a37a3cb6ec5f94c36773cc54027f0ef821bf9be97cec101a655b0b65e53e36e`). A second hidden temp file `.gobi-children-n4-attempt04.browser.json.K7Jswf.eYJDeh` was observed later in the ignored staging directory (29,884,416 bytes, SHA-256 `5893d3aea92f4513b911cdfd08dcf41018720dd556a85a2be604d5ea172ee296`). Their completion state is unknown. The first remains only in retry1; neither is represented as a completed capture or included in the final archive. Read-only observations are recorded in `evidence-preflight/rawlogs/unlisted-temp-captures.json`.

Five additional archive-named partial files appeared at the top of `evidence-preflight/` during finalization. Their sizes and streaming SHA-256 values were stable during observation; their origin and completion state are unknown. They were not used in either final archive and were left untouched. `evidence-preflight/rawlogs/ambient-partials-readonly.json` records their exact paths and hashes.

The first two corrected-stage extraction attempts stopped on an unlisted temporary member; their logs are retained. The final stage was extracted from the verified retry1 archive using only the internal source inventory and its three generated metadata files, then pruned to the frozen selection. No frozen `archive-root` payload was modified.

## Commands

The final archive was created from the frozen temporary stage using an explicit NUL-delimited member list and normalized tar metadata:

```sh
python3 compiled-children/evidence-preflight/tools/archive_final_stage.py
python3 compiled-children/evidence-preflight/tools/verify_archive.py \
  compiled-children/evidence-preflight/pre-repair-author-review-history.final.tar.gz \
  compiled-children/evidence-preflight/archive-inventory.final.json
```

The creator used `tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix --no-recursion` piped to `gzip -n -1`. The verifier is a separate Python tar/gzip reader that streams and hashes every regular member. Raw command output is retained in `evidence-preflight/rawlogs/archive-final.log`, `verify-final.log`, and `inner-gzip-integrity.log`.
