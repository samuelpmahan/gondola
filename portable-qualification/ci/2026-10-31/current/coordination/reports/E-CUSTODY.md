# E-CUSTODY — reconstructed archive member audit

**Worker:** N6  
**Outcome:** `confirmed_reuse`  
**Source label:** `f7874237b1ceb5dab195a40b12f8df8a3dcc45a0`  
**Scope:** read-only audit of the preserved reconstruction and final producer evidence. No production source, source archive, manifest, damaged bundle, or root-owned receipt was changed by this audit.

## Result

The preserved member-exact reconstruction contains 409 unique regular files. An independent Python tar walk verified every member's byte count and SHA-256 against the original manifest. Its 181 `source/` members also matched Git blobs at the source label above. The reconstruction mapping is a disjoint union of 289 members recovered from the available archive prefix and 120 members recovered from raw attempt files.

The standalone Go verifier was run with an empty environment and `PATH=/nonexistent`. It reported `qualified: true`, 409 members, and 13 passing registry cases. Its 11,265-byte JSON output was byte-identical to the independently recorded Go result. A separate Node 22 consumer also passed all 409 manifest members and reported the same archive and manifest digests.

The producer receipt for `attempt-20261031T194915268Z-5` records all nine stages passing, 13/13 qualification cases, 12 HTTP smoke checks, 181 outer source pins, 87 matched compiler provenance pins, and a 409-member archive inventory. The post-exit damaged archive and producer metadata were preserved and were not rewritten.

| Object | Bytes | SHA-256 | Audit result |
|---|---:|---|---|
| Preserved post-exit archive | 2,097,152 | `25ddcf58b12560eb2ba77ad94cd6f47e794e03a87486f2dd82b54741c83700f0` | Truncated input retained |
| Member-exact reconstructed archive | 2,479,417 | `8f018dd5c3be64ac41e6a2e40d294df2260a26b87e3cfbbcb15757acff8d5968` | 409/409 members match manifest |
| Original producer manifest | 77,846 | `f6a9728be2d46e29c0b20427fcfc5f4177eacfad1504d6b6a191869ad71007c4` | Retained unchanged |
| Go verifier output | 11,265 | `5cf1d9e3cc99bd6ce20ff72defb30676cd4483c6466ce4d036a96a1c73edb8bd` | 13/13 cases qualified |

The producer's originally expected compressed archive was 2,484,521 bytes with SHA-256 `4bc54d8464753d6e39040f977eb42889cfaa958dc27fe440c3a83bef478f999f`. The preserved post-exit copy is 2,097,152 bytes and fails gzip stream reading with `unexpected end of data`. The reconstructed archive is member-byte exact but has a different compressed byte stream and digest. Original compressed bytes were not recovered.

## Pin history and custody

An earlier recorded attempt had 177 source pins and 405 manifest members. The final attempt has 181 source pins and 409 members. The four additions are the historical `compiled-capabilities/ci/2026-10-31/failed-local-031c/{command.log,execution.json,failure.json,report.md}` evidence files. All 177 common pin entries are identical; the final before/after source maps are identical; all 181 paths match Git blobs at the final source label. This is an evidence inventory correction, not a source-code change.

My initial checksum draft used relative paths for three producer files and absolute paths in its subsequent comparison. Their byte counts and digests were the same, but the textual `cmp` failed. The corrected absolute-path `external-inputs-before.sha256` and `external-inputs-after.sha256` match byte-for-byte. This formatting correction is recorded in `rawlogs/E-CUSTODY/boundary-correction.txt`.

## Commands and versions

The audit used Python `3.12.14`, Go `1.24.0 linux/amd64`, Node `v22.23.4`, and the read-only native receipt validator under `/tmp/rebalancer-env/bin/python` (rebalancer `1.0.4`).

```sh
python3 portable-coordination/rawlogs/E-CUSTODY/audit-member-map.py \
  > portable-coordination/rawlogs/E-CUSTODY/member-audit.json

env -i PATH=/nonexistent /tmp/portable-verify-final \
  --archive /tmp/portable-publish/reconstruction/member-exact.tar.gz \
  --manifest /tmp/portable-publish/reconstruction/member-exact.manifest.json \
  --source-commit f7874237b1ceb5dab195a40b12f8df8a3dcc45a0

/tmp/gondola-node22/node_modules/node/bin/node \
  backend-qualification/demo/verify-archive.mjs \
  --archive /tmp/portable-publish/reconstruction/member-exact.tar.gz \
  --manifest /tmp/portable-publish/reconstruction/member-exact.manifest.json \
  --output /tmp/gobi-custody-node-consumer.json \
  --expected-archive-sha256 8f018dd5c3be64ac41e6a2e40d294df2260a26b87e3cfbbcb15757acff8d5968 \
  --expected-manifest-sha256 f6a9728be2d46e29c0b20427fcfc5f4177eacfad1504d6b6a191869ad71007c4
```

The Go CLI was invoked without Node or Go on `PATH`; Node was used only for the separate consumer check. The Go output was compared byte-for-byte with the recorded independent output. The boundary pin files cover the damaged and reconstructed archives, manifest, reconstruction parts and metadata, producer archive/manifest/receipt, source maps, and root acceptance record; before/after hashes match.

## Limits

The archive truncation's cause and actor are unknown. This audit confirms member bytes against the manifest, not recovery of the original compressed stream. The Go verification is a consistency check over captured browser evidence; it does not rerun browser behavior or authenticate the producer. The 13 qualification cases and 12 HTTP checks are reported from the fresh producer receipt; E-CUSTODY did not rerun the browser profile or Milestone 0/counter suite. The verifier was exercised on Linux/amd64 only; Windows/macOS behavior is untested.

## Evidence

Detailed audit results, exact commands, exit codes, versions, hash boundaries, producer receipt copy, manifest copy, and the compact Go/Node consumer outputs are under `portable-coordination/rawlogs/E-CUSTODY/`. The complete 409-member archive was not duplicated into this packet.
