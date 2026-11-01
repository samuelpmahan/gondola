# XR-BUILD independent review — N1

**Decision: `accepted`.** I reviewed the sealed E-BUILD packet and its exact pinned source/artifacts, then ran a fresh, targeted runtime consumer check against the final build index. No production files were changed.

## Evidence checked

- E-BUILD seal matches the author report SHA-256 `e477b24287bd3fe6d9acf1d576fec787ad8e9737c0d84cabff0f14f5988f6cbe` and receipt SHA-256 `4211eb32486172ab13693319f912b1cce1e4c140a8cf5e6f69cfbfb0b8d720f2`. The sealed owner source `compiled-keyed-modules/build/build.mjs` remains 33,406 bytes with SHA-256 `5e3e448cbfcb9d14b01ee7c786d9c944f0587713db2c97a074e39cffb1e73301`.
- The final build index remains 84,891 bytes with SHA-256 `75df29c02218fab47294454bb0338a720d806901d64377b4cae024fd4f6a2e66`. The index, per-build manifests, BuildResult inventories, and physical output directories agree exactly: 71 React-parent files, 70 React-child files, 71 DOM-parent files, and 70 DOM-child files (282 total). All four builds contain one expected package/backend and four standard module ABI artifact pins: AppIR, module, encoder, and components. The ABI descriptor digests and pair-admission records match for both backends.
- All 62 source pins still match the sealed source inventory, with zero mismatches. The two helper sidecars and descriptors match the index byte/hash pins, backend/package/component identity, module ABI, AppIR, and emitted source identities. Their three exported helper names and frozen signatures match the interface. In both backend AppIRs, `View` calls `Children`. `ReceiveKeyed` and `IsCurrent` remain supplemental exported GoScript functions outside shared AppIR reachability; the descriptor says so explicitly and pins the source/emitted bytes. This is the bounded extension described by the contract, not a claim of general helper ABI admission.
- Existing separate build logs show four independent `go run ./cmd/gobi-build` invocations, one entry package/backend per command; all exited 0. The build-time toolchain recorded Go 1.24.0, compiler Go 1.27.3, Node v22.23.4, GoScript v0.6.2, and esbuild 0.28.2. The author’s probe-01 through probe-07 failures are preserved and summarized in E-BUILD; probe-08 and the final four builds succeeded. The shared worktree was dirty at build time, disclosed by the author, and the 62 pinned source inputs match now.

## Targeted consumer check

Command, run from the repository root:

```sh
GOBI_KEYED_BUILD_INDEX=/workspace/scratch/39a56936f173/gondola/compiled-keyed-modules/build/output/E-BUILD-final/build-index.json /tmp/gondola-node22/node_modules/node/bin/node --test compiled-keyed-modules/runtime/runtime.test.mjs
```

Node v22.23.4 exited 0: 2 passed, 0 failed, 0 skipped. The healthy lifecycle test ran first against the actual loaded DOM and React artifacts. It covered child state/root identity, reorder preservation, remove/remount generation fencing, stale callbacks/publications, backend swap, and renderer-epoch fencing. The second test rejected mutated helper bytes and backend/package/component/moduleABI/AppIR identity pins before renderer creation or Go `Init`. Node emitted its experimental `UNDICI-EHPA` proxy-agent warning on stderr; this did not affect the zero exit result. Exact stdout/stderr are preserved in `rawlogs/XR-BUILD/`.

The independent artifact verifier also exited 0. It checked every output byte/hash against the final index and physical inventory, standard ABI descriptor paths/hashes, helper descriptor/source lineage and signatures, and the AppIR `View -> Children` call edge. Its output lists 282 output inventory rows and reports no failures or source-pin mismatches.

## Scope

This accepts E-BUILD’s four-build, artifact inventory, ABI pair-admission, and source-pinned helper-adapter evidence. It does not claim physical browser/profile acceptance; that remains downstream. Exact verification commands, toolchain, build command records, artifact hashes, and test log hashes are in `rawlogs/XR-BUILD/review-evidence.json`; the independent verifier and its output are alongside it. The final build bytes are reused; I did not rerun the full four-build sequence.
