# Executed local acceptance

Source baseline: PR11 head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`. The branch and open-PR inventory was checked again before publication: PR1–11 remain open and no overlapping compiled-backends branch exists. Toolkit PR1 remains at `989c295717511c812b69beda5d125817ffc054c9`; `coordination/probe.py` is its unmodified native probe, dependency Rebalancer1.0.4. Six actual Luna6 XHigh child workers occupied the six available child slots (seven total including root). Root supervised integration and Git; implementation and cross-review have separate authors.

## Current-source runs

Local versions: root Go1.24.0, compiler Go1.27.3, Node22.23.4, React/ReactDOM19.3.1, esbuild0.28.2, Playwright1.64.1 and Chromium153.0.8010.0. Exact command arguments, environment overrides, start/end times and output digests are in the retained execution JSON/logs.

```sh
GOFLAGS=-buildvcs=false GOTOOLCHAIN=local \
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
bash run-typed-composition.sh

GOFLAGS=-buildvcs=false CHROMIUM_PATH=/tmp/chromium \
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
bash run-compiled-frontend.sh --compiled-only

GOFLAGS=-buildvcs=false CHROMIUM_PATH=/tmp/chromium \
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
bash run-compiled-backends.sh --backends-only
```

All three passed. They are separate local executions, not a claimed uninterrupted default-entrypoint run.

| Gate | Observed result |
| --- | --- |
| Original static rendering | 5,000 cases; seed20261030; 59 executable rules; all24 original SHA-256 receipts intact |
| Inherited typed composition | 63 scripts; 2,463 actions/native frames; 4,926 actor comparisons; seeds20261030/20261031,30 cases,max40 actions; zero mismatches |
| Current compiled frontend | 33 commands;97/97 Node tests; Go test/race/vet; five scripts,43 ticks,89 mutation controls; zero mismatches |
| React/DOM builds | Four apps,209 outputs per backend;204 byte-identical companions; raw bundles separately pinned |
| Backend matrix | Counter/form/list/effect/list-growth;43 logical fixture ticks; React-only,DOM-only,alternating profiles;37 swaps,9 focused swaps;45 detected mutation controls; zero mismatches |
| HTTP demonstration | Five checks; four cards; state/focus/backward selection/stale callbacks/pending effect; no page errors or WASM requests |
| DOM independence | Actual compiled counter0→1→2→0;7 esbuild inputs; no React packages/adapters/externals; no WASM/fetch/XHR/page errors |

The current compiled-frontend receipt has122 matching before/after source pins; the composed backend receipt has126. Both backend output sets have matching before/after SHA-256 hashes after resolving their differently based paths; before byte counts were independently rechecked. All1,251 tracked inherited paths outside the isolated compiled-frontend subtree remain identical to baseline. These counts describe their explicitly enumerated pin sets, not every repository path.

## What this establishes

For these finite serialized synchronous Chromium fixtures, native Go and emitted JavaScript agree on typed state, Gobi trees/bindings, declared versus observed messages and values, dispatch/effect ordering, mounted DOM/live controlled properties, disabled controls and keyed updates. Backend replacement preserves the cached View, state and pending effect correlations without rerunning Init/Update/View. Focus and backward selection restore by logical identity onto new physical nodes. Runtime tests and independent semantic probes cover synchronous return validation, rejected Promise handling, reentrancy, failure phases and queued completion cancellation. The DOM-only proof establishes that React is not required to boot the compiled counter.

The list lifetime record separately probes a retired React callback (out-of-band fence, no tick) and an active renderer missing-target driver callback (suppressed tick). It does **not** establish invocation of an actual retained native DOM event listener. Explicit runtime dispatch/stale attempts after unmount produce suppressed ticks; physical roots remain empty.

Untested: arbitrary Go/libraries/initializers, universal equivalence, Float64Array GoSlice wrappers, concurrent React, hydration, IME, pixels, other browser engines, production HTTP transport, committed-state rollback, compiled nested sessions/typed parent-child ownership. Raw bundles from separate build directories are not byte-identical and are not normalized to imply equivalence.

## Preserved failures and review repairs

Author and independent-review packets retain concrete failures and repairs: DOM attribute insertion order; React controlled-checkbox serialized attribute on remount; focus witness scope; retired-versus-active callback classification; zero-valued exported backend panic; strict restore results; synchronous observation/unmount return checks and rejected-Promise handling. Amended reviews resolve through independently reviewed repair packets rather than rewriting the original decision.

The first inherited run failed because a review reproduction `.go` file under the root was discovered by Go1.24 tests and imported the nested Go1.27 compiler module. Its bytes were preserved as `.go.txt` and reproduced from a temporary file under the correct module. The second complete inherited run passed; no root module workaround was added.

Demo attempt01 failed on a Node URL/path import; its complete artifacts were overwritten before preservation and are unavailable. Attempts02 and03 retain full checksummed archives (HTTP root containment guard, then callback diagnostic array-length assertion). Harness attempts06–09 retain earlier failures/partial runs; attempt10 is the final separately reviewed full matrix. Historical source pins are not presented as current-source passes.

## Retention and reproduction

`evidence/accepted/archive.json` gives the SHA-256, byte count and verified member count for `local-artifacts.tar.xz`. Every file in both current artifact directories, including generated Go/TypeScript/JavaScript, native executable, browser traces, demo/screenshot, logs, independence proof and retained failed attempts, is included. `artifact-index.json` pins every member. Extract from repository root with `tar -xJf compiled-backends/evidence/accepted/local-artifacts.tar.xz`; original absolute paths in receipts remain provenance. Selected receipts and the typed aggregate report are also readable outside the archive. Large inherited build intermediates are reproducible from recorded seeds but are not all retained.

The two extra E-RUNTIME files under `compiled-frontend/coordination/` are the original misplaced initial packet. Byte-identical copies under this milestone's coordination directory are authoritative for native acceptance; both are retained to preserve attribution/history. Existing PR11 DELIVERY and evidence remain historical snapshots and are not rewritten to claim these new source bytes.

No main merge or deployment. The next coherent milestone is compiling the existing typed parent/child and session ownership contracts through this dual-renderer path, including subtree cancellation, pending effects and independent root replacement.
