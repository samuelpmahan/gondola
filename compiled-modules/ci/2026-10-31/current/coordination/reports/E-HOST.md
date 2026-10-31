# E-HOST — typed pair runtime and demo

**Worker:** N3  
**Outcome:** `mixed_change`  
**Scope:** `compiled-modules/runtime/**`, `compiled-modules/demo/app.mjs`, `compiled-modules/demo/index.html`, and this evidence packet.

## Implementation

Added `mountCompiledModulePair(options)` as an async, finite two-module host. Each side supplies a compiled module, separate `gobiModuleBridges`, encoder, ABI descriptor plus exact descriptor bytes, artifact byte map, and component ID. Before initialization or renderer work, the host snapshots caller-owned metadata, function references, and artifact bytes, then calls the shared WebCrypto module-pair validator. It binds each module to its own Go state and enforces the fixed initialization and event bridge order from the contract. Bridge records are validated as closed primitive records; no application transitions are implemented in JavaScript, and nonempty Go effect slices fail closed.

The runtime uses a safe-ID renderer registry and lazy factories. It checks each module's declared view capabilities before calling Go roles, keeps parent and child on separate roots, and attaches roots only after both initial views render. Physical callbacks must match the current Go view's path, event, and message; disabled/unhandled actions are suppressed. `dispatchGoMessage` is a separate explicit source kind for scripted Go messages. Swaps stage both detached roots, preserve the current module states and cached views, make no Go Update or bridge calls, and fence callbacks from the prior renderer generation. `snapshot()` and `trace()` expose the two states/views/DOM snapshots and role/bridge call order.

The demo exports `startCompiledModulesDemo({profiles})`, mounts the DOM profile, allows DOM/React swaps, and exposes `window.compiledModulesDemo` for snapshots, traces, direct scripted Go messages, and teardown.

## Verification

Node v22.23.4 focused checks and runtime tests passed: `node --check compiled-modules/runtime/runtime.mjs`, `node --test compiled-modules/runtime/runtime.test.mjs` (5/5), and `node --check compiled-modules/demo/app.mjs`. The tests exercise invalid ABI rejection before factories/Go/outer DOM writes; renderer capability rejection before Go calls; exact initialization and event bridge order; disabled suppression and explicit Go dispatch; renderer replacement with state preservation and stale-callback fencing; effect rejection; and asynchronous metadata/artifact mutation fencing. Exact commands and stdout/stderr are retained in `rawlogs/E-HOST/focused-tests.json`.

An independent Chromium harness also mounted prior React and DOM build artifacts. Its fixed profile records three runs (React, DOM, swap), each with 24 source events, 16 Go updates, and 17 checkpoints. A seed-20261031 profile records three runs with 40 physical click records, 29 Go updates, and 30 checkpoints each; the swap profile also records two renderer swaps and one stale old-callback probe. N4 reported no host defect in those runs. The raw captures are `/tmp/module-pair-harness-smoke.browser.json` (5,000,597 bytes, SHA-256 `c2e43437fcc45c5ba6bee960b4b86c47d93ca2709d578f8bfced030f6d314655`) and `/tmp/module-pair-seed1.browser.json` (14,171,421 bytes, SHA-256 `07646a3bf626d6f0f8573b65d63cc1f6344a25c2dcbeb9957c668cd3a35fca58`). The compiler build index used by those captures is pinned in `rawlogs/E-HOST/source-pins.json` and is the earlier stable-build index SHA-256 `445e2207c1660a43cdcd91aebc1c26964a9fceba36ca238b9fd86de1d964d022`.

**The strict literal checker did not pass on these prior compiled artifacts:** it found the parent label `Step −` encoded as `Step â`. N1/N2 have a separate GoScript byte-string/Unicode repair in progress. This is an older compiled artifact boundary mismatch, not evidence that the host transforms text; this packet does not claim final rebuilt-artifact or end-to-end acceptance. The host passes Go `View` output through without additional decoding.

## Scope limits

This implementation and evidence cover one parent plus one child, the exact Input/Publication ABI, synchronous effect-free dispatch, and the tested React/DOM renderer profiles. They do not establish arbitrary module graphs, async effects, malicious-code isolation, other frontends/browsers, pixel equivalence, or acceptance of the pending UTF-8 producer repair.

## Pins

Owned implementation, tests, contract, shared renderer/ABI inputs, and the prior compiler build index are pinned in `rawlogs/E-HOST/source-pins.json`. Runtime test output is in `rawlogs/E-HOST/focused-tests.json`; browser capture identities and the prior-build boundary note are in `rawlogs/E-HOST/old-build-browser-captures.json`.
