# Preserved executable inputs and outputs

Expanded build directories stay ignored. These archives preserve actual tested generated modules, metadata, and binaries; adjacent JSON manifests enumerate every member with byte length and SHA-256. Root verified each archived member by reading it back and comparing the original bytes.

- `original-compiler-gate.tar.gz`: 138 files for the original two real CLI builds, including requests/results and both 67-file output directories. SHA-256 `bc043f86742d2bc380a6b3c7220459905ed2f674b7288ccf7892fd89aadc9fc6`.
- `local-executable-probes.tar.gz`: the native contract binary and the three HTTP probe sites. SHA-256 `b211a416fd08f66fc065d82de801adc8a2a185515b426205c1febf3d9af053e5`. The accepted probe is `attempt-20261031T034015684Z`; the other two retain failed smoke checkpoints.
- `repaired-compiler-gate.tar.gz`: 134 output files from fresh React and DOM CLI builds after the selection-validation repair. Requests, results, and inventories remain separately readable in `../repairs/r-compiler/builds/`; these builds are separate from the later full regression run.
- `final-local-methods-only.tar.gz`: the complete passed local `--methods-only` attempt `attempt-20261031T042646625Z` after the producer-layout and final-inventory repairs. It includes every raw member and an executable fresh HTTP demo. Its adjacent JSON manifest binds exact bytes. This is separate from the standalone M0 pass and does not claim a complete inherited local run.

From the repository root, restore the preserved executable demo without recompiling:

```sh
tar -xzf compiled-methods/evidence/builds/local-executable-probes.tar.gz
python3 -m http.server 8000 --bind 127.0.0.1 --directory compiled-methods/evidence/demo/http-probe/attempt-20261031T034015684Z/site
```

Open `http://127.0.0.1:8000/`. This site uses the original immutable compiler-gate module. The accepted HTTP smoke exercised 14 Go actions and three renderer switches on Node22.23.4/Chromium153.0.8010.0, with separately pinned source/output files and no browser errors or WASM use. It is a demo-only probe, not the complete fresh regression result.

To restore the original compiler inputs referenced by the early harness receipts:

```sh
tar -xzf compiled-methods/evidence/builds/original-compiler-gate.tar.gz
```

The archives retain original path strings inside generated metadata. Rebuilding in another directory can produce different raw bundle bytes because compiler staging paths are embedded; the native/direct semantic trace and AppIR comparisons establish the tested behavior. SHA receipts identify the concrete artifacts that were executed, not universal byte identity across unrelated builds or toolchain versions.

To run the final repaired local demo without rebuilding:

```sh
tar -xzf compiled-methods/evidence/builds/final-local-methods-only.tar.gz
python3 -m http.server 8000 --bind 127.0.0.1 --directory compiled-methods/artifacts/attempts/attempt-20261031T042646625Z/http-demo/site
```
