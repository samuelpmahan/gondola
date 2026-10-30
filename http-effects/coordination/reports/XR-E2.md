# XR-E2 — Independent review of fetch transport

**Verdict: PASS.** The scoped transport and tests match the HTTP contract. No production edits were made.

## Reviewed evidence

- E2 author report: `http-effects/coordination/reports/E2.md`
- Initial findings: `http-effects/evidence/initial-findings.md`
- Reviewed source: `http-effects/transport.mjs`, `http-effects/transport.test.mjs`

Source SHA-256 at review:

| File | SHA-256 |
| --- | --- |
| `transport.mjs` | `b6ca9454a359f76a352123b4625dc174aea31fcf802699573a89a2cfe3cf09ff` |
| `transport.test.mjs` | `465c96da433dfa4be29995e872537754bc8ad47af8b2281b742176d66b9f7953` |
| `coordination/reports/E2.md` | `7c28bfae902321d5fec59fd617a6a356c0b31fdf3075c09a6b724f792603a368` |
| `evidence/initial-findings.md` | `5a8e43c4c3e48f626d672e586ae987887f2d51cb2a731d2b9f9d4a8d10e9b32e` |

## Findings

- Fetch is issued as `POST` with the encoded JSON body, `content-type: application/json`, `mode: "same-origin"`, `credentials: "same-origin"`, and `redirect: "error"`. The response status and body pass through the runtime decoder; the transport then independently requires an exact three-field reply correlated to the started ID.
- Each start produces one normalized start event. Duplicate IDs are rejected. A valid reply emits at most one reply event; cancellation logs before abort and fences delivery even when abort is unavailable or ignored. Disposal is idempotent, aborts remaining requests in insertion order, and fences late replies.
- Fetch, request encoding, and URL resolution failures normalize to `network error`. Decoder exceptions and malformed decoder output normalize to `invalid response`. Response-body read failure is a network error. Unexpected delivery/work exceptions are retained until `settled()` and consumed once.
- `evidence/initial-findings.md` finding 5 records the original lost-callback-error bug: a delivery callback could throw, work could finish, and a later `settled()` would resolve because the rejection had already been removed. The current code retains that exception. The regression test waits a `setImmediate`, observes the original exception on the first `settled()`, then observes successful settlement on the second.
- The E2 implementation does not mechanically claim a transport instance to one host. The unchanged host has a runtime lease but no transport-claim API. Callers must provide one transport instance per host; this is documented in E2's limits. The harness allocates separate participant transports. If exclusive transport ownership is intended to be enforced for arbitrary callers, it needs a future host/transport lifecycle hook.

## Commands and results

Toolchain: `/tmp/gondola-node22/node_modules/node/bin/node --version` → `v22.23.4`.

Scoped suite, run from `gondola/`:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test http-effects/transport.test.mjs
```

Result: **9 passed, 0 failed**.

Independent negative probes were run through Node 22 stdin modules. They temporarily disabled `AbortController`, started three deferred requests, canceled one twice, disposed the transport, then resolved all fetches. The transport emitted one cancel for the explicit cancellation and one for each remaining request in insertion order; all late deliveries were suppressed. A second probe called `cancel()` reentrantly from a successful delivery callback and observed exactly one reply with no spurious cancel event. Output: `independent negative probes passed: abort unavailable, repeated cancellation, disposal order/fencing, and reentrant post-delivery cancellation`.

The real Go-WASM/fetch round-trip was also independently rerun from `gondola/` using `/tmp/http-save.wasm`, `/tmp/gondola-go/lib/wasm/wasm_exec.js`, a loopback Node HTTP server, and Node 22's default fetch. It asserted the request bytes `{"ID":17,"Value":"independent review"}`, the correlated decoded reply, and the normalized start/reply log. Result: `real Go-WASM transport integration passed`.

## Limits

- This review covers E2's module and transport tests. It does not certify the Go lab, browser harness, full seeded replay, demo, CI workflow, or inherited regression suite.
- Abort is advisory. A fetch implementation that ignores abort keeps `settled()` pending until that fetch resolves, while delivery remains fenced.
- The canceled socket cannot carry a later HTTP body. Injected fetch races cover late callback suppression; inherited Go state-machine tests cover stale or duplicate completion handling.
- Transport-per-host exclusivity remains a caller convention because the host API is unchanged and has no transport claim hook.
