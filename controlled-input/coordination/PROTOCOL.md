# Native allocation and observed acceptance

Fresh reconnaissance found only Gondola PRs #1/#2, unchanged with green executed counter/replacement evidence, and Chainspot toolkit PR #1 at `989c295717511c812b69beda5d125817ffc054c9`. Its current `experiments/rebalancer/probe.py` differs from the inherited `interaction/coordination/evidence/probe.py` only by one trailing blank line. The exact current GitHub blob is archived as `current-probe.py`; its Git blob SHA is `30ebd9bc4b4ed80e41ffd9c20ce29fd859138647`. Initial allocation used the semantically identical inherited copy; fresh review allocation uses the exact current copy. Rebalancer is pinned to 1.0.4. No overlapping input lane existed.

The platform exposes seven concurrent agents including the lead. `collaboration.list_agents` initially showed only root; six successful Luna6 XHigh spawns used all available child slots. Native solve precedes dispatch; `initial-solve/epoch-00.json` and its native binary bundle preserve recommendations, scores, eligibility and capacity checks. `initial-native-state.json` preserves subsequent actual `probe.start` acknowledgments with real platform agent identities. The native solver does not call the agent API.

The unchanged `backend-replacement/coordination/adapter.py` is reused with a new ledger and paths. Its historical schema/run_id label says renderer replacement; this ledger belongs to the input milestone via its initial spec and receipt paths. Reuse does not rewrite any earlier ledger or source. It requires accepted author receipts for all six jobs before preparing a fresh review spec, excludes each author, invokes native init/solve, and independently checks score600, capacity, eligibility and all author exclusions. The lead delivers those recommended reviews with platform controls and separately acknowledges each actual start. Full author and independent review reports are preserved alongside acceptance JSON receipts.

Legacy native `finish` validates extraction outcomes, not implementation/review reports. We do not fabricate one. Native archived jobs remain historically `running`; the explicit acceptance ledger records the actual result decisions, receipt hashes and source reports. Author amendment decisions preserve earlier attempts and block readiness until accepted. Root owns Git and acceptance; author writes are disjoint as specified in PLAN.md. Execution of the real browser harness is gated on Go runtime, both renderers and built assets.

Reproduce initial allocation in a fresh output directory:

```sh
python -m pip install rebalancer==1.0.4
python controlled-input/coordination/current-probe.py init --spec controlled-input/coordination/initial-spec.json --state /tmp/input-replay/state.json
python controlled-input/coordination/current-probe.py solve --state /tmp/input-replay/state.json --output-dir /tmp/input-replay/solve
```

Assignment ties may produce another equally optimal eligible mapping. The checked-in solve and platform identities describe the actual execution, not a claim of deterministic solver tie-breaking or autonomous LLM dispatch. Subsequent review evidence records the fresh solve used for the real cross-review.

## Final repair acceptance

Independent reviews found and repaired the React accepted-attribute mismatch, the DOM null-response sentinel bug, and weak adversarial assertions. Initial findings and final rechecks are both preserved. The inherited adapter freezes author receipts after review preparation; its attempt to import a repaired author result failed with `author results are frozen after a cross-review spec is prepared; create a new run for later work`. Its observation API can mark an amendment but cannot accept its repair, and its review recorder then requires those author states accepted. We preserve this actual historical state rather than rewriting the adapter or resetting its ledger.

`final-acceptance.json` is the explicit lead-owned acceptance of the actual final author reports and six independent final reviews. It binds every receipt/report with SHA-256, verifies each reviewer against the native assignment and excludes authors. It does not claim the inherited adapter accepted the final imports or that native `finish` ran. The final delivery manifest binds the implemented source and executed regression evidence. The original six-author gate did precede the fresh review solve; later amendments and rechecks stayed within their original disjoint packets.
