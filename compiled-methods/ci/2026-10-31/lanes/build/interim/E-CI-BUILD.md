# E-CI-BUILD interim preflight

**Outcome: `insufficient_evidence`.** The local and historical artifact preflight passed, but the fresh current-head CI artifact has not yet been supplied. This packet does not accept CI for the current source.

## Current source and CI gate

- Source commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`, parent `8ed5b66a223de1992756516f8d3895c6e096f842`.
- Primary push run `41169518187` and pull-request run `41169522175`.
- Latest retained workflow snapshot: `2026-10-31T04:51:13.931Z` (`d923def0f8d79cd3c201f781e6dc343c45cd02326b1992452f8112931d2c8a52`). Both target `compiled-methods` jobs remain `in_progress` in that snapshot.
- The source publication records the producer change as `compiled-methods/run.mjs` provenance layout and final inventory roots. The source diff has no changes under `compiled-frontend`, `cmd/compiled-native`, `compilercontract`, `gobi`, `counter`, or `fixtures/compiled/methods`; `run.mjs` is 15 insertions / 8 deletions. It is not an application/analyzer/emitter code change.

## Historical and local artifact preflight

The historical 8ed provider ZIP is retained at `compiled-methods/ci/2026-10-31/initial-source8ed/original.zip`: 10841763 bytes, SHA-256 `56ad778c1e76803734ae9b38620ae0afe57220273be4143ecc59a48525d3424a`. Its three retained chunks reconstruct that exact ZIP. ZIP CRC validation passes, and each of its 957 members matches the retained extracted copy and recorded inventory. This run failed the methods provenance-path gate and is retained for history only.

The local METHODS-ONLY tar is `3478178` bytes, SHA-256 `e9ee3f8917bb65e4956ef4fcc620a627c5decdad9d6ffc4b2cf9a1252d4e4b8f`; all 189 archive members match the manifest. It records a matched local methods-only run with Node `v22.23.4`, root/native `go version go1.24.0 linux/amd64`, compiler `go version go1.27.3 linux/amd64`, and Chromium `153.0.8010.0`. The archive does not represent a full inherited local run and is not a substitute for the current-head CI artifact.

Both React and DOM requests target `github.com/samuelpmahan/gondola/fixtures/compiled/methods`. Each BuildResult reports one AppIR, 67 outputs, no diagnostics, and all output paths/bytes/SHA-256 values match the archive. Each manifest records its requested `backend` and uses the same module, AppIR, encoder, component, forwarder and role-binding paths.

React and DOM AppIR bytes are identical. The emitted module contains 15 symbols: 3 role functions, 10 `State` value-receiver methods, and 2 `counter` dependency symbols. Receiver-first signatures and the call graph match `compiled-methods/FIXTURE.md`; Update forwards `(State, []gobi.Effect)`. The generated Go facade directly returns `methods.Init`, `methods.Update`, and `methods.View` with typed State/Message/Effect/Node signatures; no JavaScript reducer is inserted. The encoder, components, emitted TypeScript, forwarder source files, and role bindings match exactly between local backend builds. The only differing output paths are `buildmanifest.json` and `apps/methods-0cac42b0a982/gobi-compiled.mjs`. The raw module pins are separate: React 510553 bytes, SHA-256 `6b030f1bf8f6eb831c844c7126869f9ef1bf7b4a62efcf0fe56066bdfa16d209`; DOM 510516 bytes, SHA-256 `ae45eaa964faeaead3ccadf3d5b7e7eeb1fc4cabded7b2717b4108dbec2043fa`. No normalized bundle equality is claimed.

## Build provenance and reproducibility boundary

The current nested module pins `github.com/s4wave/goscript` `v0.6.2` with module Go version `1.27.0`, sum `h1:GucUqQ+xvaBzAH6W4U9Ec62T4ytUBDbmGojJbWrVEKc=`, go.mod sum `h1:g2psiTXAhkiM7vtr8YEgkq/xUlYHLSghruODJL8VpAU=`, and VCS origin `d8f58a091947cff26a9171be7bd130892b0afad3` (`refs/tags/v0.6.2`). The module query output is retained at `compiled-methods/ci/2026-10-31/lanes/build/go-list-goscript.json`.

The machine-readable preflight audit is `compiled-methods/ci/2026-10-31/lanes/build/preflight-audit.json` (SHA-256 `6357dd152d54e1732c7ac60d83a4ec5a7226ce50e1167ab66a1350719347be10`). Its audit program checks ZIP/tar custody and every local BuildResult output directly against archived bytes; no extraction or source changes were performed. No Go test, race, vet, or fresh current-head build was run by this worker.

## Gate to finish

Wait for root to supply the retained primary artifact for commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d`. Then audit its provenance against the source/tree and run IDs, archive CRC/member inventory, both 67-output backend BuildResults, manifests, AppIR/encoder/forwarder/TypeScript parity, separate raw module pins, GoScript and root/compiler tool versions, and captured Go test/race/vet logs. Until then this receipt remains `insufficient_evidence`.
