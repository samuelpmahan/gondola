# XR-CI-BUILD — independent build review

**Decision: `accepted`.** The primary push artifact and the E-CI-BUILD build provenance, output inventories, AppIR ABI/call graph, and scoped execution records agree with the retained bytes and the published source tree.

## Review target and custody

I reviewed the N4 E-CI-BUILD report (SHA-256 `d150e20da1fc7e73521b4e7fa7f6f72d385e514c58e976d3b7cd3c45d0fa55a5`) and receipt (SHA-256 `01669bf0858e0475914345b7080c3a86f906faff62693e61c5b6063e1c7aaa59`). They bind the successful primary push run `41169518187`, job `124444234335`, artifact `13030848292`, to commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`. The checkout resolves to that exact commit/tree; its parent is `8ed5b66a223de1992756516f8d3895c6e096f842`.

I independently checked the provider ZIP: 11,460,089 bytes, SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`; CRC passes, the three retained chunks reconstruct its exact bytes, and all 968 members match both the retention inventory and extracted files (79,084,644 uncompressed bytes).

## React and DOM builds

The retained run `attempt-20261031T044100445Z` records 17 successful commands and 34 stdout/stderr streams whose hashes match. The 137 source pins match the checkout and are unchanged before/after. I also independently checked the conformance pin set: 188 source/attempt pins (51 checked-out source files plus 137 attempt outputs), 149 before/after browser-check output pins, seven evidence pins, and nine matrix files all match the retained bytes.

The two actual `go run ./cmd/gobi-build` results each report `ok: true`, one AppIR, no diagnostics, and 67 declared outputs. For both `react` and `dom`, I matched every output path, byte count, and SHA-256 against the BuildResult, the runner inventories, the physical extracted tree, and the before/after pins. Both manifests carry the requested backend tag and stable AppIR/module/encoder paths.

Each backend has the same 67 output paths. Sixty-five files are byte-identical; only the raw `gobi-compiled.mjs` bundle and backend-tagged `buildmanifest.json` differ. Removing the single backend tag makes the manifests identical. AppIR, encoder, components, emitted TypeScript, Go forwarder, and role bindings match byte-for-byte. The raw module hashes remain distinct and are pinned separately; no normalized bundle-equality claim is made.

## Typed AppIR and module provenance

The shared AppIR is 11,756 bytes, SHA-256 `07d0d25ede9993e1f58e108f4cc153717ff62061ff519b50619615cd4faccd3b`. Its 15 symbols are the three app roles, ten concrete `State` receiver methods, and the two projected `counter.Init`/`counter.Update` dependencies. I checked receiver-first method signatures, `(State, []gobi.Effect)` results for `Reduce` and the seven action methods, and these call edges: `Init → State.Initialize → counter.Init`; `Update → State.Reduce →` the seven action methods; each Add/Reset method → `counter.Update`; and `View → State.ComposeView`. The emitted Go forwarder is identical for both builds and directly forwards typed `Init`, `Update`, and `View` calls.

GoScript provenance is `github.com/s4wave/goscript v0.6.2`, module GoVersion `1.27.0`, module sum `h1:GucUqQ+xvaBzAH6W4U9Ec62T4ytUBDbmGojJbWrVEKc=`, go.mod sum `h1:g2psiTXAhkiM7vtr8YEgkq/xUlYHLSghruODJL8VpAU=`, and origin commit `d8f58a091947cff26a9171be7bd130892b0afad3`. The go.mod/go.sum file hashes are among the 188 source pins. I separately checked the source-checkout module-origin record and retained go-list record against the module version, origin commit, required Go version and sums. Those two records are checkout/review evidence rather than provider ZIP members; I do not describe them as ZIP members or as part of the 188-file pin set.

## Scoped logs and limits

The artifact's inherited compiled-frontend execution has 33 successful commands and 66 verified log streams; its 209-file output inventory matches before/after and disk. The inherited compiled-backends execution has 18 successful commands and 36 verified log streams; each React/DOM four-app output tree has 209 files and matches its before/after pins. The six captured Go test/race/vet commands (root Go 1.24.13 and compiled-frontend Go 1.27.3) exited 0. The methods runner used Node `v22.23.4`, root Go `go1.24.13`, compiled Go `go1.27.3`, Playwright `1.64.1`, esbuild `0.28.2`, React/ReactDOM `19.3.1`, and Chromium `156.0.8078.4`.

This independent review audited immutable logs and artifacts; it did not rerun builds, tests, race tests, vet, or browser tests. The E-CI-BUILD acceptance is scoped to the successful primary push artifact and its build provenance; it does not itself make a separate PR or global workflow claim.
