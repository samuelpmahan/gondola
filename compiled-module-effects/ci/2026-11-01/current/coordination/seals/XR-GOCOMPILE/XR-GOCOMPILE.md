# XR-GOCOMPILE — independent review of the sealed compiler and native Go packet

**Reviewer:** N3  
**Decision:** `accepted`  
**Score:** 200/200; broken items: 0  
**Reviewed packet:** original sealed E-GOCOMPILE only (`module-effects-coordination/seals/E-GOCOMPILE`)  
**Base:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Source identity

The sealed report and receipt match `seals/E-GOCOMPILE/seal.json`. All 10 source-inventory files match their declared byte lengths and SHA-256 values, and the same 10 files in the isolated base-plus-sealed-source checkout match those pins. The published E-GOCOMPILE report and receipt are byte-identical to the sealed copies.

The Go 1.24 and Go 1.27.3 checks ran against `/tmp/gondola-xr-gocompile-original`, made from the pinned base commit with only the sealed E-GOCOMPILE source overlaid. The native child and CLI tests passed, and the full `compiled-frontend/analyze` package passed.

## Review findings

The child parser directly calls `strconv.ParseUint(value, 10, 53)`, rejects parse errors and zero, explicitly rejects leading-zero spellings, checks the safe-integer maximum, and requires a canonical `FormatUint` round trip. Completion checks the exact pending token stored by Go. That stored token is regenerated from Go-owned key, generation, and request ID; callback input is not parsed to choose identity.

The analyzer admits only an `OpCall` for the exact `strconv.ParseUint` symbol with constant base 10 and bit size 53. The source diff adds this call-site check without changing the generic call allowlist or integer arithmetic/conversion rules. Negative tests reject bit size 64, dynamic base, dynamic bit size, and non-call operations.

The loader adds `Input` and `Publication` as roots only when the existing bridge validator accepts the complete typed child pair with no diagnostics. That validator checks exact signatures and the `modulewire.Input` and `modulewire.Publication` field shapes. The transitive walk now walks the just-projected function body. The focused loader test sees the wrapper bridge roles, all reachable `modulechild` roles, and `counter` roles; a second-depth unsafe increment still reports `analyze.numeric-profile` at the leaf dependency.

The wrapper keeps request ID, pending/reply state, mount identity, and cancellation decisions in Go. Request state is advanced before the request effect is returned. Cancel and unmount return the declared cancellation effect for the active Go token, and duplicate, stale, wrong-tuple, canceled, or completed replies leave Go state unchanged. Existing counter behavior and typed input/publication remain delegated to `modulechild`.

At literal removal event 15, the captured order is `go.update.unmount` → `go.state.unmounted` → `go.effect.cancel` → `transport.cancel` → `renderer.teardown`. The pre-state has generation 1, request ID 4, and pending token `a:g1:r4`; the post-state and retained child have `Mounted=false` and `Pending=false` while preserving the request ID and token. The native CLI test asserts this ordering and state transition.

## Replayed evidence

The literal scenario rerun is byte-identical to the sealed output: 31 events, 32 states, 10 Go effects, 20 transport rows, one retired child, and zero pending transports. The original native CLI boundary output also reruns byte-identically.

The pinned E-BUILD-final artifact records the emitted React and DOM boundary results. I compared each backend's ten cases and sixteen steps against the isolated native replay, including full wrapper/Core states and ordered effects. Both matched: the two max-safe flows are accepted; max-safe plus one, zero, leading zero, malformed input, uint64 max, uint64 overflow, a non-ASCII digit, and another byte are unchanged no-ops. Comparison normalizes only JSON representation (omitted empty `arg` and Go effect field capitalization).

The frozen E-BUILD-final index pins 59 source files, all of which still match the current worktree. Its `compiled-frontend/build/pipeline.go` and `moduleabi/descriptor.go` entries are separate E-BUILD-owned dependencies. Their current bytes match the frozen index, but this review does not assess those implementations; the build index is used only as the recorded emitted-boundary evidence for this N1 review.

## Limits and evidence index

This review covers the sealed N1 analyzer, child wrapper, tests, and native replay claims. It does not replace E-BUILD review, qualify browser/host behavior, or claim full-repository testing. No production files were modified.

Commands, versions, source pins, focused test output, replay hashes/counts, boundary comparisons, and contract observations are indexed at `module-effects-coordination/rawlogs/XR-GOCOMPILE/index.json` (SHA-256 `0bcc379ccbca461be92923fac0a055e76a41b2641848a78c52e000e995a93842`).
