# XR-COMPILER independent review

**Decision:** `accepted`  
**Reviewed packet:** E-COMPILER (N2), confirmed reuse

## Findings

The accepted React and DOM CLI builds are bound to the frozen fixture source. Both requests use the workspace `sourceRoot` and package `github.com/samuelpmahan/gondola/fixtures/compiled/children`; the final captured source hashes match the current `app.go` and `view.go` hashes. The final before/after checkpoints around both accepted builds and the encoder probes retain those same hashes.

The captured commands used Go 1.27.3 and Node 22.23.4. React `react-repeat` and DOM `dom-attempt3` each exited 0, returned `ok=true`, listed 67 outputs, and had no diagnostics. I independently checked each output JSON inventory against the actual files: 67 listed and 67 present per backend, with every byte count and SHA-256 matching and no extra files. React stdout is 27,651 bytes (SHA-256 `5953b0f6f49bbc9249bc674de57f8faf4efb2547667a195125bdaad7814ad6d8`); DOM stdout is 27,651 bytes (SHA-256 `36f22cb4b7da714a2b962b92bad4789eac7425fbcf5b15d7f3ebd0bb4f44dc58`).

The first final-source React invocation, `react-attempt3`, exited 0 but captured **zero stdout bytes**. It is not evidence of a completed build. The fresh `react-repeat` invocation captured the complete 67-output result and is the accepted React build. The earlier red attempts retain real analyzer diagnostics; they show fixture source adaptations within the existing supported profile rather than compiler changes.

AppIR, encoder, components, and `react-map.gen.mjs` match across backends. AppIR identifies `Children` as a slice of exported `ChildState` structs and the nested `counter.State`; `uint64` fields remain BigInt-backed. The raw React/DOM compiled modules differ in random GoScript/staging path comments, and the manifests differ only in their expected backend field. Replacing the random path identifiers while preserving relative prefixes gives byte-identical normalized module bundles. The stored build audit reports a different normalized byte count (528,301); this reviewer’s narrower PID-only normalization produced 528,713 bytes per backend. Both procedures establish equality, and all unnormalized output hashes and sizes independently match the CLI inventories.

I reran `encoder-probe.mjs` with Node 22 against each actual generated module and its actual generated encoder. Both runs exited 0 with empty stderr and produced 14 snapshots byte-for-byte equal to the accepted probe JSON. The React and DOM encoded states and actual slice descriptors match across all 14 snapshots. The probe observed Init’s dense Array and the grown GoSlice wrapper, including capacity and spare-capacity descriptors. The initial probe failure assumed Init’s `Children` was already a GoSlice; that failure is retained, and the corrected probe handles both representations.

No production compiler repair was needed. E-COMPILER records an empty `production_paths_changed` list, and read-only `git status` and `git diff` checks over `compiled-frontend/` and `compilercontract/` returned no changes.

## Evidence limits and custody

This review confirms the specific frozen GoScript v0.6.2 build and the 14 actual-state encoder observations. It does not establish arbitrary Go slice support or native/direct/browser behavioral parity; those claims are outside E-COMPILER’s lane.

Two preliminary reviewer audit logs preserve local helper mistakes (an incorrect canonical-copy path, then an assumption that the AppIR type table was an object). The completed independent audit is in `XR-COMPILER-independent-audit-confirm.log`. The initial unsuppressed fresh probe logs also preserve Node’s experimental proxy warning; clean reruns suppressed warnings only and matched the accepted stdout hashes. No accepted source, compiler evidence, or native state was overwritten.

## Pinned packet

- E-COMPILER report SHA-256: `28e271c19584ef89ba5ff1f1cc64f54e9f6e842d7800b02c16ceb8f7f796a67d` (6,656 bytes); canonical report copy is byte-identical.
- E-COMPILER receipt SHA-256: `e9919644a59b88b9684f2f7c1dad1f4d1120d64d24e8dccc79bf86b20bc66371` (10,435 bytes); canonical receipt copy is byte-identical.
- Encoder probe SHA-256: `0d0e88f4ca58dca917838bfe133d07167de1cef47155f539805865b92c629de6` (7,026 bytes).
- Build output audit SHA-256: `9ec1bbcc23ef59a380d2dd55c6c4e6793708f0ca48d2b17cd27a4f39d0e6e235` (12,306 bytes).
