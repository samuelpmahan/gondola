# Allocation, gates and acceptance

Fresh GitHub branches/PR inspection found PR1 counter, PR2 replacement, PR3 controlled input, PR4 async effects unchanged and green. No HTTP branch/PR overlapped. This branch starts at PR4 `cc534cba691ca69f12b6028ed035f7e09794d316`; main is untouched. Previous executed results and PR4 CI job123990950229 were inspected before choosing real HTTP as the next end-to-end boundary.

The platform explicitly exposes seven concurrent agent slots including root. The live inventory initially contained root only. Six successful Luna6 XHigh child starts use all actually available child slots. Native Rebalancer1.0.4 ran before platform dispatch, allocating all six disjoint packets with exact/native score600/600 and zero broken constraints. `native/epoch-00.json` and bundle are the solver evidence; `actual-starts.json` and `author-state.json` separately record acknowledged real agent delivery. Native Rebalancer does not call live LLM APIs.

The current Chainspot toolkit branches and open PR1 were inspected at `989c295717511c812b69beda5d125817ffc054c9`. Its probe.py Git blob is `30ebd9bc4b4ed80e41ffd9c20ce29fd859138647`; the exact copied probe hash is in reconnaissance.json. The PR's execution loop is local emulation, not platform dispatch. No worker capacity beyond observed slots is claimed.

Author ownership and dependency gates are in ../PLAN.md. Root alone changes Git, coordination receipts, evidence and RESULTS. Each author owns a disjoint implementation surface. Codec, reference, transport and server gates precede full composed execution. A second native solve assigns independent cross-review jobs with the author's worker excluded. Review findings are returned to the original author for repairs, then the independent reviewer rechecks. Initial findings and final receipts remain inspectable.

Root acceptance binds actual reports and final source hashes separately from native extraction finish. No implementation/review outcome is misrepresented as an extraction receipt, and historical inherited ledgers remain unchanged. Reproduce allocation using a fresh state directory:

```sh
python -m pip install rebalancer==1.0.4
python http-effects/coordination/probe.py init --spec http-effects/coordination/spec.json --state /tmp/http-replay/state.json
python http-effects/coordination/probe.py solve --state /tmp/http-replay/state.json --output-dir /tmp/http-replay/solve
```

Equivalent optimal tie assignments can differ. Published actual receipts, not deterministic tie-breaking, describe this run. No main merge or production deployment is authorized by these receipts.

## Actual ownership and review map

| Packet | Author worker / agent | Owned implementation | Independent reviewer |
| --- | --- | --- | --- |
| E1 | W4 / http_go | httpwire; cmd/http-save-wasm | W2 / http_server (XR-E1) |
| E2 | W5 / http_transport | fetch transport and its tests | W1 / http_ref (XR-E2) |
| E3 | W1 / http_ref | independent HTTP reference and scripts | W5 / http_transport (XR-E3) |
| E4 | W6 / http_harness | real HTTP browser harness and drop probe | W3 / http_demo (XR-E4) |
| E5 | W3 / http_demo | demo, runner, README, CI | W4 / http_go (XR-E5) |
| E6 | W2 / http_server | Go HTTP lab/server CLI | W6 / http_harness (XR-E6) |

The independent-review allocation also scored600/600, zero broken constraints. Actual live inventory after dispatch contained root plus all six running Luna workers. Initial author reports are preserved at author-initial/E1.md through E6.md; every copy matches its originally recorded author-acceptance hash. Amended current reports and final review rechecks are bound separately. Root recovered E1's pre-amendment paragraph only after its exact bytes matched the pre-existing SHA-256; no guessed historical text was accepted.

Independent reviews retained concrete amendments: E1 needed explicit native response-ID boundary tests despite correct implementation; E5's source-digest root list missed counter/ and its standalone default omitted the static gate. E1 gained the tests; E5 now hashes source/config inputs plus every signed manifest path and runs the static gate before inherited interactions. Original AMEND findings and final rechecks remain in the XR reports. Executable independent decoder and harness-negative probes are checked in beside their review receipts.
