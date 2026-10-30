# Assignment and acceptance receipts

Six child slots were actually available (seven sessions including the lead). Six Luna6 (`gpt-6-luna`) sessions were requested at `xhigh`, with disjoint author paths in DESIGN.md. The live inventory observed all seven running. Resumed sessions and changed labels are explicit in state events and `dispatch-resume.json`; old session labels are historical, not extra capacity.

The unmodified `probe.py` is from toolkit PR1 head `989c295717511c812b69beda5d125817ffc054c9`, Git blob `30ebd9bc4b4ed80e41ffd9c20ce29fd859138647`, SHA256 `5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`. Native dependency is `rebalancer==1.0.4`. Rebalancer allocates ready packets and pins in-flight work; platform `spawn_agent`/`followup_task` calls actually deliver agent work. A native `start` is an operator acknowledgement, not proof that the solver called an LLM API.

The graph grew through explicitly hashed bounded repair/audit specs. Native bundles and JSON decisions are in `native/`; `state.json` retains allocation, start, completion, session-rebind, extension and schema-correction history. Six authors initially scored600/600 with no broken constraints; later solves independently check capacity, eligibility, independence and exact maximum score. An idle eligible set can be empty at a dependency gate; no synthetic workers or throughput claims are introduced.

Reports and receipts retain original amendments and partial findings. Every author packet has a separate native review packet that excludes that author. `mixed_change` means work was implemented, not accepted by a reviewer. `insufficient_evidence` remains such even when a reviewer accepts its honest limited attribution. Final current-source acceptance is based on the executed root receipt plus independently reviewed repairs and the final five-profile replay; it does not rewrite earlier failures as first-pass success.

`verify.py` checks completed receipt identity, native enums and author/reviewer independence. It does not accept code or dispatch agents. Unsupported receipt labels were preserved under `reviews/history/` before mapping only their schema fields to supported labels. A misplaced review amendment was restored from its original recorded content; its mistaken draft remains preserved. A verifier invoked by one reviewer rewrote another lane's summary with identical bytes; the scope violation is recorded.

```sh
python -m venv /tmp/gobi-rebalancer
/tmp/gobi-rebalancer/bin/pip install -r compiled-frontend/coordination/requirements.txt
/tmp/gobi-rebalancer/bin/python compiled-frontend/coordination/probe.py packet \
  --state compiled-frontend/coordination/state.json \
  --receipts-dir compiled-frontend/coordination/receipts R-CONFORMANCE
python compiled-frontend/coordination/verify.py
```

Source and raw trace paths in reports refer to exact local executions. Heavy raw browser captures are preserved in `../evidence/conformance-captures.tar.xz` and the accepted build in `../evidence/compiled-artifacts.tar.xz`; extract them as documented in README.md. Some older filenames/source hashes represent unavailable historical blobs and are explicitly not reconstructed. No main merge or production deployment is performed.
