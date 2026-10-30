# XR-E1 independent review: amend

## Finding

**Medium — the raw WASM API accepts JSON `null` for string fields and mutates the session.** In [`main_wasm.go`](../../cmd/async-save-wasm/main_wasm.go), `decodeJSON` uses `json.Unmarshal` directly into `gobi.Step` and `asyncsave.Reply` at lines 30–32 and 44–46. Go's JSON decoder accepts `null` into a non-pointer string field as its zero value, so the bridge does not reject a type-invalid input.

I reproduced this against the built `async-save.wasm` and `wasm_exec.js` with Node 22:

```js
api.init();
api.dispatch({ Path: "0", Event: "input", Value: "before" });
api.dispatch({ Path: "0", Event: "input", Value: null });
```

The second dispatch returned no `error` and changed `Draft` to `""`. With a pending ID 1, `api.complete({ ID: 1, Value: null, Error: null })` also returned no `error`, saved `""`, incremented `Saves`, and recorded an accepted `saved` audit outcome with empty strings. A malformed reply can therefore be accepted as a successful completion instead of leaving state, messages, and audit untouched. The current smoke covers cycles, BigInt, and unsafe IDs, but not JSON `null` fields.

**Suggested correction:** validate the raw JSON object fields and types before decoding into Go structs. Reject null or otherwise non-string `Step.Value`, `Reply.Value`, and `Reply.Error` values with `{error: ...}` before calling the session. Add bridge smoke assertions that the malformed call returns an error and preserves snapshot, effects, messages, and audit.

## Reviewed behavior

- IDs use `uint64`, are capped at `9007199254740991`, and are retained through Reset. Allocation exhaustion is rejected before a replacement save can queue cancel/start work.
- Replacing a pending save queues `cancel` before `start`; cancel and Reset preserve the intended editor fields and pending replies are stale.
- Only the active reply ID changes state. Duplicate, stale, and out-of-order valid replies remain in ordered messages and typed audit; active errors preserve prior `Saved`/`Saves` and allow retry.
- `View` starts from `editor.View`, preserves its input binding and child positions, and adds Reset enablement based on non-idle async state without treating `NextID` alone as work.
- Session snapshots, effect commands, and audit outcomes are returned as copies; the tests exercise snapshot tree/message and audit mutation isolation.
- Invalid Go dispatch, invalid completion IDs, and ID exhaustion leave state/history/audit/outbox unchanged in the tested cases.

## Test evidence

- `/tmp/gondola-go/bin/go test -count=1 ./asyncsave ./cmd/async-save-wasm` — passed (`asyncsave`; WASM command package has no Go test files).
- `/tmp/gondola-node22/node_modules/node/bin/node cmd/async-save-wasm/smoke.mjs /workspace/scratch/39a56936f173/gondola/async-effects/build/async-save.wasm /workspace/scratch/39a56936f173/gondola/async-effects/build/wasm_exec.js` — passed. The smoke verifies initial shape, dispatch/save, one-time outbox draining, active and duplicate completion, invalid IDs, cyclic and BigInt inputs, and recovery after those errors.
- Additional raw-WASM Node probe — reproduced the JSON-null mutation described above.

## Review result

The Go session transitions and typed ID/reply guards meet the reviewed contract. I recommend **amend** because the raw JS boundary still accepts malformed nullable strings and can mutate state; no production files were edited during this review.
