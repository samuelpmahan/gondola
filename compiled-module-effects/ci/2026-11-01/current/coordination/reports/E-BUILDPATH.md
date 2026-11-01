# E-BUILDPATH — output-root comment normalization

**Worker:** N2  
**Outcome:** `valid`  
**Base source version:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Repair

The earlier isolated runner build stopped in `normalizeGeneratedArtifactText` on a compiler-generated comment pointing into `compiled-module-effects/output/attempts/...`. The prior E-BUILD index and XR-HARNESS review remain unchanged.

The build adapter now records an explicit source-location context for each build: repository root, compiler working directory, requested output root, GoScript temp root, and helper bundler comment base. Its Node-only `source-comments.mjs` resolves each generated comment against that context and records the exact ordered comment inventory. It removes only those recorded full comment lines; raw artifact hashes remain intact, and normalized executable bytes still match the PR22 parent pins. `abi-admission.mjs` remains free of Node built-in imports for browser use.

The loader validates the recorded roots as path metadata and reads the artifacts from the selected index directory. A relocated copy loaded successfully while the original external output directory was temporarily absent.

## Actual builds

Each run performed four separate compiler builds: React parent, React child, DOM parent, and DOM child. Both the runner-shaped output path and an external `/tmp` path containing spaces passed actual build and admission.

| Backend | Role | BuildResult outputs | Module ABI file SHA-256 | Compiled module SHA-256 |
|---|---|---:|---|---|
| react | parent | 71 | `5b05d79d1168ef2be997962ee4097c084e83c824da7c3baf97cfa6402b0a72fe` | `85b8e453b7b2262ecea641482e936a6f57868fe287b8983bb98ef35b2584f7c8` |
| react | child | 73 | `52f4eb3ba3fd3541619aee8691bc734b344fa5a92256b80eb1e613080a4644e1` | `cfafb8ae5514f265c5daa7fef0f61938d3b7ec55a66105f7b0c1e48f1272cfe9` |
| dom | parent | 71 | `c71addd8061f1fd70d21634fbdfd9e0cc416ee6f44fbe8ad14fea26e5ea4886c` | `53d09f428a04af8e3275a62e8919b1e11e51f8946250ece50bc7498fb39ded1f` |
| dom | child | 73 | `d768504e1df794231689fa9671e33b811787dae693b0b3d39a9fe7ce8ce940bc` | `c006ff3d4a3fdb55dcf9d9b06ed3c99e5f82bc03f31a3e68aa4c66a517ac9245` |

Primary runner-shaped output: `compiled-module-effects/output/attempts/attempt-20261101T034200000Z-N2-E-BUILDPATH/builds`. Its index is 271,809 bytes, SHA-256 `cedac419a1e83cebb5f693b4378a477cf33bc60be2cea76fb0daa6b98512290a`.

External output: `/tmp/gobi effects external 20261101/builds`. Its index SHA-256 is `349be7d2aef5dcc1275c0cbb0c56514c93c4587a148aa82ee570e7f61ae46433`. A copy at `/tmp/gobi effects relocated 20261101/builds` loaded with the same index hash while the original output path was absent.

For both backends, the parent AppIR and source matched the PR22 pins, and the normalized executable module/helper hashes remained `4f8066ef90393a8b76490a1532bcfc6f59d48bac6d9d7e57f02426e6d28ba1ce` and `9bf860060df1e0463ab1074962dbaf87883d9125acb2e067248dfc6bda04ca3d`. Raw generated module and descriptor hashes are recorded separately in each index because their source-path comment lines reflect that run's declared output root.

Both effect probes admitted the same four ordered request/cancel effects across the two closed descriptors. Each backend's compiled mount-boundary probe matched native Go for all ten cases, including safe maximum, plus one, zero, leading zero, malformed, uint64 boundary/overflow, a non-ASCII digit, and another invalid byte.

## Verification

- Four focused Node 22 tests passed, including runner-style/deeper-checkout and external-root comment policy cases, path/code/string mutation controls, and an actual browser bundle smoke with no `node:path` or `node:fs` imports.
- `loadModuleEffectsBuilds()` accepted the runner-shaped index, the external `/tmp` index, and its relocated copy with the original output absent.
- Node syntax checks passed for `build.mjs`, `module-loader.mjs`, and `source-comments.mjs`.
- Toolchain: Node `v22.23.4`, root Go `go1.24.0`, compiler Go `go1.27.3`, GoScript `v0.6.2`, esbuild `0.28.2`.
- Source inventory: 61 pins. The five changed/added owned build files and all command evidence are indexed under `rawlogs/E-BUILDPATH` (rawlogs index SHA-256 `20d4fe9721a066f1e20dcd21f1bee64fbe06a36d44957783f10cddb4afac2e9d`).

No Git or scheduler changes were made. No files from the E-BUILD or XR-HARNESS packets were changed.
