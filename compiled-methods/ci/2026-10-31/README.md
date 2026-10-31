# Compiled Go value-method composition: executed evidence

This checkpoint supersedes the pending-CI status in the source checkpoint's `compiled-methods/RESULTS.md`. PR [#13](https://github.com/samuelpmahan/gondola/pull/13) adds statically resolved concrete Go value-receiver methods to the existing compiled application path and demonstrates nested counter composition across standalone React and DOM renderers. It reuses `counter.Init`/`Update`, Gobi nodes/messages, the GoScript compiler and existing renderer contract.

Source commit: `6b49cc0bd4c9512a041f723c86b632ec506afd9d`; tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`; direct parent `8ed5b66a223de1992756516f8d3895c6e096f842`. PR base is PR12's feature branch at `195c9433179218348d4b9f2477ae1e0725337d15`. This evidence-only sibling retains that exact source parent; it does not change the PR source, main, or a deployment.

## What ran

All **26 current-head workflows passed**: 13 push and 13 pull-request runs. Primary push [41169518187](https://github.com/samuelpmahan/gondola/actions/runs/41169518187), job `124444234335`; primary PR [41169522175](https://github.com/samuelpmahan/gondola/actions/runs/41169522175), job `124444246247`. Exact status snapshots, source/merge identities and decoded job-log manifests are in `lanes/evidence/`. The lead later fetched the merge-test commit object directly from GitHub (`merge-test-object.json`): its tree matches source and its parents are the exact PR base and head, resolving the reviewer's earlier local-object availability limit.

| Check | Executed result |
| --- | --- |
| Full method runner | `bash run-compiled-methods.sh`: 17/17 outer commands, exit zero; 137 critical inputs stable |
| Milestone0 regression | 5,000 cases at seed20261030; matching receipt and all24 original SHA entries; 59-rule coverage retained |
| Inherited typed composition | 63 scripts, 2,463 actions/native frames, 4,926 actor comparisons, zero mismatches; source-pinned seeds20261030/20261031, 30 cases per seed, max40 |
| Inherited backend/compiler chains | Full backend runner 18/18 commands and compiled frontend runner 33/33 commands, passed |
| Node tests | 97 inherited compiled-frontend tests and 10 method-owned tests pass |
| Fixed method replay | 18 actions, 19 native/direct/React/DOM/swap ticks; zero accepted mismatches |
| Dispatch and disabled controls | 14 ordered messages; disabled intents at indices 6, 9, 10, 17 suppressed |
| Renderer replacement | 18 swaps, 18 retired callback fences; physical snapshots match, unmount snapshots empty |
| Nested value semantics | Capture child value, continue editing, publish saved value; 14 retained-input checks and two direct read-only guards pass |
| Compiler admission | 15 reachable symbols (10 methods, three roles, two original counter functions); unsupported forms rejected, direct builder chains preserved |
| Oracle sensitivity | Four intentional mutation controls detected |
| HTTP demonstration | 14 Go dispatches, three swaps; state and tick count preserved across swaps; final state `{parent:0,child:2,readOnly:false,savedChild:1}`; three assets HTTP200; zero browser errors/WASM attempts |
| Artifact custody | Exact successful provider ZIP, 11,460,089 bytes, 968 files; every member hash and CRC independently verified |

The method script is deterministic and fixed (`compiled-methods/conformance/fixtures/methods.json`); it has no random seed. Inherited randomized suites are separate. Auditors reran the exact retained native executable and emitted module and reproduced the stored trace.

CI versions: root Go **1.24.13**, compiler Go **1.27.3**, Node **22.23.4**, React/ReactDOM **19.3.1**, GoScript **v0.6.2**, Playwright **1.64.1**, esbuild **0.28.2**, managed Chromium **156.0.8078.4**. Local methods-only used Chromium153; its result is not substituted for managed CI.

## Reproduction and executable demonstration

Check out source `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, then run:

```bash
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
bash run-compiled-methods.sh
```

Install the locked dependencies first as shown above. See `compiled-methods/README.md` for prerequisites. `bash run-compiled-methods.sh --methods-only` intentionally omits the inherited chain. After a successful run, serve its generated `compiled-methods/artifacts/attempts/attempt-*/http-demo/site` directory using a static HTTP server and open `/`. The demo exposes both counters, read-only control, capture/publish actions, renderer switches, state, tree, message and lifetime records. Nothing is deployed by this checkpoint.

Restore the exact successful CI output from this evidence checkout:

```bash
cd compiled-methods/ci/2026-10-31
cat primary-artifact.zip.part-* > /tmp/gobi-methods-ci.zip
sha256sum /tmp/gobi-methods-ci.zip
# 95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a
python -m zipfile -t /tmp/gobi-methods-ci.zip
python -m zipfile -e /tmp/gobi-methods-ci.zip /tmp/gobi-methods-ci
python -m http.server 8080 --directory /tmp/gobi-methods-ci/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/http-demo/site
```

Open `http://localhost:8080/`. The original ZIP and extraction are ignored locally; all three exact chunks and the complete member inventory are versioned in `artifact-retention.json`. Evidence audit programs may need their recorded paths adjusted or the ZIP extracted into `extracted/`; their executed commands, stdout, hashes and results are retained.

## Failures, repairs and limits

Initial source `8ed5b66` completed 24/26 workflows; both method workflows failed on producer/harness provenance paths (`builds/request.json`/`result.json` absent). The repair consistently uses per-backend parent request/result files and inventories `output/`. Its entire rejected primary ZIP (957 files) and logs are preserved under `initial-source8ed/`. No failed run is counted as acceptance.

Full local inherited execution remains **incomplete**. A stale `running` receipt was mistakenly reported as live progress; `local-execution-status-correction.json` records the correction. Fresh standalone `bash run.sh` and an explicit 16-command local methods-only run passed; the successful full CI chain supplies the full-run evidence. Source repair reviews also retained RED/GREEN probes for a trusted-builder selection-validation bypass, a semantic-message oracle control, and exact report hash metadata. Broad `go test ./...` inside the nested compiler still encounters unchanged historical source snapshots; scoped live compiler tests/race/vet pass. Historical snapshots and Milestone0 receipts were preserved.

The demonstrated guarantee is bounded synchronous equivalence for the admitted fixture: native and emitted Go state/tree, pinned React and standalone DOM observations, live disabled properties, dispatch order, value capture and renderer replacement. No general external JavaScript object identity/deep-clone guarantee is claimed. Pointer/interface/dynamic/promoted/generic method dispatch, method expressions/values and full Go compilation remain outside admission. This button-only fixture does not add evidence for focus, effects completion, ownership/cancellation, IME, other browser engines, pixels, hydration, concurrent React or production transport.

Another frontend backend must consume the same compiled module and encoder, implement the synchronous renderer/binding/lifetime/focus protocol, and pass the native/oracle matrix and mutation controls. The next composed milestone is typed parent/child lifecycle with pending effects and child-first subtree cancellation through the compiled path, using an explicit admitted ownership representation.

## Assignment and acceptance

Native Rebalancer **1.0.4** (`coordination/probe.py`, unmodified toolkit PR1 head `989c295717511c812b69beda5d125817ffc054c9`) allocated work; platform calls delivered it separately. Source phase discovered five available worker threads and retained a failed sixth allocation attempt; no six-worker source claim is made. After source threads released, six concurrent **Luna6 XHigh** CI workers were actually delivered, filling the six worker slots alongside the lead. `coordination/actual-capacity.json` and state events retain the evidence.

Ownership is disjoint across Go/native, DOM, build/custody, workflow evidence, demo and event ordering. Author packets and independent cross-reviews are in `coordination/reports/` and `coordination/receipts/`; the native state retains dependency gates, allocations and completion events. Global acceptance is recorded separately so lane-local pending snapshots remain honest historical observations. Two cross-reviews required wording amendments: distinguishing fixture-defined expectations from native/direct View equality, and distinguishing the final screenshot (Parent Reset disabled, Child Reset enabled) from the separate zero-value smoke cases. Originals, corrections and independent repair decisions are retained; neither required an implementation change.

Run `python compiled-methods/ci/2026-10-31/verify_checkpoint.py` to recheck both ZIP inventories, the 26 terminal jobs and closed independent-review gate without rerunning browser experiments. The typed-composition nested report is not included in the primary ZIP; its fresh CI log and source-pinned invocation supply the counts and seeds.
