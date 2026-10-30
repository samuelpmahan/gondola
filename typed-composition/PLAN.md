# Typed composition implementation plan

Goal: demonstrate Go-owned parent inputs and child messages end to end across independently replaceable nested frontend views.

Spec: [DESIGN.md](DESIGN.md). Tech: Go1.24, Node22, pinned React/ReactDOM19.3.1 and Playwright. Existing immutable sessions, collection transitions, effect transport and renderer contract remain the foundation. Root owns Git and evidence; six Luna6 XHigh lanes have disjoint source ownership in [PROTOCOL.md](coordination/PROTOCOL.md). User execution/publication authorization supplies the scoped go-ahead.

## Tasks and dependency gates

1. **Typed Go application (T1).** composition/ defines Inputs, Publication, embedded collection State and Manager. Write boundary tests first, then implement direct-parent admission, revisions, captured saved publications, ordered messages/dirty IDs and defensive snapshots. Verify native/race/vet. Outputs consumed by T2.
2. **Executable boundaries (T2).** New cmd/composition-wasm and cmd/composition-replay expose DESIGN API; WIRE.md fixes JSON format. Test malformed/unknown/duplicate fields, unsafe IDs/revisions, Unicode, wrong arity and rejection invariance; implement bridge and native full frames. Build only after T1 contract exists. Outputs consumed by T5/T6.
3. **Mounted propagation (T3).** Add generic refresh to keyed/multi-root/tree hosts and authoritative snapshot to scoped runtime; add typed composition host. Tests exercise propagation without reinit/remount, errors, stale callbacks, reentry and disposal. Integrate against T1/T2 only after availability. Outputs consumed by T5/T6.
4. **Independent oracle (T4).** Separate JS model over existing independent collection reference, pinned React projection, fixed witnesses and seeded schedules. Model tests assert direct-parent authorization, captured publication data/order, readonly and revisions independently of candidate implementation. Shares WIRE with T2/T5.
5. **Browser/native proof (T5).** New fixture and checker execute actual DOM/React/GoDOM candidate and independent React reference. Record complete raw per-script shards, mismatches and native envelopes; compare full fields and live DOM properties; mutation controls must fail. Integrate after T1..T4.
6. **Executable delivery (T6).** Real HTTP demo and browser smoke: saved child publication, parent policy, pending readonly completion, renderer swaps, disposal/fresh IDs. New runner first executes every inherited gate, then new Go/bridge/Node/demo/replay checks; CI installs standard browser/toolchains. Integrate after T1..T3 and asset contract.
7. **Review and publication (root).** Finish actual native author packets; solve independent cross-review allocation; dispatch reviews with source/report/evidence. Repair concrete findings and re-review. Freeze source and run full entrypoint, preserve failures and original M0 receipts, hash source/assets/raw traces, publish exact tree through feature branch and draft PR. Inspect clean CI when available. Never merge main or deploy.

## Acceptance focus

Failed/stale/wrong-parent calls cannot consume revision/sequence or mutate inbox/messages/dirty state. Readonly gates both native controls and Go event admission, but pending replies still complete. Grandchild messages reach only immediate parent. Repeated messages have distinct ordered sequence IDs. Captured Saved remains stable after later Draft changes. Deleted/disposed children do not redirect to recreated sessions. Cross-session refresh retains shell identity and noncollapsed focused selection. Raw observations and native comparisons are complete and tied to exact source/toolchain versions. Tested finite equivalence and unsupported behavior are stated separately.

## Live ledger

- Baseline observed: PR9 tree22016d, all9 workflows success; current native baseline go test ./... success (some cached).
- Native allocation: epoch00 score600/600, zero broken constraints. All6 actual Luna6 XHigh spawns/start acknowledgements recorded.
- An inherited preflight ran during active author writes and stopped on a partially written new Go decoder; retained as interruption, not baseline failure. Required final runner follows source freeze.
- T3 ownership expanded to multi-root/runtime.mjs snapshot method after discovering scoped runtime lacks authoritative snapshot. No other lane owns that path; native allocation eligibility unchanged.
