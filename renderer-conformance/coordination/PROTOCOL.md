# Allocation, ownership and acceptance

Fresh GitHub inspection found PRs1–6 open, PR6 head f3aa80d7af2e6ffa30e9fe5938457e6c980424aa complete with all12 push/PR workflows green, and no overlapping renderer-contract work. This feature branch stacks on PR6. All509 inherited delivery pins verified before implementation and after the temporary E4 script-scope error was reverted. Main is not a landing target.

The platform reports seven simultaneous active slots including root. The initial inventory had only root active and six prior completed workers. Six fresh `gpt-6-luna` / `xhigh` spawns were accepted; a later inventory observed root and all six new workers active. This uses all six available child slots. A total-session-thread limit is not exposed, so none is invented.

Chainspot toolkit PR1/head989c295717511c812b69beda5d125817ffc054c9 was inspected. Its current experiments/rebalancer/probe.py was freshly fetched and exactly compared to the copied probe; SHA-256 is recorded in reconnaissance.json. Actual Python dependency is rebalancer==1.0.4. Both native author and independent-review allocations scored600/600 (native/exact) with zero broken constraints and independent eligibility/capacity checks. Native Rebalancer allocates; it does not dispatch LLM APIs. Real platform spawns/followups and subsequent probe.start acknowledgements are separate receipts.

| Packet | Author | Production ownership | Independent reviewer |
| --- | --- | --- | --- |
| E1 | W4/contract_go | Go contract and CLI | W2/contract_demo |
| E2 | W5/contract_dom | Go DOM package and WASM bridge | W1/contract_adapter |
| E3 | W1/contract_adapter | JS adapter, manifest admission, registry | W5/contract_dom |
| E4 | W6/contract_fixtures | Go fixtures, fixture checks, additive scripts | W3/contract_harness |
| E5 | W3/contract_harness | Four-actor checker and browser probes | W4/contract_go |
| E6 | W2/contract_demo | Demo, runner, README, workflow | W6/contract_fixtures |

Root owns Git, PLAN/RESULTS, evidence and coordination. Native review eligibility excludes each packet's author. Original author reports are copied before repair; review findings and exact negative probes remain alongside final independent rechecks. A native extraction-only finish is not fabricated: final acceptance binds actual code, reports and executed composed evidence separately.

Dependency gates: Go contract API before renderer/client consumption; real nested Go/WASM browser spike before full Go renderer; native Go compile freeze before full inherited runner; generated Go policy before JS/fixture differential checks; fixed composed replay and six author reports before independent native review solve; independent repair rechecks before final composed freeze and publication. Metadata admission precedes Go application init; descriptors remain claims until implementation tests execute. App-independent snapshot fixtures are data doubles, while the four-actor replay uses three actual Go application WASM instances and an unchanged independent React reference.

Two integration findings preceded review: cross-old/new host leases were restored by keeping original runtime identity, and Go/JS trim differences were replaced with the Go-generated messageBlankRunes policy. The original selector-failure report was overwritten by its author and cannot be recovered; a fresh isolated negative control reproduces it and is labeled accordingly. E4 temporarily edited two old script files outside scope, then restored both exactly before the inherited keyed phase; the midrun509-pin receipt and author report document that deviation. Neither event is hidden as a clean first pass.

Reproduce allocation with fresh state paths:

```sh
python -m pip install rebalancer==1.0.4
python renderer-conformance/coordination/probe.py init --spec renderer-conformance/coordination/spec.json --state /tmp/renderer-contract-replay/state.json
python renderer-conformance/coordination/probe.py solve --state /tmp/renderer-contract-replay/state.json --output-dir /tmp/renderer-contract-replay/native
```

Optimal ties may produce another valid mapping. Published assignments describe observed execution. No main merge, production deployment, Slack or email action is authorized by this protocol.
