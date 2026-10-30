# Typed composition: execution and scope

Go now owns direct parent-to-child `Inputs`, revision admission and child-to-parent saved-row `Publication` receipts over the existing immutable session tree. Existing DOM, React and direct Go/WASM renderer implementations consume the extended opaque application state and Gobi tree. Host refresh is additive and does not reinitialize the Go session or remount another session's renderer.

This branch stacks on published PR9 head `d6d425765ee9d48eae22342a3cb75fab2e2871ba`, tree `22016d39285f9d2776530f404a0cb5acbdf7f5c6`. PR9 and all nine of its workflows were inspected before choosing this milestone; the counter and nested lifecycle work were already complete. No overlapping typed-composition branch or PR was found. Main is not merged or deployed.

## Reproduce

```sh
bash run-typed-composition.sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
# Open http://127.0.0.1:8000/typed-composition/demo.html
```

The default entrypoint runs the complete inherited `run-session-tree.sh` suite first, then builds the new Go/WASM bridge, direct Go DOM bridge, native action replay and matching Go runtime; bundles the pinned React reference; and runs Go/race/vet, actual WASM admission smoke, Node tests, real HTTP demo and deterministic browser/native replay. Required toolchains are Go1.24 and Node22. Provisioning flags skip dependency/browser installation only, never test gates.

Local commands use:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
  GOTOOLCHAIN=local CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
  bash run-typed-composition.sh
```

Observed local versions: Go1.24.0 linux/amd64, Node22.23.4, React/ReactDOM19.3.1, Playwright1.64.1, actual Chromium153.0.8010.0. Standard-browser clean CI is a separate execution. New build hashes identify executed assets; Go toolchain and VCS build metadata can change rebuilt WASM bytes without changing application traces.

## Acceptance checkpoint

The final source-frozen local replay exited zero on 2026-10-30: **63 scripts, 2,463 actions, 63 native Go executions, 2,463 native frames, 4,926 candidate/reference actor-to-native frame comparisons, zero mismatches**. Seeds are20261030/20261031,30 generated cases per seed, maximum40 actions; fixed scripts have23/14/26 actions. All49 executed source/build pins matched before the run, the checker report and the after capture. Summary SHA-256: `6944e09e7ef7af2ea492799d701f0ee7fa830a3702bfbcdb7bf743c7537dbd01`.

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
  GOTOOLCHAIN=local CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  COMPOSITION_REPLAY_BIN=typed-composition/build/composition-replay \
  node typed-composition/check.mjs --seeds 20261030,20261031 \
  --cases 30 --max-actions 40 --output typed-composition/build/accepted-full-report.json
```

[Execution and source-pin receipt](evidence/final-execution.json), [summary](evidence/final-replay-summary.json), [terminal log](evidence/final-replay.log) and `evidence/accepted-full-traces.tar.xz` retain all complete raw scenario/native envelopes and controls. Native executions are whole scripts; frame comparisons are two actors per action, not4,926 separate native executions. All47 current typed-composition Node tests pass. Wrong-parent and stale-revision calls reject without mutation; inbox-order and actual DOM-disabled mutations are detected; a captured retired callback delivered after same-name recreation makes no Go completion call and leaves fresh state unchanged.

Independent offline controls start from a passing14-action scenario and reject missing required focus, missing bilateral effect/transport channels, bilateral invocation reversal, omitted command execution, changed rejection outcome and inconsistent disabled observations. Error prose alone is intentionally outside equivalence. Every disabled input attempt now records real native suppression, unchanged physical value/full Go snapshot and zero native dispatches, followed by a separately labeled no-op Go guard probe. A real shared per-side invocation clock and transport-bound host generations are checked against Go effect drains/disposal bundles.

The complete inherited entrypoint passed before the same process entered a new-oracle phase that overlapped active observer repairs. That combined process ended with248 diagnostic findings and exit1; it is not called a clean full-run pass. Current runtime/core source passed the inherited suites below; after observer freeze, the affected47-test suite and full new replay were rerun successfully. The unchanged runner wiring is additionally verified by clean-checkout CI after publication, recorded separately in dated PR metadata.

| Executed inherited gate | Result |
| --- | --- |
| M0 | 5,000 cases /seed20261030; expected receipt and all24 signed entries pass |
| Counter | 107 scripts /4,473 ticks |
| Replacement | 103 scripts /5,249 ticks |
| Controlled input | 216 scripts /10,149 observations; native matched |
| Async /HTTP | 76/1,552 and82/1,572 scripts/observations; native matched |
| Keyed collection | 70 scripts /1,113 observations; native matched |
| Renderer contract | 71 scripts /1,184 observations; native matched |
| Multi-root | 63 scripts /1,896 actions /11,754 actor observations;193 native segments matched |
| Nested tree | 63 scripts /1,591 actions /1,654 ticks /10,352 actor observations;546 native comparisons matched |

Go/race/vet, actual WASM admission smokes and real HTTP demonstrations also passed in that entrypoint. [Full inherited/mixed log](evidence/inherited-and-mixed-oracle.log) and its [terminal receipt](evidence/inherited-and-mixed-oracle-execution.json) preserve the exact boundary. The [historical archive index](evidence/history-index.json) distinguishes all failed, mixed-source and superseded preflights from accepted execution.

The [actual demo capture](evidence/typed-composition-demo.png) and [Go/HTTP snapshots](evidence/typed-composition-demo.json) show a child saved through the real loopback lab, published into the parent inbox, then rendered in GoDOM with parent-supplied read-only policy. Screenshot pixels are demonstration material, not a pixel-equivalence assertion.

## Historical producer and review evidence

- Original static comparison was independently executed: `go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json` returned `same over 5000 inputs; receipt matches`. All24 original `SHA256SUMS` entries verify. A fresh uncached all-package Go run also passed after the producer-stage parser correction.
- Focused real HTTP demo mounts parent and child Go sessions; a held child save completes while read-only; DOM→GoDOM→React replacement retains saved state and selection; native Publish captures `Saved`, `Saves`, child/parent IDs and revision into the parent's inbox. Disposing the child retains the parent receipt; recreation allocates a fresh ID.
- Three fixed browser/native scripts initially matched63 action frames (126 actor-native frame comparisons). These preflight numbers do not describe the later default seeded run.
- The first exploratory default run retained **63 scripts /2,463 actions /2,463 native frames /4,926 actor-native frame comparisons and369 findings**. Raw requested LF values differed from text-input effective values; a focus-selector error was also found. A selector edit happened during that run, so it is not a frozen acceptance execution. Reports retain the then-unavailable Go-on-PATH metadata rather than retroactively rewriting it. New script metadata records `actionIndex`, requested string, effective string and key; actual browser observations must verify the effective dispatched value.
- Source review reproduced a strict WASM admission failure: an own Title getter called `create()` and allocated Go ID3 even though the enclosing input call failed; a proxy supplied inherited values as apparent fields. Exact pre-repair WASM, source checkpoint, original probe and raw results remain preserved. The repair reads own data descriptors and fences synchronous nested API calls during admission.
- A separate actual public-host probe proved argument cloning could invoke getters and erase an unknown symbol before strict Go admission. The host now forwards argument objects unchanged. Original failing and post-repair probe results remain distinct.
- A producer-stage `Complete` wrapper discarded an invalid-reply error. It now returns the original error with the unchanged snapshot; direct Go tests cover zero and unsafe IDs, audit and dirty-state invariance.
- The independent model's first unsaved-row test actually addressed a missing row. A causal test now exercises an existing empty-Saved row, direct rejection, disabled click suppression, unchanged parent/child/message/dirty state and first accepted sequence1 after saving.
- The HTTP demo smoke initially lost toolbar focus before replacement and issued duplicate release clicks. Both were repaired. Review then found early-exit cleanup could hang; the first cleanup repair still mistook a post-start process error for exit and ignored unsuccessful shutdown. A second bounded repair distinguishes error from observed exit, tries SIGKILL when needed and fails the smoke on residual/unsuccessful cleanup. Original amendments and independent probes are retained.
- An inherited preflight stopped when `go test ./...` saw a new decoder mid-write. A later complete entrypoint lost its execution handle; the service returned `Unknown process id19543`, no matching process survived, and no final exit code was available. Its log ends during keyed checks and is explicitly unaccepted. The restarted execution captures terminal status separately from the log.

## Preservation and coordination

The independent preservation audit verifies all24 signed M0 checksum entries, identical checksum/expected receipt bytes, and byte-identical eight predecessor delivery manifests. Across796 predecessor pin entries,788 match: four intentional generic host/test refresh changes and four already-existing PR8 exceptions account for the remainder. Four additional multi-root host/runtime refresh paths were not pinned by those predecessor maps; this is not an unchanged-byte claim. The project README gains an index section. Six preflight sample hashes are PR9 baseline samples, not all M0 originals; the audit corrects that early label using actual M0, PR9 and current README hashes. No historical manifest is rewritten.

Six Luna6 workers at XHigh filled all six child slots, with the lead in the seventh. Native Rebalancer1.0.4 and the current toolkit PR1 probe allocated disjoint author lanes before actual platform dispatch. Source reviews exclude authors. Repairs, original amendments, reuse audits, cross-graph availability gates, native starts/finishes and actual producer/reviewer receipts remain inspectable under [coordination](coordination/PROTOCOL.md). The native solver allocates; it does not invoke agent APIs. Acceptance still requires current source reviews and fresh execution, rather than completion tags alone.

## Demonstrated boundary and remaining work

The accepted finite serialized Chromium profile compares full Go/model state, Gobi trees/bindings/messages, input revisions, ordered immutable inbox receipts, dirty refreshes, mounted DOM/live input and disabled properties, replacement focus/selection, pending completion under read-only policy, and disposal/recreation callback fencing. Test results establish only the cases actually recorded. The independent three-backend browser probe confirms zero runtime dispatch and unchanged state/value for disabled click and real mouse/keyboard attempts; its retained DOM event log covers the click phase only. No ignored cancel or later-generation reuse of the same physical root was observed in the new fixed traces; those limits remain explicit in source review. Rejected structural calls are not an authentication system or JavaScript sandbox; arbitrary JavaScript effects are not rolled back. Already committed Go transitions and partial renderer failures are not transactionally reversed.

No generic component compiler or `gobi.Backend.Emit`, typed component factory, reparenting, transitive input inheritance, shared application transactions, production service/authentication, network arrival ordering, IME, hydration, pixels, other browser engine or concurrent React scheduler equivalence is established.

Another renderer must implement the versioned Go renderer manifest and independent-handle lifecycle; admit the supported opaque state/tree/bindings; dispatch declared literal and input messages; preserve keyed controlled values and selection; support in-place host refresh; and retire callbacks cleanly. It must pass renderer fixtures and this typed composition replay. A new application also needs its Go session factory and independent oracle. The next meaningful milestone is a Go-defined component factory and typed composition declaration that mounts distinct existing components through the same backend contract.
