# Controlled input evidence — October 30, 2026

This milestone extends replaceability beyond the counter: a second Go component owns an editable draft, exact saved text, save count, rendered Gobi tree and ordered message history. The same compiled Go editor runs through DOM and React renderers, with live replacement while text is unsaved or saved. A separate React 19.3.1 implementation owns its own state transitions and supplies the behavioral oracle.

Base: renderer-replacement PR #2 at `0f160357b65e3cd39a6f5c8aa7a19e8a028ccfb8`. Fresh branch/PR inspection found completed, green counter/replacement milestones and no overlapping input work. This is a stacked review branch targeting PR #2; main and earlier PRs remain untouched. Main's separate Inertia milestone was `3b46301e69104d82298126e58e0c65565825a4c4`. This evidence tests the stated stack; it does not claim the input milestone has been tested together with an unmerged main combination.

## Executed results

Final repaired source, seeds **20261030 / 20261031**: **216 scenarios, 10,149 observations, zero mismatches**. All **432 native comparisons** match. Source/asset pins were unchanged across the final run.

| Seed | Scenarios | Observations | Fill steps | Individual typed keys | Shared clicks | Swaps | Detached-input checks | Mismatches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261030 | 108 | 5,015 | 904 | 1,488 | 1,386 | 771 | 358 | 0 |
| 20261031 | 108 | 5,134 | 1,014 | 1,502 | 1,288 | 795 | 427 | 0 |

[Final replay log](evidence/post-review-replay.log) · [Machine-readable summary](evidence/summary.json) · [Complete final traces](evidence/controlled-input-traces.tar.xz).

Extract using `tar -xJf controlled-input/evidence/controlled-input-traces.tar.xz -C <empty-directory>`. It contains the full final browser report and all 432 native input envelopes. Replay an envelope with `go run ./cmd/compare-interaction <input-file.json>`; replay the extended browser/property checks with the full runner. Stored original absolute input paths are provenance and may be replaced by extracted paths.

The earlier full runner also passed 216 scenarios / 10,149 observations and all 432 native comparisons before the final review amendments. [Its complete log](evidence/full-run.log) includes the inherited regression gates, and [its complete traces](evidence/pre-review-traces.tar.xz) preserve that execution separately from the final source checkpoint. Both runs use eight fixed scripts plus 100 generated scripts per seed, capped at 80 scheduled actions; a typing action expands into individual observed keystrokes.

Each scenario starts two isolated Go WASM runtimes through hosts initially on different backends and one independent React oracle. Native fills, individual keys and clicks are replayed identically; replacement and stale detached-input actions affect the selected Go host. Every observation compares state, full Go Node tree, binding sidecar, complete ordered delivered messages, actual raw HTML/outerHTML, live input value and disabled button properties. Renderer-reported HTML/disabled lists are separately checked against the actual DOM. The oracle's Node tree is a projection of its own state, not React-internal introspection.

Native `CompareInteraction` compares initial/ordered Steps, state, tree and DOM. It ignores the extra binding/message/property fields carried in each envelope; the JavaScript harness independently checks those fields. Each host must call the underlying runtime API `init()` exactly once per scenario, and recorded dispatch counts must equal delivered messages. A separate probe edits one Go instance and reads the other through a disabled Save without reinitializing it, confirming isolation.

Other executed gates:

- Original static `bash run.sh`: all original Go/vet checks, 59 compatibility rules, 5,000 seed20261030 cases, expected receipt and SHA256SUMS pass. All 56 earlier interaction delivery pins and all 53 replacement delivery pins remain valid.
- Inherited mounted counter: 107 scripts / 4,473 initial/action ticks, native comparison matched, 8 Node tests pass.
- Inherited renderer replacement: 103 scripts / 5,249 ticks, native comparison matched, 20 Node tests and its demo pass.
- New Go contract/editor suite: 12 top-level tests plus negative subcases pass; uncached full Go package tests pass.
- Final new Node suite: **32/32 pass** (12 protocol/DOM, 3 React, 10 harness, 7 adversarial). Real Chromium fixtures cover renderer transport and controlled input identity.
- **9/9 browser adversarial probes pass**; expected global-error list is empty. Includes literal argument protection, invalid binding causes, zero disabled dispatch calls under both backends, detached/unmounted input suppression, root reuse, error fencing and ordinary typing checked after every key.
- Visible editor demo: eight observations pass, with DOM typing, unsaved replacement, React typing, repeated Save, return to DOM and Reset. Six edits, two saves and one reset remain in order. [Final demo log](evidence/demo-final.log) · [Captured React editor](evidence/E6-after-react-edit.png).
- An independent executable WASM boundary probe passes ten malformed JavaScript values followed by a valid edit, without terminating Go. [Probe and replay commands](coordination/cross-review/XR-E1-report.md).

## Commands and versions

Local: Go1.24.0, Node22.23.4, npm11.9.0, React/ReactDOM19.3.1, Playwright1.64.1, esbuild0.28.2, Python3.12.14, Rebalancer1.0.4, Chromium153.0.8010.0 on Linux x86_64. [Toolchain receipt](evidence/toolchain.json) and [source/asset checkpoint](evidence/source-checkpoint.json) pin this execution. The browser was the previously provisioned npm-hosted `@sparticuz/chromium@153.0.0`, because the earlier standard local browser download was corrupt. Standard Playwright Chromium is configured in CI; its outcome is recorded separately on the PR.

Exact principal commands from the repository root:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH bash run.sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH go test -count=1 ./...
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-controlled-input.sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node --test controlled-input/*.test.mjs
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node controlled-input/demo-smoke.mjs
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GO_COMPARE_BIN=$PWD/interaction/build/compare-interaction node controlled-input/check.mjs --seeds 20261030,20261031 --cases 100 --max-actions 80 --output controlled-input/build/final/report-seeds-20261030-20261031.json
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s backend-replacement/coordination -p 'test_*.py' -v
```

The first complete runner supplied inherited regression evidence. After review repairs, targeted unit/browser/demo checks and the full two-seed input replay were repeated against the final source. No inherited source changed. The four inherited coordination negative gate tests also pass. Normal installation/demo instructions are in [README.md](README.md); the `/tmp` paths above describe this specific provisioned environment.

## Failures and review repairs

The first demo continuation after a swap expected `draft!` but observed `!draft`: the newly mounted input began with its caret at offset zero. Go state and actual DOM agreed. The test now explicitly positions the caret before continuing; swap focus/selection remains untested. [Original diagnostic](coordination/E6-demo-smoke-pre-adjustment.log). A root test invocation without the browser override failed because no standard Playwright binary existed locally; the corrected environment passed. [Retained failure](evidence/node-missing-browser-env.log).

Independent cross-review produced three repairs, each preserving the original finding and final recheck:

1. React rejected disabled inputs and `aria-label` on buttons accepted by the common protocol/DOM renderer. It now accepts that subset and suppresses disabled input callbacks; a browser fixture proves raw DOM parity and zero dispatches.
2. DOM confused a null dispatch response with the absence of a handler. A unique sentinel now allows null to be validated as an error and fences later events; two events result in one call with prior accepted data retained.
3. Adversarial assertions checked disabled state without counting runtime calls and accepted any mount error. They now assert zero calls and case-specific diagnostic causes. The input `Node.On` case is honestly labeled as rejected by the click-only policy before sidecar collision validation; Go's resolver separately tests collisions.

The initial/final independent review reports and actual author evidence are preserved under [coordination](coordination/PROTOCOL.md). No unresolved blocking review findings remain. One non-blocking harness note remains: it rejects failed adversarial results but does not require a fixed list of probe names; the retained reports explicitly show all nine ran and passed.

## Coordination and exact guarantees

Native Rebalancer1.0.4 allocated all six available Luna6 XHigh child slots before dispatch, then independently allocated all six cross-reviews excluding authors. Both native/exact scores were 600/600 with zero broken constraints. The lead used actual platform controls to deliver assignments; the solver does not call LLM APIs. Source PR/head, exact probe bytes, native bundles, real start acknowledgments and report/acceptance hashes are inspectable.

The inherited coordination adapter freezes author receipts after preparing reviews; its repaired-author import was rejected. We preserve that actual ledger state and separately bind the real repair/review decisions in [final-acceptance.json](coordination/final-acceptance.json). No fabricated native extraction finish or overwritten historical receipt closes this reporting limitation. All six final reviews accepted the repaired work.

Demonstrated: the tested editor's finite state/tree/binding/raw DOM/property/disabled/message-order equivalence through both concrete renderers, including ordinary typing and live replacement under synchronous serialized events. Existing counter and static guarantees remain passing. Dynamic browser values are explicit Go sidecar data; `gobi.On.Arg` retains its original fixed literal meaning. The original Node/On/counter and all earlier signed files remain byte-identical.

Untested: universal components/strings, Go-to-JavaScript compilation, `gobi.Backend.Emit`, effects, hydration, keyed reconciliation, concurrent scheduling, IME composition, focus/selection across swaps, pixels and other browser engines. DOM text-node segmentation is not compared independently of raw serialization. A renderer failure after Go accepts a message cannot rewind Go; a browser API exception midway through painting can leave partial DOM. Renderers retain `lastError` and fence callbacks; the unchanged host stays snapshot-readable after direct native-input failures. This is fault detection/fencing, not transactional rollback or automatic recovery. The caller must retain exclusive ownership of its runtime.

A third backend needs the same mount/host lifecycle, exact declared literal and input-value semantics, controlled value/disabled property handling, validation and stale-generation fences; it must pass the shared replay and independent oracle. No framework-specific editor application logic needs translation. The next coherent milestone is a Go-owned asynchronous effect/request/reply contract, including cancellation and late-reply ordering while renderers are replaced.
