# XR-E3 — independent review

## Result: PASS

No required amendments found in E3's four owned files. Review was read-only for E3 source; only this review report was added.

### Findings

- **Independence:** `reference.mjs` imports the pre-existing independent async reference bundle and implements its own HTTP codec; it imports no Go codec or candidate renderer. `mountHTTPReference()` composes `mountAsyncReference(container)` with the codec methods. The generated HTTP reference bundle contains this wrapper, and `http-effects/harness.mjs` mounts `mountHTTPReference` as its separate reference participant. The Go DOM and React candidates are mounted independently.
- **Codec:** The JavaScript decoder enforces safe expected IDs and status bounds, exact top-level response fields, duplicate decoded property-name rejection (including escaped duplicate names), integer-decimal ID tokens, UTF-8 byte length, strict escaped-surrogate pairs, correlated ID, and primitive string fields. Error/value payloads are preserved for valid replies. It rejects unpaired escaped surrogates, matching the current Go contract; a raw lone surrogate in a JS body string is normalized to U+FFFD as documented for the browser text boundary.
- **Scripts:** The 11 fixed fixtures cover success; held success; cancel, reset, and swap followed by stale release; wrong ID; malformed body; 503; server error and retry; dropped/network failure; and alternating save/cancel/reset. All seven route modes appear, and fixed release status assertions distinguish live 202 from terminal 409. Seeded cases are bounded and deterministic.
- **Seed 202409:** An additional check generated 30 cases / 704 actions twice with identical output. SHA-256 of `JSON.stringify(seededScripts(202409, {cases:30,maxActions:40}))` was `5277c5b7846f687db4e754cd67a4eaabd6b9dbff94207bd7ee202984a1d90d8f`; `makeScripts({seeds:[202409],cases:30,maxActions:40})` returned 41 scripts including the 11 fixed fixtures.

## Verification

Toolchains:

- `/tmp/gondola-node22/node_modules/node/bin/node --version` → `v22.23.4`
- `/tmp/gondola-go/bin/go version` → `go version go1.24.0 linux/amd64`

Executed commands and results:

- `/tmp/gondola-node22/node_modules/node/bin/node --test http-effects/reference.test.mjs http-effects/scripts.test.mjs` → **6 passed, 0 failed**.
- `PATH=/tmp/gondola-go/bin:$PATH go test ./httpwire` → **passed** (`ok github.com/samuelpmahan/gondola/httpwire (cached)`).
- A Node 22 differential probe instantiated `/tmp/http-save.wasm` with `/tmp/gondola-go/lib/wasm/wasm_exec.js` and compared E3 `decodeHTTP` against `gobiHTTPSave.decodeHTTP`: **26/26** hand-selected cases matched, covering exact and over-limit sizes, statuses 100/201/404/503/599, non-ASCII, escaped pairs/lone surrogates, duplicate and escaped duplicate keys, lexical numeric IDs, wrong shapes, and trailing data.
- A second deterministic Node 22 probe generated **2,500** adversarial JSON/near-JSON objects (nested delimiters, escaped and duplicate names, malformed strings/numbers, and trailing content) and found **0** differences between the Go WASM decoder and the E3 decoder.
- Seed check: 30 cases, 704 actions, deterministic equality across two calls; SHA-256 and combined-script count are above.
- Structural DOM check: `reference.mjs` imports only the existing async reference bundle; the harness mounts `mountHTTPReference` independently from the candidate renderer modules.

### Probe receipt clarification

The first 26-case and 2,500-case differential runs above were inline Node heredocs and were not saved at the time; those are the original reported run and counts. I then saved a **new reproduced probe** at `http-effects/coordination/reports/XR-E3-probe.mjs`, preserving the 26 response bodies/statuses, the xorshift32 generator and 2,500-case loop, and both uses of seed 202409. The saved probe is executable and accepts optional WASM and `wasm_exec.js` paths; defaults resolve under `http-effects/build/`.

Exact reproduction command and result:

```sh
/tmp/gondola-node22/node_modules/node/bin/node http-effects/coordination/reports/XR-E3-probe.mjs /tmp/http-save.wasm /tmp/gondola-go/lib/wasm/wasm_exec.js
```

```json
{"manualComparisons":26,"generatedComparisons":2500,"adversarialSeed":202409,"scriptSeed":202409,"scriptCases":30,"scriptActions":704,"scriptJSONBytes":30202,"scriptSHA256":"5277c5b7846f687db4e754cd67a4eaabd6b9dbff94207bd7ee202984a1d90d8f","wasmSHA256":"a54d6a32fcfccbabae6571e7935812e38c91e34899dca6b00bf7343f686508e1"}
```

The formula is xorshift32: initialize `state = 202409 >>> 0`; per draw apply `state ^= state << 13`, `state ^= state >>> 17`, `state ^= state << 5`, then return `state >>> 0`. For each of 2,500 cases, select 0–6 members from the seven-key and 19-value pools in the probe, choose each whitespace separator from `[' ', '\n', '\r\t', '']`, and append ` trailing` when the next draw modulo 3 equals zero. E3's script receipt separately calls `seededScripts(202409, {cases:30,maxActions:40})` twice and hashes `JSON.stringify()` of the result; the formula and both seeds are explicit in the saved probe.

The decoder comparisons use candidate WASM SHA-256 `a54d6a32fcfccbabae6571e7935812e38c91e34899dca6b00bf7343f686508e1` and Go codec SHA-256 `d258d1788522739159768692cca2635dbae8ad83f298394dca95085622ae130a`.

## Reviewed source hashes

These hashes were captured at the start of review and remained unchanged through the checks:

| File | SHA-256 |
| --- | --- |
| `http-effects/reference.mjs` | `20431a81c3fbb5465f09843980e19a1ded908217ac66f119d2a8e431c9d1c96d` |
| `http-effects/reference.test.mjs` | `8826e55069642919bf2d6f48f44dbb217bedc36effb8f485fde1b29ea2c34df9` |
| `http-effects/scripts.mjs` | `ca9166474fa47932ab410103ae76e27d92e23c5bd7bdc09082cd98b369fa391b` |
| `http-effects/scripts.test.mjs` | `1651fd4a1b003f9feef7b83e6b8fd21dbb248c98a096792b8e29f3ae4b133cf2` |
| `http-effects/coordination/reports/E3.md` | `dd929a38eb831df5e75f707dfe755087d4d723fac891f6e77461de2ae375c181` |
| `http-effects/harness.mjs` (read-only DOM integration check) | `2b3d1d017aed683515488a730254b7672d08784ef0a7bca35e8d4e2460f037ad` |
| `http-effects/build/reference.bundle.mjs` (read-only generated wrapper check) | `c78ad6e4765d0e28364427990f487a1cb5b480fed8fec60ce1fd7372863383d9` |
| `/tmp/http-save.wasm` (review comparator) | `a54d6a32fcfccbabae6571e7935812e38c91e34899dca6b00bf7343f686508e1` |
| `httpwire/httpwire.go` (review comparator) | `d258d1788522739159768692cca2635dbae8ad83f298394dca95085622ae130a` |

The E3 and integration source hashes above are the values captured at the start of review. The review report itself changed when this receipt clarification was added; its hash is intentionally not embedded in itself. The current diagnostic-probe hash is listed below.

| Diagnostic file | SHA-256 |
| --- | --- |
| `http-effects/coordination/reports/XR-E3-probe.mjs` | `2e19654ed94b502309bd9bbf3843c3dceff3519b01bc7de85239c688f082c791` |

## Limits

- No Chromium replay or DOM interaction was started by this review. Root's seeded browser replay was already running, and I left its traces/assets untouched. DOM independence is established here structurally; runtime browser validation remains E4/root evidence.
- The 202409 hash is a review-run reproducibility receipt, not a checked-in golden fixture. E3's tests verify repeatability and the required default seeds but do not pin a historical 202409 output.
- Only E3's targeted Node suite and the Go `httpwire` package tests were run; this is not an inherited-suite or full-stack pass.
