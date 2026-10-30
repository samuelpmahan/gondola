# Versioned Go renderer contract and direct Go/WASM DOM backend

This milestone runs the unchanged Go collection on three replaceable implementations: JavaScript DOM, pinned React 19.3.1, and a renderer implemented directly in Go with `syscall/js`. Three actual Go application WASM instances are compared with the unchanged independent React application reference, in four isolated browser contexts. Application transitions, request identity and HTTP reply acceptance stay in the existing Go collection. The renderer imports Gobi/contract types and contains no collection transitions.

The Go-generated `gobi.keyed-renderer` version 1 manifest is checked before application initialization. It declares methods, capabilities, supported tags/attributes/events, global key rules, node/depth bounds and canonical blank-message characters. Missing capabilities or incompatible protocol/version fail before runtime init, mount or transport activity. Descriptor metadata is a declaration; its truth is established only by executing implementation tests. The registry preserves the existing host's original-runtime lease, including mixed old/new host creation orders.

The Go backend parses snapshots into concrete `gobi.Node`, bindings and message types through `rendercontract`. Application state remains opaque JSON. It reconciles keyed DOM objects, forwards current path/key events through the existing facade, preserves controlled values and selection, removes callbacks on deletion/unmount, and reports failures to the host. A real two-WASM spike and actual collection smoke establish synchronous nested event calls. Retained inputs survive reorder and HTTP completion; replacement creates new physical nodes while restoring logical key/selection. A forced paint failure after real Go dispatch demonstrates committed Go state plus a fenced/reported renderer, with no transactional rollback claim.

## Executed evidence

| Gate | Final result |
| --- | --- |
| Four-actor application replay | 71 scripts, 1113 actions, 1184 settled observations; zero mismatches |
| Required native comparisons | 213 matched: all three candidates against the independent reference |
| Native Go contract admission | 3552 candidate observations checked, 559 unique snapshots plus exact-duplicate cache |
| Browser adversarial probes | 11 passed, including three retained-node/HTTP cases and all six directed backend swaps |
| New JavaScript tests | 36 passed |
| Independent fixture admission | 36 native cases / 33 parsed-JS comparisons / 3 raw-JSON-only cases, no disagreements |
| Fixture browser witnesses | 7 positive fixtures ×3 renderers =21 renders; 26 object negatives ×3 =78 unchanged-DOM/snapshot checks |
| Compiled Go checks | Native tests, native and WASM vet, native contract/collection race checks, strict GoDOM bridge smoke pass |
| Real HTTP demo | Native clicks, held saves, editing/reorder, DOM→GoDOM→React, focus/selection, completion, cancel, stale key and retry pass |
| Inherited preservation | All 509 prior delivery pins, all 24 original SHA256SUMS entries preserved |

Seeds are **20261030 and 20261031**, with 30 generated cases each and at most 40 actions, plus 11 fixed scripts. Local toolchain: Go 1.24.0, Node 22.23.4, actual Chromium 153.0.8010.0; existing React/ReactDOM 19.3.1, Playwright 1.64.1 and esbuild 0.28.2. No new JavaScript dependencies were added.

The full inherited command `bash run-keyed-editor.sh` ran with the existing provisioning opt-outs after installed dependencies/browser were verified. It passed the original static 5,000 cases/59 rules and signed receipts, counter 107/4,473, replacement 103/5,249, controlled input 216/10,149, async 76/1,552, HTTP 82/1,572 and keyed 70/1,113. Root then reran the final new Go/build/browser gates and the final Node/full-replay gates on the reviewed source. Only new source changed during repair; all 509 inherited pins were reverified. The new normal entrypoint is checked separately by fresh GitHub Actions and its result is appended to the PR, without changing the reviewed commit.

Exact final commands, source/asset hashes and exits are in `evidence/g1-checkpoint.json`, `evidence/final-source-checkpoint.json`, `evidence/g1-exit.json`, `evidence/g2-exit.json`, and their logs. The replay checks full state, keyed trees, bindings, ordered messages, completion audit, transport/server records, pending requests, raw mounted DOM and live input/disabled properties. Focus comparison is tied to explicit focus requests. Required observation channels cannot disappear synchronously, event delivery has per-actor dispatch/message witnesses, and native frames must be nonempty and agree with captured browser observations and action steps.

Final complete trace and all213 native input envelopes are preserved in `evidence/renderer-traces.tar.xz`. Replay one independently after extraction:

```sh
mkdir -p /tmp/gobi-renderer-traces
tar -xJf renderer-conformance/evidence/renderer-traces.tar.xz -C /tmp/gobi-renderer-traces
go run ./cmd/compare-interaction /tmp/gobi-renderer-traces/native-input-seed-0-script-0-dom.json
```

The manifest and all 36 generated fixtures are also preserved with source hashes. Fixture expected HTML comes from the independent existing Go static renderer, canonicalized through a browser template. Fixture runtimes are static data doubles; they do not claim Go application transitions. The four-actor replay separately uses the actual Go collection and real loopback HTTP. Raw malformed, duplicate-key and trailing JSON are native-parser-only cases because parsed browser objects lose that syntax. Likewise raw `Kind:1.0` is rejected by the Go integer decoder while JS parsing normalizes it to Number1; this raw lexical distinction is recorded, not treated as a browser-object mismatch.

## Findings and repairs

- A naive runtime wrapper bypassed the old host's lease. The registry now passes the original runtime, validates through the renderer facade/API, and tests both old→new and new→old lease orders.
- A 16-case message-name probe found four Go/JS disagreements over U+0085 and U+FEFF. Go now owns the union whitespace policy in `messageBlankRunes`; all 16 direct cases, an independent 52-case matrix and four additional fixture negatives agree.
- The exported Go validator used Unicode trimming on raw application state, accepting bytes that are not JSON whitespace. It now accepts only JSON's SP/TAB/CR/LF at that boundary; direct typed-API and parser probes cover the distinction.
- Independent checker review found synchronized missing channels, absent explicit focus, synchronized no-op Add, and empty native traces could remain green. Required shape, focus and event-delivery witnesses plus native/browser correlation now reject those exact counterfactuals. A failed repair gate then exposed legitimate asynchronous reply suffixes and a wrong raw-dispatch route. Final seeded runs then exposed overly literal focus/value witnesses: text inputs remove CR/LF; collapsed selections and requested `none` directions follow browser defaults. Expected values now model those normalizations while retaining focus keys/ranges, explicit forward/backward direction, per-actor parity and no-op detection. All findings are preserved and independently rechecked.
- The copied demo initially loaded the old two-backend module. Its source URL is corrected, and the real HTTP smoke verifies GoDOM is actually active. The default runner now includes the direct GoDOM bridge smoke after matching `wasm_exec.js` is copied.

Initial author reports, initial review snapshots, failing counterfactual outputs, repairs and independent rechecks remain in `coordination/`. The first selector-failure report was overwritten by the author and cannot be recovered; a new isolated reproduction uses the original bad selector and fails as expected. That archive is labeled reproduced rather than recovered. The first repair report is retained with its embedded native frames; its separate native input filenames were overwritten by the succeeding run. E4 temporarily changed two inherited script files outside its assigned scope, then restored both byte-for-byte before the inherited keyed phase; all 509 pins verify. A local default-run attempt encountered the already-known corrupt Playwright Chrome download and was interrupted; the actual local gates use installed Chromium 153, while fresh CI installs the standard browser. Historical artifacts and failed attempts are not counted as final passes.

## Reproduce

With Go 1.24 and Node 22:

```sh
bash run-renderer-conformance.sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
# Open http://127.0.0.1:8000/renderer-conformance/demo.html
```

The default runner always executes the complete inherited path, then builds the contract CLI/manifest/fixtures and Go renderer, runs the bridge/fixture/native/Node/browser/demo gates and the full replay. CLI arguments reach the final replay. The pending-save screenshot shows the Go/WASM renderer active with a real held HTTP request and retained selection.

Six Luna 6 XHigh workers filled all six available child slots under the seven-slot platform limit. Current Chainspot toolkit branches/PR/probe and actual rebalancer 1.0.4 were checked; author and independent-review solves each scored 600/600 with zero broken constraints. Real starts, explicit disjoint ownership, dependency gates, author exclusions and acceptance hashes are inspectable. Rebalancer allocates rather than dispatching LLM APIs. No extraction-only finish is fabricated. Source/evidence is published only through a stacked feature review PR; no main merge, production deployment, Slack or email action occurred.

## Demonstrated scope and next milestone

The guarantee is finite, serialized parity for the tested Go component and canonical v1 profile in the executed Chromium builds. The profile supports div/p/input/button, text nodes, five attributes, click/input events, globally unique ASCII element keys, maximum depth 64 and 4,096 nodes. Fragments/styles and arbitrary frontend schemas are excluded. State is opaque JSON, not a generic typed application-state proof. GoDOM has one active renderer per realm. Runtime ownership remains exclusive; wrapper aliases and mutable caller behavior are not a security-isolation guarantee. Metadata compatibility does not prove arbitrary backend implementation behavior.

Untested: exhaustive allowed trees/events, arbitrary nested bubbling, multi-root/multi-session composition, IME, pointer-focus policy, hydration, other browser engines, pixels, production services and generic `Backend.Emit` compilation. Go/DOM failure does not roll back an already committed transition. These limits do not imply universal Go/React equivalence.

A further backend must declare the profile accurately, preserve the original runtime lease, pass all Go-generated fixture and rejection witnesses, implement current-key routing/update/focus/error cleanup, and join the same independent actual-Go/HTTP/native comparison suite. The next meaningful milestone is composed Go components with scoped session/message/effect ownership and multiple independently replaceable roots, including unmount/cancellation isolation.

Native envelopes identical to the pre-review run: 213/213. The final app reached up to 3 held requests per actor; no unbounded HTTP concurrency is claimed.

[Final summary](evidence/summary.json) · [Complete traces](evidence/renderer-traces.tar.xz) · [Final source/build checkpoint](evidence/final-source-checkpoint.json) · [Independent reviews](coordination/review-acceptance.json) · [Coordination protocol](coordination/PROTOCOL.md)
