# E-DESIGN-DELIVERY — executable profile and evidence boundary

**Worker:** N6  
**Outcome:** `confirmed_reuse`  
**Reconnaissance:** read-only on PR19 head `a275d646b0d8ceed956b27b6b8f3099e17106857`. No production edits or tests/builds were made.

## Recommendation

Keep this as a distinct `compiled-modules` profile. Reuse the existing GoScript compiler, React and DOM renderers, focused Node/Go test style, explicit-inventory archive helper, and standalone archive-consumer pattern. Do not label the result a backend-qualification certificate: the existing Go certifier's schema and registry describe the separate 13-case React/DOM publication-fault matrix.

The Gate 1 contract now fixes the finite interface: parent and child are separately compiled; `modulewire.Input` is `{Step int, Locked bool, Revision int}` and `modulewire.Publication` is `{Count float64, Revision int}`. The bridge roles are parent `Output(State) Input` / `Receive(State, Publication) State` and child `Input(State, Input) State` / `Publication(State) Publication`. Host code should only validate the role manifest and move primitive fields between roots; Go owns state transitions, lock behavior, input revision, and publication updates. No effects are admitted.

Build parent and child in separate invocations and output directories for each admitted React/DOM profile. Do not share generated GoScript classes across bundles: generate facade adapters that reconstruct destination structs from primitive arguments. Bind the role signatures to an additive, canonical ABI descriptor/hash. Reject incompatible ABI, malformed fields, and non-finite `Count` before calling Go `Init`, updating state, or rendering. Keep that proof separate from renderer swapping: test compatible DOM/React swaps preserving the two roots, and reject an incompatible module candidate without changing the live roots.

Use the selected behavior exactly: `Step` supports 1–3; `Locked` disables Add; Reset is disabled at zero and remains enabled above zero regardless of lock. Parent input revisions advance in Go. Deliver parent `Output` to child `Input` at initialization and after parent events; deliver child `Publication` to parent `Receive` after child events, in the deterministic trace order. Reuse the existing counter state/transitions for the child where the frozen package allows it.

## Minimal executable runner stages

Use one unique attempt directory, write progress/evidence there, and write the final execution receipt only after the independent archive consumer succeeds.

1. **Preflight and source snapshot:** require root Go 1.24, compiler Go 1.27.3, Node 22, pinned package locks and selected Chromium; take the source snapshot against the caller/root-supplied candidate commit. Do not infer a commit label from ambient build output.
2. **Focused tests:** run the modulewire/parent/child/native Go tests, compiler analysis/build/emit tests, ABI-manifest tests, and module runtime/oracle/conformance tests. Run existing counter and M0 regressions in the appropriate CI job; do not relabel them as module evidence.
3. **Fresh native trace:** invoke `cmd/compiled-modules-native` from the tracked fixture scenario. Preserve the exact scenario, native trace, command, stdout/stderr and exit code in the attempt. Keep Go update count distinct from view/checkpoint count.
4. **Independent builds:** compile parent and child separately for React and DOM. Require manifest-resolved module, AppIR, encoder and ABI artifacts; compare each build's exported role signatures to the literal ABI descriptor. Pin each build output and verify that no parent/child GoScript class is shared across bundles.
5. **Semantic conformance:** compare the fresh Go trace and separately authored literal expectations with actual direct and mounted evidence. Cover initialization and post-event bridge delivery, input steps 1–3, lock/unlock, child publications with captured revision, repeated Add/Reset including reset-at-zero, alternating updates, rejected stale/wrong-shape values, and accepted/rejected renderer swaps. Capture actual DOM and React state/view projections and check rejection happens before Go initialization/render. A JS comparator may compare evidence; it must not implement app transitions.
6. **Demo and HTTP smoke:** build the demo from the fresh manifest-listed bundles, serve it locally, and exercise the same typed path in the browser. Record each HTTP/browser assertion and actual observed values; report faults and mismatches as failures.
7. **Freeze inputs and package:** compare source pins before/after, including the module fixtures, native command, ABI contract/manifest, compiler sources, host, conformance/oracle, runner/demo, launch script, workflow, root and compiler Go/package manifests and lockfiles. Pin every generated module artifact, trace, test result, demo bundle and smoke output. Create a sorted explicit file manifest and pre-archive snapshot; archive with a frozen member list and no directory recursion.
8. **Independent post-command consume:** run a separate consumer after tar creation to list, extract and hash every member against the frozen manifest; check source/archive/manifest hashes again after that command. Only then mark final acceptance and seal a unique per-attempt execution receipt. Keep the worker's native E-DELIVERY receipt separate from runtime evidence.

## Source-closure set

The outer source map should be the sorted union of the following and N2's actual compiler-provenance input paths; no path from N2's input set should be exempted from before/after and archive closure checks.

- New module implementation: `fixtures/compiled/modulewire/**`, `fixtures/compiled/moduleparent/**`, `fixtures/compiled/modulechild/**`, `cmd/compiled-modules-native/**`, `moduleabi/**`, `compiled-modules/abi/**`, and the owned `compiled-modules/{runtime,conformance,oracle,demo}/**` paths that actually exist after Gate 1. Pin N2's compiler-helper paths under `compiled-frontend` through their explicit owners/source provenance.
- Compiler and host dependencies: `compiled-frontend/analyze/**`, `build/**`, `emit/**`, `cmd/gobi-build/**`, `frontend/runtime/**`, `frontend/shared/**`, `frontend/react/**`, `frontend/dom/**`, their invoked conformance tests/helpers, `compiled-capabilities/archive-helper.mjs`, and the renderer/runtime or typed-module bridge source imported by the new profile.
- Fixture and oracle inputs: the exact Go fixture tree, scenario JSON, literal expectations, ABI descriptors, mutations and seeded test files. Generated build outputs are attempt artifacts, not substitutes for pinning their source inputs.
- Tool/package boundary: root `go.mod`, `counter/**`, `gobi/**`, `compilercontract/**`, `reactmap/**`; `compiled-frontend/go.mod`, `go.sum`, package metadata and lock; root/interaction package metadata and locks; Node/browser parser inputs; `run-compiled-modules.sh`, `compiled-modules/run.mjs`, demo files, docs, workflow and relevant contract files.

Pin only actual transitive dependencies, but enumerate them explicitly. Keep `.git`, `node_modules`, live output, evidence, reports, coordination and attempt scratch directories out of the source walk. Preserve lockfiles byte-for-byte. Verify the resulting path set against Git at the candidate commit and make the workflow trigger on every source path above, especially compiler analyze/build/emit and shared renderer changes.

## Receipt boundary and limits

`backendqualification.CertifyFile` accepts `gobi.backend-qualification-run/v1`, reads each `gobi.backend-qualification-case-evidence/v1`, and derives a fixed 13-case renderer-fault certificate. `qualificationarchive.Verify` extracts `qualification/qualification.raw.json` and recomputes that certificate. Those types are not the module transition/messaging trace and must not be populated with module data.

The new runner should emit a clearly named execution/comparison receipt for the finite module scenario, with trace and artifact hashes, ABI checks, operation counts, renderer profiles/swaps, test results, exact command/version records, and archive/consumer results. The semantic comparator should consume the fresh Go trace, independent literal expectations, and actual mounted captures; it should not claim a new Go certificate unless a new module-specific Go verifier is explicitly implemented. The generic archive helper can package an explicit inventory, but the publications demo consumer requires its own archive schema; create or adapt a small independent consumer for the module archive schema rather than mislabeling it.

The verified scope should say two Go modules, the declared primitive ABI, the tested fixture/actions, and React/DOM only. It does not establish arbitrary module graph composition, effects, malicious-code containment, authenticated producer provenance, pixels, other browsers or operating systems.

## Hosted CI observation

Read-only GitHub connector results at 2026-10-31 20:24 UTC showed PR19 head `a275d646b0d8ceed956b27b6b8f3099e17106857` with 19 PR workflow runs: 3 successful, 2 in progress, and 14 queued. Portable verification run `41237166990` completed successfully: both `portable-go-verification` and `milestone-zero-regression` jobs passed. The mounted backend qualification run `41237166957` was queued and compiled React/DOM run `41237166931` was in progress. This is not an all-green PR19 claim.

The source hashes, checked-in HEAD/status, commands and CI snapshot are recorded in `module-coordination/rawlogs/E-DESIGN-DELIVERY/read-only-observations.json` and `commands.txt`.
