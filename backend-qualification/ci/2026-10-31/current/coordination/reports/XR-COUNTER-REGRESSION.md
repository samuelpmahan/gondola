# XR-COUNTER-REGRESSION (N5): independent check of the original counter run

**Decision: `accepted`.** The preserved E-COUNTER-REGRESSION packet matches its trace and source evidence. I found no discrepancy in the bounded review.

## What I checked

The N4 report and receipt were copied into this coordination tree byte for byte, as recorded in `counter-packet-byte-mirror.json`. The original files remain in `interaction/coordination/`. Their hashes are:

- Report: `b286990004cce260ff2748fe69310aae29a9d07c0d89e4ede4f16728738a0fbf` (3,109 bytes)
- Receipt: `24f115921b1f493c741d4f56d19c102dad938e7c226ce3778d5a5bc40f17203b` (6,657 bytes)

I independently parsed `interaction/build/interaction-traces-seed-20261030.json` and recomputed its SHA-256, browser mismatch count, scenario/action/tick totals, and native comparison totals. The trace is 49,493,116 bytes, SHA-256 `4e22212a1c8b66c1cc768cf2f01b5ea0d45c994221f8b634a183fecab7194fb5`. It has 100 generated scenarios and 7 fixed scenarios, 4,366 actions, 4,473 initial/action ticks, zero browser mismatches, and 107/107 native comparisons matched with exit code 0. The maximum generated scenario length is 80 actions.

The before and after manifests each list 23 Go, interaction, test, build-script, and module inputs. Their SHA-256 values match (`4962a8da806ad2e74a5dd4d186d88860084d36735b97361d4769fdf896eaf420`), and the diff is empty. I also compared each current file’s bytes with its blob in the report’s stated base commit, `5662efcd7feb7920e4690d38cc76a297fed69d5a`; all 23 match. This is a bounded input-content check and does not claim an attestation of the worktree’s current HEAD.

The captured pipeline stdout shows 8/8 Node tests passing and the 107-script parity result. I rechecked the command, exit code, stdout, stderr, environment record, metrics, and all four build-output sizes and hashes against the N4 receipt. The executable versions currently resolve to Go `1.24.0`, Node `22.23.4`, npm `11.9.0`, Chromium `153.0.8010.0`, and React `19.3.1`. The recorded `interaction/node_modules` symlink points to the children archive worktree.

The independent read-only verifier and its result are in `coordination/rawlogs/XR-COUNTER-REGRESSION/`. The result records the recomputed counts, mirror checks, all 23 base-blob comparisons, and artifact hashes.

## Scope boundary

This confirms the original Go WebAssembly counter versus React/Chromium parity run represented by the preserved trace. It does not certify the newer no-WASM backend qualification, rerun the browser pipeline, claim the current worktree HEAD, or assert full CI or final candidate acceptance. No application source, Git state, or scheduler state was changed by this review.
