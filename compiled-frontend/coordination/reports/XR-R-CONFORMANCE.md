# XR-R-CONFORMANCE Independent Review

**Decision: accepted.** This audit supports N6's frozen `R-CONFORMANCE` result for the pinned compiled frontend profile and five deterministic scripts. I did not modify or rerun the source build or browser capture. I reran the offline closed checker for each profile into my owned review directory and checked the preserved raw capture and provenance independently.

## Independent checks

- Verified all 73 entries in `conformance/raw/r-conformance-final/SHA256SUMS`; every checksum passed. Also verified all 57 checksums in the earlier R2 failure capture, preserving that failure as history.
- Reran `conformance/check.mjs` on each native, direct-JavaScript, and mounted-browser trace. Each profile matched; each independent checker output is byte-identical to N6's corresponding `.check.json`.
- Rechecked source provenance for every profile: direct replay and browser pre-bundle provenance each contain the same 98 inputs; browser provenance has those same inputs plus one generated bundle. All 98 current local inputs per profile match their captured byte lengths and SHA-256 values.

| Profile | Ticks | Mutation controls | Independent result |
| --- | ---: | ---: | --- |
| counter | 5 | 17 | matched |
| form | 10 | 18 | matched |
| list | 11 | 19 | matched |
| effect | 5 | 18 | matched |
| list-growth | 12 | 17 | matched |
| **Total** | **43** | **89** | **0 mismatches** |

## Trace evidence reviewed

- Each browser record reports zero WASM API attempts, zero `.wasm` requests, no page errors, and after unmount both an empty physical root and an empty renderer snapshot (`html: ""`, no controls).
- Form action intent remains separate from the physical target: the literal click was requested with `must not replace literal`, the observed button value and target value at dispatch were both empty strings, and the Go message was `{Name: "literal", Arg: "target.value"}`. The action object remains lower-camel. The exact safe integer `9007199254740991` is preserved in the form state trace.
- The keyed list input remains focused through reorder with selection `[0,2]` and direction `backward` before, immediately after, and settled. A click on a removed node yields one stale observation, no message, and no dispatch increment. The initial nil `Rows` slice is distinct from the non-nil empty slice after reset.
- Disabled physical clicks are suppressed without callback or dispatch changes in all profiles (two suppressed attempts in `list`, one in each other profile).
- The effect trace contains negative zero as bits `8000000000000000`. The host observes the pending view and physically disabled Request button before completion for `dispatch-0002`; exactly one correlated completion is applied. A duplicate is rejected with `effect completion already delivered`, and tick count stays at 5.
- The growth scenario reaches list lengths/capacities `3/4` and `5/8`, then resets to non-nil empty `Rows` with `NextID: 5`.

## Commands and evidence

The five offline checks used Node `v22.23.4` from `compiled-frontend`:

```sh
/tmp/gondola-node22/node_modules/node/bin/node conformance/check.mjs \
  --app-ir artifacts/compiled/apps/<app>/app-ir.json \
  --fixture <fixture.json> \
  --native conformance/raw/r-conformance-final/<profile>.native.json \
  --direct conformance/raw/r-conformance-final/<profile>.direct.json \
  --browser conformance/raw/r-conformance-final/<profile>.browser.json \
  --output coordination/reviews/xr_r_conformance/<profile>.check.json
sha256sum -c conformance/raw/r-conformance-final/SHA256SUMS
sha256sum -c conformance/raw/n6-source-900dc38-r2runtime/SHA256SUMS
```

The full-run/browser evidence remains N6's preserved capture, not a fresh run by this reviewer. N6's result is anchored by `R-CONFORMANCE` receipt SHA-256 `f8fb6f691c0a603c467cab27f666cb79e750514954d9fe8e40da224f2174fccc`, raw manifest SHA-256 `d866f4174fbb7ae69ba697b736036e1cf878d827341fb16ea7d0cf6a3f25832d`, and root execution receipt SHA-256 `e4f2d958d76f5ed03079e00914d705b0514f7de29023231206c0b00869c8c7b5`.

The independent checker summary, provenance audit, and checksum output are in `coordination/reviews/xr_r_conformance/`. Key frozen source hashes match N6's receipt: encoder `a605b3267f63f7c7ed90c17ee2ed9bf04c7667827a23496c8620070f13b9b46d`, renderer `12e50f96ec61975551d4f63242a512912aa986727170186ccb83ad66a9902da0`, runtime `ab0a2fe8c97293a8e45a035b92e46a80ae53b702103de47ca337f0a830b26704`, browser harness `e5226c8156a27bb1da620556e71cc10daa49d5b7ec3b364c00aa806f2ac90bea`, and direct harness `94e0da9f2d177d1ab6840bddfed0774358db36a3abe368b79b044d89167308c0`.

## Limits

A retained callback after **runtime unmount** remains untested. The tested stale callback is from a detached DOM node before runtime unmount. Acceptance is limited to the four pinned apps and five deterministic traces; it makes no generic Go compatibility claim.
