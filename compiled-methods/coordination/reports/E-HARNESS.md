# E-HARNESS

**Worker N3 · Outcome: confirmed reuse for the bounded value-method profile.** The emitted React GoScript module produced the same 19-tick application trace as native Go when called directly, mounted with the React renderer, mounted with the independent DOM renderer, and alternated between React and DOM after each of the 18 actions. The DOM build was pinned as a separate compiler output; its raw bundle differs from the React bundle, so this report does not claim byte-identical React and DOM modules.

## What was checked

The runner reads the canonical script at `compiled-methods/conformance/fixtures/methods.json` and checks the AppIR method graph against `method-contract.json`. The contract preserves the ten fixture package symbols, typed receiver parameters, multi-result method signatures, and direct call edges to `counter.Init` and `counter.Update`.

The final run used one compiled React module for all browser profiles. Native Go and direct emitted-module traces have the same raw SHA-256 (`d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`). The React, DOM, and swap browser trace hashes also match each other (`5f4337422d692fabafa1dd77ab33273c524c9268ce40046d1fed15b87f031a98`). Each browser profile recorded 19 independent oracle snapshots and 19 physical DOM snapshots; the checker and a separate audit reread every snapshot from the raw records.

| Profile | Ticks | Actions | Oracle / physical snapshots | Swaps | Retired callback fences |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native Go | 19 | 18 | — | — | — |
| Direct emitted module | 19 | 18 | — | — | — |
| React renderer | 19 | 18 | 19 / 19 | 0 | 0 |
| DOM renderer | 19 | 18 | 19 / 19 | 0 | 0 |
| React/DOM swaps | 19 | 18 | 19 / 19 | 18 | 18 |

Four disabled actions (indexes 6, 9, 10, and 17) were physically clicked while disabled, produced no renderer callback, and were recorded as one suppressed action tick each with no message or dispatch ID. The other 14 actions delivered the fixture’s exact message and empty button value. The browser profiles had no page errors or WebAssembly attempts, and each unmount left the physical container and renderer snapshot empty.

Each swap preserved the application tick count, committed the expected current view, emptied and detached the old root, then invoked one retained callback from the retired renderer. The runtime fenced each callback out of band; the trace tick count and Go state did not change. Swaps are recorded separately from the Go application trace.

## Value semantics

The direct probe retained each opaque state object passed to each of the 14 enabled `Update` calls, encoded it before and after, and compared the returned state to the fixture. All 14 original inputs remained unchanged.

The two `PublishSaved` witnesses show the nested value behavior directly:

- Action 4: original `Parent.Count` remained 0; returned `Parent.Count` became 2.
- Action 13: original `Parent.Count` remained 3; returned `Parent.Count` became 1.

Two additional direct calls to the emitted `Update` role tested the Go `ReadOnly` guards for `childAdd` and `childReset`. Each returned unchanged state, left its retained input unchanged, and returned zero effects. These are separately labeled direct method guards; they do not stand in for the browser’s disabled-click evidence.

Four explicit mutation controls rejected a changed state, a missing method call edge, a changed message, and changed DOM HTML. A unit control also injects a shallow-copy regression that mutates nested `Parent.Count` during `PublishSaved`; the retained-input probe rejects it at both publish actions.

## Build and pins

Both compiler manifests identify the same fixture package and stable app path. React and DOM AppIR bytes match at SHA-256 `07d0d25ede9993e1f58e108f4cc153717ff62061ff519b50619615cd4faccd3b`; encoder bytes match at `60302ad92de2fba828a8babdafeafa66f04a05c166ac0d5854019ba9f1ea19e4`. The raw compiled-module hashes are different: React `9260f395881015f56233165936fb5176f181d47a8e1ee5193fdd7e061fbca9ac`, DOM `47b70259d75162989826d6444ca25bea9a8ec603fbc0b81c73912a5191fbde3b`. The React module is the single module exercised through React, DOM, and swaps; the DOM bundle is retained as build evidence.

Attempt 04 captured 188 source pins before and after the run and after checking, plus 149 build/native input pins; the separate audit recomputed every listed hash and byte count. Seven raw evidence files are pinned in `methods.run.json`. The independent raw-artifact audit is `methods.independent-audit-replay.json`.

## Attempts

- Attempt 00 ran direct emitted-module and read-only probes against the immutable N4 React build. It passed 14 retained-input checks and both locked-method probes.
- Attempt 01 preserved native, direct, and browser records but was rejected by an N3 checker mismatch: it expected uppercase Go `Message` fields in the lowercase `gobi.trace/v1` tick. The trace records showed the expected lowercase `{name,arg}` shape. The checker expectation was corrected; no renderer, Go source, fixture, or oracle behavior was changed.
- Attempt 02 matched before the runner added full build-manifest/tree pins and exact Go-version capture.
- Attempt 03 matched after those pin changes. Attempt 04 is the final run and includes the final target-value checks and source pins.
- An initial mutation-control unit test also caught an ineffective synthetic mutation (the replacement value equaled its fixture baseline). The test fixture was corrected to mutate the value; the final focused suite passes 10/10.

All attempt directories are preserved under `compiled-methods/evidence/harness/`.

## Commands and environment

Tool versions: Node `v22.23.4`, Go `go1.24.0 linux/amd64`, Chromium `153.0.8010.0` launched from `/tmp/chromium`. This was a local Chromium execution, not a managed-CI run. No randomized seed was used; the frozen 18-action fixture and swap schedule are deterministic.

Build the native replay binary:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go build -o compiled-methods/artifacts/harness-gate/compiled-native ./cmd/compiled-native
```

Final matrix command:

```sh
GOBI_GO_BIN=/tmp/gondola-go/bin/go /tmp/gondola-node22/node_modules/node/bin/node compiled-methods/conformance/run.mjs \
  --app-ir compiled-methods/artifacts/compiler-gate/react/output/apps/methods-0cac42b0a982/app-ir.json \
  --compiled compiled-methods/artifacts/compiler-gate/react/output/apps/methods-0cac42b0a982/gobi-compiled.mjs \
  --helpers compiled-methods/artifacts/compiler-gate/react/output/apps/methods-0cac42b0a982/encoder.mjs \
  --native-bin compiled-methods/artifacts/harness-gate/compiled-native \
  --fixture compiled-methods/conformance/fixtures/methods.json \
  --output compiled-methods/evidence/harness/attempt-04-final/methods \
  --browser-adapter compiled-methods/browser/runner.mjs \
  --schedule compiled-methods/conformance/swap-schedule.json \
  --dom-app-ir compiled-methods/artifacts/compiler-gate/dom/output/apps/methods-0cac42b0a982/app-ir.json \
  --dom-compiled compiled-methods/artifacts/compiler-gate/dom/output/apps/methods-0cac42b0a982/gobi-compiled.mjs \
  --dom-helpers compiled-methods/artifacts/compiler-gate/dom/output/apps/methods-0cac42b0a982/encoder.mjs \
  --chromium /tmp/chromium
```

Focused checks:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-methods/conformance/run.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-methods/conformance/check.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-methods/conformance/value-semantics.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-methods/conformance/check.test.mjs compiled-methods/browser/dom-oracle.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node compiled-methods/evidence/harness/attempt-04-final/audit.mjs
```

The focused suite passed 10/10. The final matrix exited 0 with `status: matched`, 19 ticks, 18 swaps, and four mutation controls detected. Raw traces, browser evidence, run manifest, and pins are in `compiled-methods/evidence/harness/attempt-04-final/`.

## Limits

This is a fixed value-method composition profile with no effect requests, random replay, focusable input, session manager, ownership, or cancellation behavior. The evidence does not generalize to the full UI or to unsupported receiver forms. N5’s full CI chain remains a separate gate.
