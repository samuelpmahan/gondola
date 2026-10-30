# XR-E1 independent review: PASS after test amendment

## Review decision

The E1 implementation matches the PLAN contract for request encoding, correlated response decoding, and the standalone `gobiHTTPSave` WASM boundary. Strict schema failures return the expected ID with `invalid response`; non-200 responses map to `http status N`; bridge validation errors return `{error: ...}` before mutating the session.

The initial review found a test/report mismatch: E1.md said response unsafe-ID coverage existed, but the response tests covered wrong correlation and fractional/exponent forms without testing response ID zero, negative, above `asyncsave.MaxID`, or acceptance of the maximum safe ID. Direct probes showed the production parser handled those cases correctly. I asked the E1 author to add the missing range test. The author added `TestDecodeResponseEnforcesSafeResponseIDRange`, updated E1.md, and the targeted recheck passed. No production source changed during repair.

## Evidence and exact commands

Toolchain: `/tmp/gondola-go/bin/go version` → `go version go1.24.0 linux/amd64`; `/tmp/gondola-node22/node_modules/node/bin/node --version` → `v22.23.4`.

From `/workspace/scratch/39a56936f173/gondola`:

- `/tmp/gondola-go/bin/go test -count=1 ./httpwire` — passed before and after the amendment. Final: `ok github.com/samuelpmahan/gondola/httpwire 0.003s`.
- `/tmp/gondola-go/bin/go test -count=1 ./cmd/http-save-wasm` — passed; native stub package loads.
- `GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/xr-e1-review.wasm ./cmd/http-save-wasm` — passed without overwriting E1's shared `/tmp/http-save.wasm` artifact.
- `/tmp/gondola-node22/node_modules/node/bin/node cmd/http-save-wasm/smoke.mjs /tmp/xr-e1-review.wasm /tmp/gondola-go/lib/wasm/wasm_exec.js` — passed (`http-save-wasm bridge smoke passed`). It exercises JSON escaping, max-safe request ID, response correlation/status, malformed surrogate escapes, primitive and exact-argument checks, getter failure handling, and session dispatch/effects/completion/audit.
- A separate read-only WASM probe verified failure/recovery: invalid dispatch and completion inputs returned errors, did not add an audit result or consume the queued start effect, throwing getters were contained, and a valid completion then saved normally. Result: `XR-E1 WASM failure/recovery probe passed`.
- A temporary Go probe exercised response IDs `0`, `-1`, `9007199254740992`, and maximum-safe `9007199254740991`; invalid values produced the expected-ID `invalid response`, while the maximum-safe correlated reply was accepted.

The environment emitted Node's `UNDICI-EHPA` experimental proxy-agent warning during WASM smoke/probe runs; all assertions passed.

## Source hashes

Hashes below are SHA-256. The first hash shown for `httpwire/httpwire_test.go` is the pre-amendment review snapshot; the final hash includes the author's response-ID range regression. Production and WASM source hashes stayed unchanged.

| File | Initial review | Final recheck |
|---|---|---|
| `httpwire/httpwire.go` | `d258d1788522739159768692cca2635dbae8ad83f298394dca95085622ae130a` | `d258d1788522739159768692cca2635dbae8ad83f298394dca95085622ae130a` |
| `httpwire/httpwire_test.go` | `72384e9e7d9c9048d11b02497e3ba782028b4abf51024e38fcde571044d4e603` | `c588eed4260eebb72fbf8afe2772b296cac812f8b2755294fac21d7e136c3099` |
| `cmd/http-save-wasm/main_wasm.go` | `96a926df0f64a1c68aeb0e709054edd7500c850335cb908a69d6784ef4df8d39` | `96a926df0f64a1c68aeb0e709054edd7500c850335cb908a69d6784ef4df8d39` |
| `cmd/http-save-wasm/main_stub.go` | `acaa774353799424cb3dfd4b777d83d178f09d90ac08e666deaa9824b107d343` | `acaa774353799424cb3dfd4b777d83d178f09d90ac08e666deaa9824b107d343` |
| `cmd/http-save-wasm/smoke.mjs` | `23aad0803e1dac771ad7c5ed6f0ad49cd7d53671143ffc8d8969ea88eb26d12c` | `23aad0803e1dac771ad7c5ed6f0ad49cd7d53671143ffc8d8969ea88eb26d12c` |

## Limits

This review covers the E1 codec and native Go/WASM bridge under Go 1.24 and Node 22. It does not certify browser fetch, the Go lab, Chromium replay, or full seeded repository integration; those remain with the corresponding integration gates.
