# XR-E6 independent review: loopback HTTP laboratory

## Verdict

**PASS.** I found no blocking mismatch with the HTTP lab contract in `http-effects/PLAN.md`. The request boundary rejects malformed or ambiguous save payloads before recording them; request identities are unique per lane; the retained request record is protected by the server mutex; terminal/released requests cannot be revived by release or duplicate requests; and the executable rejects non-loopback bind addresses. The `drop` response is truthful on the wire: it sends HTTP 200 headers and a deliberately truncated declared body, so clients observe a body read failure while the server retains one dropped record.

## Scope and reviewed snapshot

Reviewed `httplab/server.go`, `httplab/server_test.go`, `cmd/http-lab/main.go`, and E6’s report `http-effects/coordination/reports/E6.md` against the server, strict request, release, cancellation, drop, and loopback requirements in `http-effects/PLAN.md`.

SHA-256 of reviewed source files:

| File | SHA-256 |
| --- | --- |
| `httplab/server.go` | `16c380c8b6076b3d35c70bc8cdc4010f82e127cd4a6d33fc0c6eca9bb60fa4ee` |
| `httplab/server_test.go` | `289eaa8cfd1070bec62a70c4a45c58c04bb75e72f6467abe1cbe9a38c7521751` |
| `cmd/http-lab/main.go` | `efe8bdcdd9bfdc94bfb410355e46304625bf5fdf3a222e2a8631cf7be11cca4b` |
| E6 report as reviewed | `db5c687319f80a0b7b5fb27b4c3e802904507813e62a891edd61997867669571` |

The review used Go `go1.24.0 linux/amd64`, Node 22 at `/tmp/gondola-node22/node_modules/node/bin/node`, and Chromium `153.0.8010.0`. The isolated server binary was built at `/tmp/gondola-e6-review/http-lab`; its SHA-256 was `d9815119d7d6f7b7a4bbba99715df68974704375f6e6620a198730dc1ceb063c`.

## Independent checks

Commands run from the Gondola repository root:

```sh
/tmp/gondola-go/bin/gofmt -d httplab/server.go httplab/server_test.go cmd/http-lab/main.go
GOTOOLCHAIN=local GOCACHE=/tmp/gondola-e6-review/cache-normal /tmp/gondola-go/bin/go test -count=1 ./httplab ./cmd/http-lab
GOTOOLCHAIN=local GOCACHE=/tmp/gondola-e6-review/cache-race /tmp/gondola-go/bin/go test -race -count=1 ./httplab
GOTOOLCHAIN=local GOCACHE=/tmp/gondola-e6-review/cache-build /tmp/gondola-go/bin/go build -o /tmp/gondola-e6-review/http-lab ./cmd/http-lab
/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-e6-review/cli-check.mjs
HTTP_LAB_BIN=/tmp/gondola-e6-review/http-lab CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node http-effects/harness-drop-probe.mjs --output /tmp/gondola-e6-review/drop.json
```

Results:

- Formatting check produced no diff. The normal package/CLI tests and race-enabled `httplab` tests passed.
- The isolated CLI smoke started at `127.0.0.1:0`, parsed one readiness JSON line, and got HTTP 200 from `/` and an empty `/api/requests` response. It accepted `localhost:0`; it exited nonzero with the non-loopback refusal for `192.0.2.1:0`, `0.0.0.0:0`, and `:0`.
- The direct Chromium probe against the isolated binary received status 200, then rejected body consumption with `TypeError: Failed to fetch` and `net::ERR_CONTENT_LENGTH_MISMATCH`. It recorded one save POST (no duplicate 409), and `/api/requests` contained exactly one `State:"dropped"`, `Status:200`, `CancelObserved:false` record. The JSON evidence is `/tmp/gondola-e6-review/drop.json` (SHA-256 `fbfba226a0940d95183e7bb8529404bec72098b7aeb9d881d3f1c30d4c8f5c9a`).

The source tests exercise strict JSON shape/primitive/range/size/UTF-8 checks, duplicate-field rejection, duplicate `(lane, ID)` handling, response modes, held release, retained cancellation, release-after-cancel/completion conflicts, static serving, methods, and an actual truncated HTTP body. Inspection confirmed invalid save requests are rejected before insertion; duplicate saves return 409 without replacing the original record; release is accepted once only while held (202); cancellation is recorded; and subsequent release attempts leave terminal records untouched (409). The server serializes record transitions and snapshots under the same mutex.

## Limits

This review covers the finite loopback lab and these exercised HTTP/Go/Chromium paths. It does not make production-service, authentication, cross-origin, or broader browser compatibility claims. Request records are process-local. The browser probe specifically establishes the current Chromium behavior for the partial-body drop response; cancellation of an already-aborted held socket is covered by retained server-side cancellation and a 409 release, not by delivering a late response through that closed socket.
