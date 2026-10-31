# E-FIXED-GO — current primary Go lifecycle artifact review

**Outcome: `confirmed_reuse`.** The exact current primary hosted artifact passes the bounded Go fixture/native adapter, React and DOM GoScript builds, typed GoSlice effect bridge, native/direct/browser conformance matrix, and mounted HTTP demo. This review replaces the superseded 49cc CI audit for this lane; it is based only on the current `00da` artifact and does not substitute a local rebuild.

## Artifact and source identity

The primary artifact is ID `13035044166` for workflow run `41181505234`, head `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. The retained provider ZIP is 47,072,021 bytes, SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`; its CRC test passed and all 1,270 inventory members (413,394,195 uncompressed bytes) match their hashes in the extraction. The provider member inventory SHA-256 is `b2403186827c5e43a4c46213cb456be8756bdc4c3d298de4bcb543ce25959fbb`. The provider reports success.

**Extraction limitation:** the extracted root also contains one unmanifested temporary file, `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/.lifecycle.browser.json.yXKBO2` (48,496,640 bytes; observed mtime `2026-10-31 16:05:51 UTC`). It is not in the provider ZIP or inventory, its origin is unestablished, and it is excluded from every claim here. No active lifecycle/browser writer was present when checked. The original ZIP and its 1,270 matching members remain the proof source; this review does not certify the extraction as a closed, extra-free directory. Root owns anomaly custody.

The hosted full attempt is `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z`, recorded as `full` / `passed`, with no failures and all 13 stages passed. Its execution record SHA-256 is `c83c3ba15d9533d07aefc2d80e6166889a03cb17af7022830a55aaeaf144e216`; the runner's exact main command was `bash /home/runner/work/gondola/gondola/run-compiled-methods.sh`, exit 0. Tool versions: Node `v22.23.4`, npm `10.9.9`, root Go `1.24.13`, compiled Go `1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2`.

All 123 hosted source pins match the current `00da` source checkout. React and DOM each retain 67 output pins unchanged through conformance; five demo static asset pins were also unchanged. The attempt archive has 240 members and 159,309,482 uncompressed bytes; its round-trip and manifest checks passed.

## Typed Go and generated module evidence

Hosted Go tests passed for `./compilercontract`, `./gobi`, `./fixtures/compiled/lifecycle`, and `./cmd/compiled-lifecycle-native`; compiler tests passed for `./analyze`, `./build`, `./cmd/...`, and `./emit`. The pre-build Node suite passed 71/71 and the compiled lifecycle runtime suite passed 10/10. These are hosted artifact results read from the attempt's logs, not rerun locally.

React and DOM each built one app with zero diagnostics. Both AppIRs identify `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`; the build manifests link AppIR, compiled module, and generated encoder. `Update` takes the declared `State` and `gobi.Message`, returns `State` and `[]github.com/samuelpmahan/gondola/gobi.Effect`, and the finite state has four `NodeState` members plus a `uint64` request counter. `uint64` uses JavaScript `bigint`. The Effect ABI is the declared struct with exactly `Kind`, `Name`, `Arg`, and `Reply`. AppIR and encoder hashes match across backends; the backend modules are separately pinned.

The actual compiled `removeParent` path uses `appendOne` to produce a GoScript slice, in child-first order: Grandchild, Child, Parent. The hosted direct trace contains that returned typed slice (`typeId: []github.com/samuelpmahan/gondola/gobi.Effect`) and the normalized host effects preserve the three `lifecycle.cancel/cancel` intents in the same order. This exercises the signature-TypeID-selected generated encoder and the declared GoSlice bridge. Runtime tests cover a nonzero-offset GoSlice and rejection of malformed GoSlice wrappers, malformed Effect fields, and extra typed Value fields. The shared runtime's default policy stays closed to `fixture.request`; `lifecycle.cancel` is admitted only by the explicit lifecycle wrapper policy. No app-specific reducer or duck-typed effect adapter is used.

## Native, direct, browser, and demo results

The native CLI command `go run ./cmd/compiled-lifecycle-native --script /home/runner/work/gondola/gondola/fixtures/compiled/lifecycle/scenario.json` exited 0 with empty stderr. Native and direct traces have 26 steps and identical typed states/effects. The mounted React, DOM, and swap profiles matched the literal oracle and physical DOM expectations: 26 ticks/events, 17 swaps, seven requests, three cancellations, child-first cancellation order, 32 retired-renderer fences, and all eight mutation controls detected. At parent removal, the sibling remains alive and pending while the parent/child/grandchild subtree is removed.

The mounted HTTP demo passed 12 checks across 24 ticks and four swaps. `/`, `/demo.css`, and `/demo.bundle.mjs` each returned HTTP 200; there were no browser, console, failed-request, or WASM errors. Full browser JSON remains in the verified provider artifact and is hash-bound there rather than duplicated into this lane.

## Claim limits and review record

This is bounded evidence for the finite admitted Go lifecycle fixture, native adapter, generated React/DOM modules, effect bridge, conformance matrix, and demo. It does not establish compilation of arbitrary `Manager` APIs or pointer-owned lifecycles. AppIR's `effect.request-reply` capability is a coarse marker; the lifecycle wrapper supplies the closed request/cancel policy. I made no production changes, local Go compilation, npm installation, rebuild, or replay. The structured audit and its captured logs are in `compiled-lifecycle/ci/2026-10-31/fixed/lanes/go/`; see the receipt for their SHA-256 values.
