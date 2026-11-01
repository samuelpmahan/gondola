# E-RESTORE author report — N1

**Outcome: `mixed_change`.** Added the standalone standard-library utility `/tmp/keyed-module-publish/restore.py`. It assembles the frozen primary archive from its segments, validates the index/manifest/archive/member/source pins, and stages extraction into a new destination without replacing an existing destination. It also supports the specified audit bundle format and an explicit `--base-url` for missing files.

## Interface and checks

```sh
python3 /tmp/keyed-module-publish/restore.py DEST [--audit] [--base-url URL]
```

Local mode reads the selected index and manifest beside the utility and its selected segments from the corresponding `bundle/` or `audit/` directory (flat local segment files are also accepted). Remote mode downloads only missing selected inputs to a temporary cache. It tries a flat segment URL first, then the matching `bundle/` or `audit/` subdirectory. The caller supplies the raw Git directory URL; use a URL pinned to the immutable assets commit. The utility does not choose a branch or URL.

The primary archive uses `gobi.keyed-module-segments/v1` plus `gobi.keyed-modules-archive-manifest/v1`. Audit mode uses the same segmented-index schema and `gobi.keyed-module-audit-members/v1` with its `members` rows. Both paths reject duplicate JSON keys, invalid index shapes, malformed or non-sequential segment names, linked/non-regular local inputs, segment inventory extras, unsafe/noncanonical archive paths, duplicate members, links and special tar entries, extra or missing members, size/hash mismatches, and truncated gzip/tar data. Extraction is streamed into a private sibling staging directory, and commit uses Linux `renameat2(RENAME_NOREPLACE)` when available. Member file modes from the tar are preserved; audit mode also checks an optional member-mode pin. Existing destinations are refused without modification.

Resource bounds are 8 MiB per metadata file, 2 GiB per archive, 64 MiB per segment, 2,048 segments, 100,000 members, and 8 GiB expanded size. Hashes establish byte consistency only; they do not authenticate the publisher.

## Primary restoration

The frozen source commit is `f4c8f70199a8ca896c13e225a85901abe658d0de`. The pinned archive is 25,697,770 bytes with SHA-256 `1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7`, split across 25 files. `bundle-parts.json` is SHA-256 `a09b6e65d33e9601dff85d7fb4a560c4b682f6e51c76183e961f07c2e8c96dce`; `bundle.manifest.json` is 140,670 bytes with SHA-256 `0f8f5b15c36442d54412ad6480f4dbbb475b4cabec45ef800a01498a312f064b`.

The command `python3 /tmp/keyed-module-publish/restore.py /tmp/keyed-module-publish/restored-primary-verified` exited 0 under Python 3.12.14 on Linux x86_64. The restored tree has 600 members and 372,962,548 expanded bytes; all 157 source pins match `source/<path>` members and their extracted content. The output includes `source/go.mod`, the native CLI, prebuilt `demo/site`, and the separately compiled build artifacts.

From the restored `source/` directory, the offline command below exited 0 with `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off`:

```sh
/tmp/gondola-go/go/bin/go run ./cmd/keyed-module-native --script fixtures/compiled/keyedmoduleparent/scenario.json
```

Its 18-event JSON output is equivalent to the preserved E-RUN `native-literal.json` capture (native stdout SHA-256 `40af1b1ce072f7f702e613c4f292174d8d76b95477842ecba747c0f19a3abd9e`). A Python HTTP server served `demo/site/index.html`, `demo-entry.mjs`, `demo.bundle.mjs`, and `demo-build.json`; all four returned HTTP 200 and their bytes match the archive manifest pins. This is an asset-serving smoke check, not a browser run.

## Remote and audit checks

The synthetic audit test used a loopback HTTP server and the specified segmented-index/audit-members schemas. It passed one healthy case that fetched the missing index, member manifest, and both parts. Ten controls were rejected with exit code 2: unsafe member path, unsafe segment name, duplicate member, link, extra member, missing member, missing remote part, part hash mismatch, truncated gzip/tar, and an existing destination. The existing destination sentinel remained unchanged and rejected restores left no staging directory.

Four earlier synthetic probes are preserved in the raw logs. The first two were self-test assertion/fixture-shape errors. The next probes exposed that stopping tar iteration at the end markers could miss a truncated gzip trailer. The final implementation drains a `gzip.GzipFile` to EOF so the CRC/length trailer is validated; the final truncation control now fails as expected. The primary archive and 11-case synthetic audit run both pass with the final script hash.

The restore and no-replace path were exercised on Linux 6.18.57 x86_64 with Python 3.12.14. The `renameat2` no-replace path was available and used. macOS and Windows were not tested; on systems without `renameat2`, the portable fallback is a pre-check followed by `os.rename`, and its concurrent-race behavior was not tested. No actual audit archive was available at this point; the synthetic audit shape matches the coordinated format, and the post-pack audit restore remains for root’s readback. No repository source files or frozen bundle metadata were changed.

Exact commands, versions, source pins, segment hashes, test output hashes, and preserved probes are recorded under `rawlogs/E-RESTORE/`.
