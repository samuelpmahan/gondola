# Allocation and acceptance

Fresh GitHub inspection found Gondola PRs1–3 unchanged and green, no effects branch, and Chainspot toolkit PR1 at989c295717511c812b69beda5d125817ffc054c9. The current native probe is the unchanged exact file inherited at controlled-input/coordination/current-probe.py (hash in capacity.json). Python native dependency is rebalancer==1.0.4.

The platform reports7 total agent slots including root. Initial live inventory contained root only; six successful Luna6 XHigh spawns used all free child capacity. Native initial solve precedes platform dispatch and records native/exact600/600, no broken constraints and independently checked capacity/eligibility. Actual probe.start events name the real platform agents. Native Rebalancer allocates; it does not call LLM APIs.

All author scopes are disjoint in PLAN.md. Root alone changes Git. Actual author reports, targeted tests and composed fixed browser execution gate the fresh independent-review solve. Review jobs exclude their own author workers. Root delivers those assignments through platform controls, acknowledges actual starts, and preserves each actual reviewer report. Findings are repaired by their original lane owners; initial findings and final rechecks remain inspectable.

Acceptance is explicit data, separate from native extraction completion: author-acceptance.json records the observed author gate and final-acceptance.json binds final author/reviewer reports and source. These files never claim native finish ran. The extraction-only probe cannot accept implementation outcomes; we do not fabricate one. We also avoid the previous milestone adapter's post-review author-freeze limitation by leaving it untouched and recording review amendments directly in the new acceptance receipts. Native state files retain their actual historical running statuses; final explicit receipts record observed completion.

Reproduce allocation with fresh paths:

```sh
python -m pip install rebalancer==1.0.4
python controlled-input/coordination/current-probe.py init --spec async-effects/coordination/spec.json --state /tmp/async-replay/state.json
python controlled-input/coordination/current-probe.py solve --state /tmp/async-replay/state.json --output-dir /tmp/async-replay/solve
```

Equivalent optimum tie assignments may differ. Published receipts describe the actual execution, not deterministic solver tie-breaking or autonomous live-agent dispatch. SHA-256 manifests bind native bundles, specs, starts, author decisions, review findings, final source and executed evidence.
