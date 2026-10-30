# XR-E1 independent review: accepted

## Initial finding resolved

The initial review in [`XR-E1-initial.md`](XR-E1-initial.md) found that JSON `null` decoded into Go string fields as their zero values, allowing malformed raw WASM calls to mutate state. The bridge now validates primitive JavaScript field types before serialization, then validates the serialized object has exactly the required fields and JSON value types. Missing, extra, null, wrong-typed, boxed primitive, and unserializable inputs return `{error: ...}` before session mutation.

## Recheck evidence

- `/tmp/gondola-go/bin/go test -count=1 ./asyncsave ./cmd/async-save-wasm` — passed.
- Node 22 check and expanded smoke against the author’s fresh build `/tmp/async-save-wasm-bridge-review.wasm` with `/tmp/gondola-go/lib/wasm/wasm_exec.js` — passed. The smoke checks malformed input recovery, exact Step/Reply schemas, outbox draining, duplicate completion, and safe IDs.
- The replayable independent probe [`XR-E1-probe.mjs`](XR-E1-probe.mjs) passed against that fresh WASM build. It rejected 15 malformed dispatch objects and 21 malformed reply objects, including missing/null/wrong-typed/extra fields, boxed primitive wrappers, unsafe IDs, cycles, and throwing `toJSON` values. Rejected calls left effects and audit empty; the final exact message sequence and state show the original pending request accepted a valid completion afterward.
- The first recheck attempt used the older `async-effects/build/async-save.wasm` artifact, built before the bridge amendment, and failed on the expected missing-field case. The successful rerun used the fresh author build above; E5 owns its integrated rebuild.

## Reviewed behavior

The Go session’s typed `uint64` IDs, safe-integer cap, monotonic Reset behavior, cancel-before-start outbox order, active-ID reply guard, stale/duplicate/error audit and message behavior, atomic Go validation errors, editor view reuse, and copy isolation all match the reviewed contract. Focused package tests cover these behaviors.

## Review result

The initial raw-boundary finding is resolved by the amended bridge and verified against a fresh JS/WASM build. **Accepted.** No production files were edited during this review.
