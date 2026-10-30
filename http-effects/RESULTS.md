# Typed Go HTTP effects — October 30, 2026

This experiment takes the existing Go-owned asynchronous editor onto a real same-origin Go HTTP laboratory service. `asyncsave.Session`, the effect host, DOM renderer and React renderer are reused unchanged. Go encodes requests and strictly validates/correlates responses; the browser adapter handles fetch, advisory abort, delivery fencing and failure normalization. An independent JavaScript codec/model and independently rendered pinned React19.3.1 view provide the reference.

Base: PR4 `cc534cba691ca69f12b6028ed035f7e09794d316`. Fresh branches, all four open PRs, their executed evidence and current green CI were inspected before choosing HTTP. No overlapping HTTP work was present. This is a stacked review targeting PR4's branch. Main's independent Inertia milestone is neither merged here nor claimed as a tested HTTP combination. All273 earlier delivery pins and Milestone0 receipts remain intact.

## Execution checkpoint

**82 scenarios /1,572 observations, zero mismatches; all164 native comparisons match.** Each seed has11 fixed and30 generated scripts capped at40 actions. See [versions.json](evidence/versions.json) for exact executed versions and [summary.json](evidence/summary.json) for report hashes/counts. Local tooling is Go1.24.0, Node22.23.4, React/ReactDOM19.3.1, Playwright1.64.1, Chromium153.0.8010.0, Python3.12.14 and native Rebalancer1.0.4. Chromium is the already provisioned local fallback; standard Playwright Chromium runs separately in CI.

| Seed | Scenarios | Observations | Renderer swaps | HTTP starts per candidate | Replies per candidate | Cancellations per candidate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261030 | 41 | 783 | 95 | 111 | 106 | 5 |
| 20261031 | 41 | 789 | 103 | 106 | 101 | 5 |

The23 HTTP Node tests, strict real-WASM boundary smoke and real-HTTP demo pass. Full Go tests, vet and focused race checks pass. All11 required adversarial route gates pass. There are no Go/page/unexpected console errors. The186 expected network diagnostics and117 request-failure observations (including intentional aborts/body truncations) are retained rather than discarded.

The inherited chain passes: original counter107 scripts/4473 ticks; replacement103/5249; controlled input216/10149; async76/1552 with152 native matches. Original static5000 cases/59 rules, original receipt and SHA256SUMS pass separately. All273 inherited delivery pins verify. [Static log](evidence/static.log) · [Inherited log](evidence/inherited.log) · [Final normal-command log](evidence/http-final-normal.log).

The comparison checks settled action boundaries across two independent Go WASM instances starting on DOM and React plus an independently rendered React oracle. It checks full state, Gobi trees, explicit input bindings, ordered messages, completion audit, normalized transport ordering, server request records, raw mounted HTML and live input/disabled properties. Every host initializes Go once per scenario. Required native CompareInteraction checks steps/state/tree/DOM; JavaScript separately checks the additional protocol/property/audit/network fields. Real request and response records, expected HTTP diagnostics and all mismatches remain in full reports.

## Reproduction

Normal commands, with Go1.24 and Node22:

```sh
bash run.sh
bash run-http-effects.sh
./http-effects/build/http-lab -addr 127.0.0.1:8080 -root .
# Open http://127.0.0.1:8080/http-effects/demo.html
```

The default runner executes the entire inherited interaction chain, builds current HTTP WASM/server/bundles, runs Go/Node and strict WASM boundary tests, the real HTTP demo and deterministic seeded browser replay. The iteration-only inherited skip requires a matching prior passing receipt. No production deployment is involved. README.md describes demo controls and supported laboratory modes.

Exact final normal local command (no inherited skip):

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-http-effects.sh --seeds 20261030,20261031 --cases 30 --max-actions 40 --output http-effects/build/final-frozen-seeds-20261030-20261031.json
```

It completed with exit0 on the reviewed frozen source. The runner executes the signed static baseline, complete inherited chain, current Go/WASM/Node tests, actual HTTP demo and full seeded replay. The fresh passing cache receipt is [inherited-pass.json](evidence/inherited-pass.json); [final-receipt-recheck.json](evidence/final-receipt-recheck.json) proves it matches the current reviewed digest algorithm.

The complete final report plus all164 native input envelopes are in [http-traces.tar.xz](evidence/http-traces.tar.xz),165 members. All164 native envelopes are byte-identical to the first successful full replay, despite independent HTTP server/browser executions. Extract with `tar -xJf http-effects/evidence/http-traces.tar.xz -C <empty-directory>` and run `go run ./cmd/compare-interaction <native-input-file.json>` to replay a comparison. Original absolute paths are provenance. [Source and build checkpoint](evidence/source-checkpoint.json) · [Pending-swap screenshot](evidence/demo-pending-swap.png) · [Drop probe](evidence/drop-chromium-probe.json).

The earlier successful full run is retained in prereview-http-traces.tar.xz. Failed fixed reports, original native inputs and all initial findings remain in separate evidence archives. The earlier narrow-digest receipt/run is historical evidence, not the final runner's cache authority. Source/asset hashes identify the exact executed local build; newly built Go binaries can vary with toolchain/VCS build metadata while producing equivalent traces.

## Findings repaired during integration

- Strict request parsing initially accepted JSON null as an empty Go string. An actual httptest probe reproduced200; primitive-type checks now reject it and invalid UTF-8/oversized input, with regressions.
- Go's permissive JSON decoder and JSON.parse disagreed on escaped lone Unicode surrogates. Both final codecs reject unpaired escaped surrogates and accept valid pairs. Native raw UTF-8 byte checks are distinct from browser body-text decoding.
- Release bookkeeping examined the saved request context before terminal state. A later duplicate release could mislabel a normally completed request as cancelled. Terminal records are now preserved; actual socket tests check completion/cancellation followed by repeated release.
- A delivery callback error could disappear before transport.settled() observed it. Errors are now retained and consumed exactly once; the regression waits until after work has ended before requesting settlement.
- The first fixed replay had matching state/DOM/native traces but failed on expected409/503 console diagnostics. Classification now requires the exact scripted API URL/method/mode/status and an observed matching response, with counts checked. Unexpected console errors and JavaScript exceptions remain fatal.
- Chromium automatically replayed an abruptly closed POST, obtaining a duplicate409 instead of a network error. The final drop fixture sends headers then terminates an incomplete body; the harness requires an actual network error and exactly one dropped server record. Earlier reports retain the mistaken409 observations.
- Initial full-Go/inherited attempts overlapped unfinished author test edits and failed compilation; they are retained and superseded by completed gates. The CLI range test also had an assertion-text mismatch, repaired without weakening its numeric bound.

Independent review also added explicit native response-ID boundary tests and repaired a stale-cache bypass (counter/ omitted from the input digest) plus the standalone runner's missing static gate. The final normal runner executes static and all inherited checks before new HTTP gates. Original findings, failed reports and final rechecks remain inspectable; failed attempts are not counted as passes. See evidence/initial-findings.md and coordination reports.

## Coordination and guarantees

Six Luna6 XHigh workers used all six actually available child slots under the platform's seven-slot total including root. Native Rebalancer1.0.4 allocated disjoint authors and six independent cross-reviews, both native/exact600/600 with zero broken constraints, with real platform starts and explicit acceptance receipts. It does not dispatch LLM APIs. The current Chainspot toolkit PR/probe were inspected before allocation. No extraction-only finish result is fabricated. See coordination/PROTOCOL.md, specs, native bundles, actual starts and final acceptance hashes.

The demonstrated guarantee is finite, serialized HTTP-lab parity for the tested component/protocol in the executed browser. A real abort closes the original response socket; canceled release returns409 and cannot revive it. Injected fetch races prove late-callback fencing, while the preserved async milestone separately proves Go stale/duplicate completion guards. These are distinct guarantees.

Untested: production services, persistence, authentication, cross-origin behavior, arbitrary endpoints, network timeouts, service workers, other browser engines, concurrent scheduling, IME, hydration, keyed reconciliation, pixels and universal Go/React equivalence. The64KiB limit bounds Go's200-response parser; fetch.text() still buffers the body before parsing. Async completion remounts the renderer, so focus/selection continuity is unproven. Already committed Go state/partial DOM changes are not transactionally rolled back. Exclusive ownership of the underlying runtime/session and transport remains required; wrapper aliases are caller responsibility. This is a typed experiment, not a generic executor for every gobi.Effect or complete Backend.Emit compiler.

Another frontend backend must consume the same Go snapshot/bindings, implement the renderer lifecycle and controlled/disabled properties, and pass the same HTTP scripts and independent oracle without taking over application transitions. The next coherent milestone is a Go-owned keyed collection editor with add/delete/reorder and a renderer update contract that preserves input identity, focus and selection through asynchronous completion and backend replacement.

Standard-browser GitHub Actions outcome is checked separately and appended to the PR after execution; this document pins the completed local normal-command run. No main merge or production deployment.
