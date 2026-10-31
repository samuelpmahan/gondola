# Exact-head CI acceptance

This is an evidence-only continuation of PR11. Application, compiler, runtime, workflow and dependency sources are frozen at repaired head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`, tree `ca99e9432dca87a6bf6718c20186b1223b870126`, parent `408e330517b1dd5e5f865e2ff1914465f98bcf66`. The PR stacks on PR10/base `42df6883337605d901a23e9fed874768c7ce1824`; it is not merged or deployed.

The PR runner actually checked out GitHub's synthetic merge `b51f925399376ec611fedf867503b814b6c1db13`. Its tree is exactly the source tree above; its parents are PR base42df and head184. The preserved primary job log records the exact fetch and `git log -1` result at lines95/125. `provider/checkout-binding.json` records that distinction and log hash. This is not a claim that the runner literally checked out head184, or that its VCS-stamped native binary matches a local build byte-for-byte.

## Distinct execution events

| Event | Head | Evidence and disposition |
| --- | --- | --- |
| Original local acceptance | Original PR11 tree `cd615e4b` | `../../evidence/accepted/`: 33 commands, 81 tests, four apps, five scripts, 43 ticks, 89 mutation controls; zero mismatches. Historical test bytes remain intact. |
| First clean CI | `408e330` | Run41140265213/job124352550636/artifact13019432197. Ten inherited workflows succeeded; the new composed workflow stopped at Node79/81. Both no-WASM tests selected missing `/tmp/chromium`, before guard assertions. No compiled app/demo result exists. |
| Launcher repair and local rerun | Repaired tree `ca99e943` | Only the no-WASM test changed among116 execution-pinned sources. Both tests use the shared configured/managed launcher. `../../evidence/ci-launcher-repair/`: all33 commands,81 tests,five scripts/43 ticks/89 controls and HTTP demo passed using explicit Chromium153.0.8010.0. |
| Repaired clean CI | `184ccda` | Run41144116537/job124365059288 completed success. All11 PR-triggered workflows succeeded. The complete verified compiler artifact records33 passing commands,81/81 Node tests, four apps/five scripts/43 ticks/89 detected mutation controls, zero mismatches and a passing HTTP demo. Independent artifact reviews are recorded below. |

The new compiler receipt ran from23:47:22.384Z to23:48:38.141Z on2026-10-30. Actual versions: root Go1.24.13, compiler/native Go1.27.3, Node22.23.4, React/ReactDOM19.3.1, esbuild0.28.2, Playwright1.64.1 and Chromium156.0.8078.4. Both Chromium-path variables and GOFLAGS were unset. The two guard tests therefore exercised the managed-browser default that failed previously. All116 source pins and209 generated output hashes/byte counts match before/after.

The final unfiltered GitHub snapshot at23:51:16Z shows22/22 successful runs:11 pull-request runs and11 push runs. Detailed retained logs and baseline counts concern the11 pull-request runs; duplicate push logs were not fetched. See `audits/CI2-LEGACY/workflow-runs-unfiltered.final.json` and its independently reviewed packet.

Artifact13020568606 contains124558516 ZIP bytes, SHA-256 `c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e`, with provider expiration2027-01-28T23:22:48Z. `provider/repaired-completed.json` binds the completed run, job and artifact to this head. `provider/repaired-compiled-artifacts.tar.xz` retains all309 compiler files plus the extraction manifest and4 selected inherited reports,314 files total; its SHA-256 is `88c6a9568a7374bd0ff6ac4bda84d70a052285e7fd8eafd53e5a1532d4279eeb` (3490468 bytes). `provider/repaired-archive.json` describes its scope. No large inherited shard is represented as embedded here.

The first extraction ran out of local disk while copying large inherited JSON. Its staging directory was removed without publishing a partial provider. The complete downloaded ZIP had verified already. Root freed1551141547 bytes of ignored old inherited JSON copies, preserving the original ZIP, failed-run archive, manifest and all19 old compiler artifacts. A separate bounded extractor then verified the complete new ZIP and copied every compiler artifact plus inherited reports smaller than1MB. `provider/extraction-recovery.json` records the incident, removed duplicate paths and extractor hashes. This was a local evidence-copy failure, not a CI/application failure.

The retained first-failure ZIP has SHA-256 `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4` and119128377 bytes. `provider/first-failure.tar.xz` retains all19 compiled files, its extraction manifest and selected inherited JSON smaller than1MB. The exact selected list and archive hash are in `provider/first-failure-archive.json`. Large inherited reports and the complete ZIP are not embedded in Git; their hashes and original provider identity remain recorded. No failed run is rewritten as a pass.

## Coordination and review

The unmodified native `probe.py` comes from `samuelpmahan/chainspot-toolkit` PR1 head `989c295717511c812b69beda5d125817ffc054c9` (SHA-256 `5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`), using `rebalancer==1.0.4`. The toolkit PR was checked again before the repaired run; its head was unchanged.

The harness advertises seven concurrent slots including the lead. Six Luna6 workers at XHigh are the maximum child allocation; six actual follow-up deliveries are recorded separately from native solver assignments. `coordination/dispatch.json` and `repaired-dispatch.json` bind ownership and artifact gates. Epoch06 allocated all six repaired-CI lanes, native/exact score600/600, zero broken constraints. A pending artifact is a dependency gate, not an accepted result or evidence of additional capacity.

| Worker | Disjoint acceptance ownership |
| --- | --- |
| N1 | Go1.24/Go1.27 checks, generated compiler inventory and tool versions |
| N2 | Typed native/direct trace equality, message/effect ordering and mutation controls |
| N3 | Mounted DOM/live controls, keys/focus, lifecycle and no-WASM observations |
| N4 | Real HTTP demo, generated assets and screenshot attribution |
| N5 | All inherited workflows, static receipts and predecessor-source preservation |
| N6 | Published head/tree/parents, synthetic checkout and provider-artifact binding |

Each extraction has a dependency-gated review assigned to a different worker. Initial `CI-*` packets close only the failed first attempt; `CI2-*` packets concern the repaired head. `R-CI-LAUNCH` and `XR-R-CI-LAUNCH` preserve the scoped repair and independent acceptance. Native state/events, exact solver receipts, reports and acceptance JSON are inspectable under `coordination/`. Original misplaced receipts and operator path/environment corrections are retained with attribution.

Final closure: **28/28 packets complete, no active assignment, all13 native epochs match the exact maximum with zero broken constraints**. `coordination/verification.json` verifies identity/enums/independence; `closure.json` also checks every amended review has an independently accepted repair. The trace review caught one provenance-label error: PR base42df had been called head184's direct parent. `R-CI2-PROVENANCE` corrected it to parent408 with a separate PR-base field; originals and the initial `amend` remain preserved. `XR-R-CI2-PROVENANCE` accepted13/13 checks, including proof that raw trace data outside provenance fields is unchanged. No application source or tests changed for this metadata correction.

Review dispatches used native epochs07–11: N2 reviewed legacy/N5, N5 reviewed traces/N2, N6 reviewed Go/N1, N1 reviewed demo/N4, and N4 reviewed publication/N6 and browser/N3. The provenance repair was by N2 and reviewed by N1. The final registry-refresh/cancelled replacement incident is explicitly recorded in `closure.json`; no result or extra capacity is attributed to that cancelled session. Original source development has its own earlier34-packet record at `../../coordination/`.

The read-only `coordination/verify.py` and pinned `requirements.txt` are byte-identical copies from the source milestone. The verifier checks packet identity, enums and author/reviewer independence; it does not accept application behavior or dispatch sessions. From the repository root:

```sh
python3 compiled-frontend/ci/2026-10-30/coordination/verify.py
```

## Reproduce and inspect

Use root Go1.24.x, Node22 and toolchain download for the nested pinned Go1.27.3 compiler:

```sh
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install chromium
bash run-compiled-frontend.sh
python3 -m http.server 8080
# http://127.0.0.1:8080/compiled-frontend/artifacts/demo/
```

The default command runs the inherited static/interaction chain before the new compiled gate. `--compiled-only` is an explicitly partial rerun. Use `CHROMIUM_EXECUTABLE_PATH` for inherited gates and `CHROMIUM_PATH` for compiled gates when supplying another binary. In this linked-worktree environment only, `GOFLAGS=-buildvcs=false` avoids Go1.24's invalid ancestor VCS-stamping lookup. Ordinary clean CI runs without it. Build directories/toolchains may change emitted bytes; identical cross-environment binaries are not claimed.

Restore the bounded failed-run subset from this directory with:

```sh
mkdir -p provider/extracted
tar -xJf provider/first-failure.tar.xz -C provider/extracted
mkdir -p provider/repaired-extracted
tar -xJf provider/repaired-compiled-artifacts.tar.xz -C provider/repaired-extracted
# Independently recheck the frozen typed traces and all mutation controls:
node audits/CI2-TRACE/audit-traces.mjs \
  provider/repaired-extracted/compiled-frontend/artifacts
```

Provider extraction is not itself execution acceptance. Read the exact run receipts/logs, selected byte hashes and independent lane reports. The original GitHub artifact has its own recorded expiration; the embedded bounded subset remains reviewable after that expiration.

## Scope

The executable experiment is finite serialized synchronous Chromium conformance for the unchanged counter and three named Go apps, with five deterministic scripts. It covers typed state/tree/bindings, requested intent versus observed messages, DOM/live controls and disabled actions, keyed focus/selection, removed-node callbacks, effect pending state before one correlated reply, duplicate fencing and physical unmount. New fixed scripts have no random seed. The inherited static seed is20261030; inherited generated interaction seeds are separately recorded.

Universal Go semantics/range analysis, arbitrary dependency initializers, a second compiled frontend backend, concurrent React, IME, hydration, pixels, other engines and production transport remain untested. Float64Array-backed GoSlice wrappers and browser-retained callbacks after runtime unmount remain untested. Next coherent milestone: consume the same AppIR and emitted Go symbols with a second compiled DOM backend and run this same native/direct/browser oracle. No application transitions should be duplicated in JavaScript.

The browser audit could not locally rehash three installed dependency manifests absent from the evidence checkout; CI records their versions, and lockfiles/source pins are retained. HTTP smoke captures page/runtime errors and WASM requests; the five conformance profiles separately track WASM API attempts. Neither screenshots nor successful extraction imply pixel equivalence or a universal environment guarantee.
