# Go-owned keyed collection over real HTTP

This milestone composes keyed add/delete/reorder, controlled editing, independent row saves, asynchronous completion, and replaceable DOM/React renderers. Go owns row identity, application state, messages, request identity and completion acceptance. It extends PR #5 at `a376b834a6bb24d7a3fb950b2e80af1826a84bda`; the counter and subsequent interactive milestones were already implemented, reviewed and executed in PRs 1–5. Fresh branch/PR checks found no overlapping keyed work. This feature PR is stacked on PR #5; main is neither merged nor deployed.

`collection.RowID` and `collection.RequestID` are distinct named Go types. The component reuses `gobi.Node`, declared `On` messages, `inputbinding.Resolve`, `asyncsave.Command/Reply`, and the existing HTTP wire codec/lab. The new strict WASM bridge sends `{Path, Event, Value, Key}` to Go. Go checks current identity before disabled suppression, preventing an old path/key from editing a different row after movement, deletion, or path reuse. IDs remain monotonic across reset. Late replies retain their original row identity in the audit and cannot update a removed row.

The host initializes each Go session once. Events commit a Go transition, then update the selected renderer. HTTP effects deliver their result back to Go and update the same renderer rather than remounting it. Backend swaps replace physical DOM objects while restoring the focused input by logical key and selection. Native-event rendering failures notify and fence the host before queued effects can start; already committed Go state is not rolled back. The genuine Chromium/React commit-fault unit uses an in-memory runtime double; the composed positive replay uses actual Go/WASM.

## Executed evidence

The full normal entry point completed with exit0 before the final checker-availability repair:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
bash run-keyed-editor.sh --seeds 20261030,20261031 --cases 30 --max-actions 40 \
  --output keyed-editor/build/final-frozen-seeds-20261030-20261031.json
```

The two install opt-outs reuse already installed pinned dependencies and Chromium; they do not skip regressions. The keyed runner always executes the full inherited default path. Local versions: Go 1.24.0, Node 22.23.4, Chromium 153.0.8010.0, React/ReactDOM 19.3.1, Playwright 1.64.1, esbuild 0.28.2. The complete normal run is preserved in evidence/normal-before-fresh-layout.log, its source/exit/command receipts, and evidence/normal-before-fresh-layout.tar.xz. It includes all inherited gates, 45 keyed Node tests and the full two-seed keyed replay. A final fresh-layout audit then found that a missing local lab binary could make the checker select an absent workspace-specific Go executable despite Go being on PATH. The owner repaired candidate selection, added the missing-layout regression, and obtained an independent recheck.

All keyed build/WASM/Go/Node/demo/full-replay gates were then rerun on the final reviewed source; the 373 inherited pins remained exact, so those unchanged suites were not repeated locally after the checker-only repair. Exact final commands, versions, source/asset hashes and exit statuses are in evidence/commands.json, evidence/final-source-checkpoint.json, evidence/final-exit.json and evidence/final-keyed-gates.log. Additional `go vet ./...` and `go test -race -count=1 ./collection` passed. Fresh GitHub Actions runs the normal entry point end-to-end on the published source; that separate result is appended to the PR.

| Gate | Executed result |
| --- | --- |
| Original static renderer | 5,000 seeded cases (seed20261030); 59 executable rules; original SHA-256 receipts pass |
| Inherited counter | 107 scripts / 4,473 observations |
| Inherited backend replacement | 103 / 5,249 |
| Inherited controlled editor | 216 / 10,149 |
| Inherited asynchronous effects | 76 / 1,552; 152 native comparisons |
| Inherited real HTTP effects | 82 / 1,572; 164 native comparisons |
| New keyed collection | 70 scripts / 1043 actions / 1113 settled observations; 140 required native comparisons; zero mismatches |
| New adversarial identity/bridge probes | 8 passed, including actual DOM and React input identity through reorder/completion |
| New Node tests and real HTTP demo | 47 Node tests passed; demo smoke passed |
| Inherited preservation | All 373 delivery pins and 24 original SHA256SUMS entries match |

The three-way replay uses two independent Go/WASM sessions initially mounted with DOM and React, plus a separately modeled and rendered pinned React reference. Each actor has its own browser context and HTTP lane. At each settled boundary it compares state, complete keyed Gobi trees, input bindings, ordered messages, completion audit, transport order, server records, raw mounted DOM, live input values, disabled properties and row order. Logical focus/selection comparison begins after an explicit focus action and continues through later actions; native pointer/disabled-control focus behavior is not inferred. A counterfactual selection mutation test proves that focus mismatches are detected. Native `CompareInteraction` independently checks step/state/tree/DOM traces; additional channels and physical identity use separate JavaScript assertions.

Ten fixed scripts cover repeated actions, reset/cap behavior, keyed reorder, edit during pending save, completion, both backend swaps, deletion while pending, true deleted-path reuse by a fresh ID, detached input events, raw stale-key rejection, cancellation/retry, independent row completion, and HTTP error modes. Thirty generated scripts per seed use at most 40 actions. The eight required adversarial probes include retained input object identity for each actual backend, node replacement plus logical restoration across swaps, deletion focus behavior, detached event suppression, atomic stale path rejection, path reuse, and strict real-WASM negative calls. Full final trace and all 140 native envelopes are preserved in evidence/keyed-traces.tar.xz; extract into an empty directory to replay a native comparison:

```sh
mkdir -p /tmp/gobi-keyed-traces
tar -xJf keyed-editor/evidence/keyed-traces.tar.xz -C /tmp/gobi-keyed-traces
go run ./cmd/compare-interaction /tmp/gobi-keyed-traces/native-input-seed-0-script-0-dom.json
```

All 140 native input envelopes are byte-identical to the completed normal run before the checker-only fallback repair. The final app replay reached at most 3 held requests per actor; the separate raw pool probe reached 4 per context. Absolute paths in historical reports are provenance.

## Boundaries found and repaired

An actual HTTP/1 connection-pool probe showed that six held POSTs in one Chromium context block the browser's status/release GET. External Node controls still worked; abort recovered browser capacity. Go therefore limits this experiment to four rows, with disabled/no-op Add at capacity. A separate positive raw HTTP pool probe held 12 requests across three contexts while all browser control GETs returned200. This demonstrates bounded control capacity, not an unbounded collection or general browser/network guarantee. That pool probe uses raw requests; the composed app replay does not establish every four-save interleaving.

Integration repaired a fetch-tracker guard that confused its completion Promise with a boolean. The first failed fixed report retained 23 mismatches and exposed expected HTTP diagnostics being counted as application errors. Independent review then repaired missing focus comparison, DOM-only identity coverage, lab-child cleanup on malformed/timeout readiness, ineffective deleted-path-reuse schedules in both script and smoke, fresh-checkout dependency ordering, dropped CLI arguments, unavailable Go candidate selection in the fresh-layout checker fallback, and the native-event host failure path. An invalid README action limit and build-output wording were corrected. A new root ignore rule was moved into keyed-editor/.gitignore to restore every inherited pin. Initial findings, failed reports, initial author/reviewer reports, and independent rechecks remain preserved; historical failures are not counted as passes. Two early stalled launches lacked resumable session handles; cleanup attempts did not establish termination, and that limitation is recorded rather than concealed.

## Reproduce and extend

With Go 1.24, Node 22, npm and the browser dependencies available:

```sh
bash run-keyed-editor.sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
# Open http://127.0.0.1:8000/keyed-editor/demo.html
```

The demo exposes Go state/tree/keys/bindings/messages, reply audit, HTTP records, transport order, live input identity and selection. Use held saves to edit/reorder or switch backend before completion. The pending-save screenshot is in evidence/demo-pending-focus-swap.png.

Six Luna 6 XHigh workers filled all six available child slots under the seven-slot platform limit. Native Rebalancer 1.0.4 allocated disjoint author packets and separate cross-reviews, both native/exact600/600 with zero broken constraints. The current Chainspot toolkit branch/PR/probe were inspected. Solver allocation is separate from actual platform dispatch; native Rebalancer does not call LLM APIs. Author gates, real starts, initial findings, final reviewer acceptance and hash bindings are inspectable in coordination/. No extraction-only finish is fabricated.

The demonstrated guarantee is finite, serialized parity for this four-row Go component, explicit key/binding protocol, renderer lifecycle and loopback HTTP lab in the executed Chromium builds. Keys are globally unique ASCII tokens in a finite supported node/attribute subset. Within a backend retained keys preserve actual input objects; across replacement only logical key/selection continuity is claimed. Tests do not prove universal Go/React equivalence, arbitrary sibling-key reconciliation, or generic `Backend.Emit` compilation.

Untested: IME composition, pointer-focus policy, hydration, other engines, pixels, concurrent browser scheduling, production services, authentication, persistence, cross-origin behavior, arbitrary effect executors and unbounded collections. Go state/partial DOM mutations are not transactional across renderer failures. Runtime/session ownership remains exclusive. The inherited response parser's byte limit does not bound browser `fetch.text()` buffering.

Another frontend backend must implement snapshot validation, keyed incremental update, current-path/key dispatch, controlled/disabled properties, event removal fencing, focus capture/restoration, failure notification and unmount cleanup while leaving transitions and effect acceptance in Go. Register it with the host and extend the same independent replay/native/identity suite to a new actor; do not substitute it for the oracle. The next meaningful milestone is to formalize this renderer protocol as a versioned Go-owned conformance contract and bring a third independently implemented backend through the counter, editor and keyed HTTP suites.

Standard-browser GitHub Actions results are checked separately and appended to the PR after execution, avoiding a new source commit merely to record CI metadata.

[Commands](evidence/commands.json) · [Final summary](evidence/summary.json) · [Final traces](evidence/keyed-traces.tar.xz) · [Review acceptance](coordination/review-acceptance.json) · [Coordination protocol](coordination/PROTOCOL.md)
