# E-CONSUMEV4AUDIT — independent review of the frozen v4 consumer candidate

**Worker:** N1  
**Job:** E-CONSUMEV4AUDIT  
**Decision:** `accepted` — accepted as a v4 source-preflight contract review only. No clean-archive consumer acceptance is claimed.

## Review conclusion

The frozen v4 consumer candidate addresses the snapshot and command-binding gaps from the earlier acceptance audit. It validates strict count types and exact field sets, derives event and application totals from arrays, binds the 19-command archived snapshot prefix to the 20-command E-RUN receipt (one post-archive consumer), and keeps three archive helper commands separate. Mutation-control results must cover four named scenarios and the exact 16 reviewed control IDs in each, with aggregate totals derived from those arrays. The pinned test inventory is derived from all test sources in the pinned source closure.

The candidate requires the declared source closure and explicitly validates the absent root `go.sum` against the pinned `go.mod`. Native builds and replays run from the restored `destination/source` tree with Go caches under the consumer evidence directory and `GOPROXY=off`, `GOSUMDB=off`, and `GOWORK=off`. The browser helper imports the module loader from the extracted source tree, checks the loader bytes against the archived build index pin, then loads the direct runner, oracle, and scenarios from that same extracted source tree. The consumer source contains no hardcoded original checkout path.

I copied and reran the saved 45 snapshot/count/command/control probes and 9 lifecycle-order probes under this review’s rawlogs directory. Both outputs are byte-identical to the frozen v4 preflight outputs: 45/45 and 9/9 expected outcomes. Candidate Python and browser helper syntax checks also passed. These probes use author-only/schema fixtures: the 45-case suite synthesizes clean flags from a dirty author receipt, and the lifecycle suite checks an author-only trace. They test validation rules; they do not qualify an archive.

## Historical run and relocation boundary

The preserved F6 attempt `accept-e6460df3-v3-attempt03` records a successful restore receipt for 638 archive members and 201 source pins, followed by four native Go replays that were byte-equal and canonical-JSON-equal to the archived results. The full v3 consumer then failed when the archived, pre-repair loader rejected its recorded build context as belonging to a different checkout. That failure happened before relocated direct-profile and browser consumer completion, so it is not v4 acceptance evidence.

The separate E-RELOCATE packet now records five focused tests passing with copied source and original-checkout reads blocked. It used a temporary copied build index with only the repaired loader self-pin updated; the archived F6 index still pins the old loader. This is focused relocation evidence, not a fresh clean archive run. A new clean source-bound archive and full v4 consumer run remain necessary for end-to-end qualification.

## Browser evidence boundary

The saved browser-only archived-demo diagnostic reports six steps, 12 programmatic `HTMLElement.click()` activations, two timer replies, three renderer swaps, and removal/remount of child `b` from generation 1 to generation 2. It records four local requests, zero external request attempts, and zero page, console, request-failure, or HTTP errors for that demo-only run. The helper blocks nonlocal request origins and treats attempted external requests as failure. Its lifecycle assertion checks ordered Go unmount, committed state, declared cancellation, transport cancellation, and renderer teardown.

That run did not execute the complete relocated direct-profile plus browser consumer against a fresh clean source-bound archive. The screenshot is explicitly illustrative; pixel equivalence is not asserted. DOM `.click()` is programmatic activation and does not establish trusted pointer or OS input. No broader browser or publisher-authenticity claim is made.

## Decision boundary

I accept the v4 source and saved contract probes for this preflight review. The independent archive consumer remains unqualified pending a fresh clean archive/source-pin-bound run that completes restore, all four native replays, relocated direct profiles, and the browser demo using the repaired archived loader. The report and receipt preserve this limit. Exact commands, source pins, probe copies and results, and historical diagnostics are indexed in `rawlogs/E-CONSUMEV4AUDIT/index.json`.
