# XR-G-FIXTURES

**Decision: amend.** The native fixture behavior is supported by a fresh run from the current four-app build output. All four native trace outputs byte-match the retained N5 traces, and the independent probe confirms AppIR role/type metadata, source-forward messages, disabled-action suppression, typed-state boundaries, and the single effect request/reply sequence.

The prior G-FIXTURES receipt's AppIR hashes for `counter` and `effect` do not match the current generated inputs. The current `form` and `list` AppIR hashes do match. The previous `counter` and `effect` AppIR blobs are not present in the workspace, so this review cannot semantically diff those two old inputs or call the hash drift harmless. Current AppIR files match the current `toolchain/build-four/result.json`; rerunning the native CLI from those inputs reproduces the retained trace hashes exactly. Refresh the evidence from the next four-app build and update the two stale input hashes before closing the amendment.

The source-path review confirms:

- `form.View` declares `target.value` and `target.checked` bindings separately from literal event handlers. In the native trace, the literal click keeps `Action.value = "must not replace literal"` while `Message.arg` remains the literal `On.Arg` value `"target.value"`.
- Disabled controls remain attempted actions with no dispatch. The form reset button after reset, list reset after removal, effect request with empty input, and counter reset after reset all have `message:null` and `dispatchId:null`.
- The list starts with `Rows:nil` and ends with a non-nil empty slice. Its typed trace values keep `isNil:true` distinct from `isNil:false`.
- Form state reaches the max safe integer `9007199254740991`, then a further save leaves the count at that boundary. The Go test also checks the list `uint64` add guard at the same boundary.
- The effect app commits `Pending:true`, request count 1, and completion count 0 before the `lookup` / `complete` host reply. The native trace has one request and one correlated completion; the effect test covers a duplicate completion message as a no-op. An extra duplicated HostScript step is rejected as unused.
- Every effect tick retains the IEEE-754 negative-zero bits `8000000000000000`.

The focused Go suite passed on Go 1.24.0. Fresh native CLI runs used the current generated AppIR and produced the following trace counts:

| App | Ticks | Action attempts | Update dispatches | Requests / completions |
|---|---:|---:|---:|---:|
| Counter | 5 | 4 | 3 | 0 / 0 |
| Form | 10 | 9 | 8 | 0 / 0 |
| List | 11 | 10 | 8 | 0 / 0 |
| Effect | 5 | 3 | 3 | 1 / 1 |

The fresh trace files and independent probe are under `coordination/reviews/xr_g_fixtures/`. They were first emitted into a root-level `coordination/reviews/xr_g_fixtures/` by mistake, byte-compared against the nested copies, then relocated. I reran all native commands with stdout and stderr directed to absolute paths under `compiled-frontend/coordination/reviews/xr_g_fixtures/` and removed the duplicate root-level files. No fixture or contract source was changed in this review.

Limits: these native traces deliberately have `dom:null` and call direct Go fixture functions. They do not prove emitted-JavaScript parity, mounted DOM behavior, or physical focus/selection restoration. The list focus witness is metadata for N6's browser lane. The previous AppIR blobs are missing, so the counter/effect hash drift remains unexplained pending a fresh build receipt.
