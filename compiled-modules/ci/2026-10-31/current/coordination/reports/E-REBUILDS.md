# E-REBUILDS — post-E-UTF8 compiler artifacts

**Worker:** N2  
**Outcome:** `confirmed_reuse`  
**Scope:** Four fresh GoScript CLI builds for the separate moduleparent/modulechild fixtures, actual emitted bridge/state probes, and ABI-sidecar pair validation. No production source or Git state was changed. This packet does not attest that the entire worktree is clean.

## Builds

All calls used Go `go1.27.3 linux/amd64`, Node `v22.23.4`, `GOTOOLCHAIN=go1.27.3`, `GOFLAGS=-buildvcs=false`, `GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node`, and `GOBI_GO_BIN=/tmp/gondola-go/go/bin/go`. The command was `/tmp/gondola-go/go/bin/go run ./cmd/gobi-build` from `/workspace/scratch/39a56936f173/gondola/compiled-frontend`, with one `gobi.build-request/v1` JSON request per invocation. The exact requests and stdout/stderr/exit records are indexed under `module-coordination/rawlogs/E-REBUILDS/`.

Each build returned exit 0, `ok:true`, one AppIR, and no diagnostics. The declared BuildResult inventory matched the on-disk output inventory byte-for-byte in all four fresh output trees. Parent and child were separate invocations and output directories.

| Build | Manifest SHA-256 | Descriptor file SHA-256 | ABI SHA-256 | Artifact inventory SHA-256 |
|---|---|---|---|---|
| React parent | `d4e7f39173467fd433d409ce53c8b7ab3340b60f353e5a0d47522c1081654d37` | `5d1236bab18c649a8340c71c7a7b7864dded95cbcb05dbb80b8442020f8f7679` | `40d55419983742c17dca568b421e30f70a297c78213f755bc4be30c4579c8364` | `e0f1c14138c10b5a5afa15351f50c540e1d84082eb5ebe5fef8386176a5f30d8` |
| React child | `48cb8aa9d8b529b2a0dbcc3c71276c4870f718efcc3cec9c27ee58c6e5a72a97` | `3f3655c8c1cb985a60a64269800b9dd8cd08676a8bbfa81008d37e9789a7bfc2` | `d0f7ba8eaa4b1b189e70e93003c1a0764e924760efecd8e6c61be2a624605e2f` | `2b13ed642fb719be1a29069c63750b67ee8d261fa17e6c0f3ee6d4292d20b6af` |
| DOM parent | `3a1866ae2b7bd5c816a88c2d4703083ea42c9b4c0954f6f7088395a81ef08389` | `b22e3a669de346632ad3ece17db8800cf52655c2add88719d5b89f28db38100c` | `ee3aa871864f42fb012bccb1a04bd273c953d42a7797656a111415802f6c15c6` | `bf2f1eeeffee24fdc54eb04713ecdecbbed5164e2a4c30c76f53e50dd48c77e9` |
| DOM child | `8b1d8d74a9faa802b08e488b660cc00d2aae2b2d8bd59065900afa8295bdcf7c` | `26375c6ec7a208a93beece44de3ba4d697c41beb87750ae8442c6f79d2423b64` | `e7bc5dfed179b167870d3558f4b1826c6d92b12fbbf1eee58dc96ddbe9061cd0` | `ddd96f802a4affd0888b3149b451ef4b65b959a9c169345ed04011ddd46aa863` |

The manifests point to `app-ir.json`, `gobi-compiled.mjs`, `encoder.mjs`, `components.gen.mjs`, and `module-abi.json` under `apps/moduleparent-462c3bad7b95/` or `apps/modulechild-7f78e25dc32b/`. Parent AppIR has capabilities `view.node`, `numeric.safe-integer`, `numeric.float64`, and bridge roles `Output`/`Receive`; child has those same capabilities and `Input`/`Publication`. Each module ABI descriptor pins exactly four generated artifacts. AppIR files, module files, encoder files, component facades, all descriptor records, and all output file hashes are recorded in `output-integrity.json` and `build-records.json`.

The selected source snapshot has 46 compiler, contract, modulewire, parent, and child Go inputs. Its before and after maps are identical (snapshot SHA-256 `1653781498f4b420a85370c6a8fc60207b60675c9f07f24aff0efef1ff04b6ed`). The complete per-file list, including E-UTF8 compiler files and fixture Go sources, is in `source-pins.json`. This statement applies to those recorded inputs only.

## Emission probes

The direct GoScript probe imports all four actual output modules. For both parent profiles it calls Init, View, Output, Receive, and the generated state encoder. The returned view contains the exact `Step −` string and no mojibake; Output yields `{Step:1,Locked:false,Revision:1}`; Receive encodes the accepted count `2.0` as float64 bits `4000000000000000` at revision 1. For both child profiles it calls Init, Input with `{Step:2,Locked:false,Revision:7}`, Publication, Add, and the state encoder. Input state records step 2/revision 7; Publication returns `{Count:0,Revision:7}`; Add yields counter count 2.0 encoded as `4000000000000000`.

The separate ABI admission probe supplies the actual descriptor bytes, AppIRs, and artifact byte maps to `validateModulePair` for React and DOM. Both pass. The checked helper was `compiled-modules/abi/validate.mjs`, SHA-256 `2a8f0c4cfb2a60c08a71f2596b5e06563b663c1aa60d07384d488a8268bc95b0`.

One initial exploratory probe failed because it passed the entire GoScript Update tuple `(State, []Effect)` to the state encoder. The encoder correctly rejected the tuple as having extra/missing state fields. That red is preserved in `probe-first-red.*`; the corrected probe selects the tuple's State result and passes. Corrected probe exit is 0. Node also emits an experimental `EnvHttpProxyAgent` warning on these probe invocations; it does not affect the results.

## Limits

This verifies the four requested emitted modules, their finite module ABI sidecars, selected direct GoScript bridge calls, and typed state encoding. It is not a browser interaction run or full profile acceptance; those remain separate gates. It makes no claim about arbitrary Go programs or module graphs. No Go source, compiler source, or runner source was changed in this task.
