# XR-E4 review: PASS

## Scope and verdict

Independently reviewed E4's `check.mjs`, `check.test.mjs`, `harness.mjs`, `harness.html`, drop probe, HTTP reference integration, and E4 report against `http-effects/PLAN.md`. I found no blocking false-green or coverage issue in the reviewed revision. I did not edit E4 sources or generated outputs.

## Findings

- **Independent React oracle:** `harness.mjs` imports `mountHTTPReference` and its React version constants from `http-effects/build/reference.bundle.mjs`. The source `http-effects/reference.mjs` wraps `mountReference` and `createAsyncReference` from the independent `async-effects/reference.mjs`, with separately implemented JS HTTP codecs; it does not import the Go codec or candidate renderer. E4 creates two distinct Go WASM runtimes and checks React and ReactDOM are both pinned at 19.3.1.
- **Settling and held/release/drop behavior:** after each action, the harness drains both Go hosts, drains the reference outbox, waits for each start's delivery gate or held server record, and waits for cancellation records after cancel. Live release asserts exactly HTTP 202 and awaits each reply; late release asserts exactly 409 and that the retained record did not change. The drop route is separately probed in Chromium; the accepted fixed report records the expected 200 headers followed by body-read network failures and dropped server records. These are event/state gates with bounded polling, not fixed sleeps.
- **Comparisons and native requirement:** each tick compares state, tree, bindings, messages, audit, transport log, server records, held IDs, renderer HTML and reported HTML, disabled paths, input path/value/disabled property, and all input/button control properties across DOM-Go, React-Go, and the reference, plus DOM-Go versus React-Go. `compareEveryTick` rejects missing native ticks. The CLI builds or requires the native `CompareInteraction` binary, compares both Go candidates to the reference for every scenario at `SameDOM`, and fails if any comparison is unavailable or mismatched.
- **Failure classification:** API responses and request failures are retained. Expected 503, 409 late-release, and partial-body drop diagnostics are classified only when the exact URL and observed status match a declared manifest entry; other console errors stay unexpected. Expected non-success routes are checked for exact response counts and statuses. The exercised response paths also assert decoded replies, final server records, live-release statuses, late-release immutability, and `/api/requests` success, so an unexpected HTTP result on those paths becomes a mismatch or scenario error.
- **Fixture coverage:** fixed scripts are action-inspected before browser launch. Required HTTP success, held release, pending swap, cancel/409, reset/late-release/409, malformed, wrong ID, 503, server-error/retry, drop, and alternating save/cancel/reset coverage are all present in the saved accepted run.

## Verification

Environment: Node `v22.23.4`; Chromium `/tmp/chromium`. I did not rerun Chromium because the coordinator's full two-seed replay was active and E4's accepted fixed run was already available; I read the saved report and preserved its outputs.

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test http-effects/check.test.mjs
```

Result: 8 tests passed, 0 failed. Node emitted the environment's experimental `UNDICI-EHPA` proxy-agent warning.

The accepted fixed-run artifact `http-effects/build/e4-fixed-accepted.json` parses to 11 scripts, 85 ticks, 0 mismatches, 22 matched native comparisons, React/ReactDOM 19.3.1, 0 Go errors, 0 page errors, 0 unexpected console events, and all 11 required coverage flags true. It records 21 expected diagnostics, 411 API responses, and 18 request failures.

The E4 report records the real browser command and result:

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  /tmp/gondola-node22/node_modules/node/bin/node http-effects/check.mjs \
  --seeds 20261030 --cases 0 --max-actions 40 \
  --output http-effects/build/e4-fixed-accepted.json
```

That recorded run passed all 11 fixed scripts and all 22 native comparisons. I did not write to its report or native-envelope files.

The original read-only negative probe was first kept outside the repository at `/tmp/xr-e4-negative-probes.mjs` (SHA-256 `b1a4e8e481b9e059e271228c9e28d1419ee1763aef733abaeebb73976583542d`). That initial file used workspace-absolute imports. I persisted the same 17 cases as `http-effects/coordination/reports/XR-E4-probe.mjs`; its imports resolve relative to `import.meta.url`, so it runs from another checkout path.

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
  node http-effects/coordination/reports/XR-E4-probe.mjs
```

Result: pass. The probe changed 17 individual runtime, audit, transport, server, and DOM fields and verified each mutation was detected; it also verified wrong, missing, and duplicate statuses fail exact response-count checks; wrong URL or status diagnostics remain unexpected; empty/unavailable native comparison fails; and removing the required status fixture fails coverage. Node emitted the environment's experimental `UNDICI-EHPA` proxy-agent warning.

I also verified the relative imports with the working directory outside the checkout:

```sh
cd /tmp
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
  node /workspace/scratch/39a56936f173/gondola/http-effects/coordination/reports/XR-E4-probe.mjs
```

Result: the same 17 negative probes passed.

## Source and artifact hashes

```text
a45b27ce8d44bece891a28a73f1ce0a32e4611b361f25fbd778ad86d56da49f4  http-effects/check.mjs
bd710b1191d75eb997ba0be71c27127a7dd71c43185662938cc9272817c47d51  http-effects/check.test.mjs
2b3d1d017aed683515488a730254b7672d08784ef0a7bca35e8d4e2460f037ad  http-effects/harness.mjs
a9351883bee082ea7aa2d7fa1b3dedb07799ab0fa71b1064e5c03c56d3fd6ecc  http-effects/harness.html
522352039984ad7aeba9dc78342a54d804d7257c7c5a351ff839029e4f921d71  http-effects/harness-drop-probe.mjs
20431a81c3fbb5465f09843980e19a1ded908217ac66f119d2a8e431c9d1c96d  http-effects/reference.mjs
7be8e053c2da3a7804a535a1a8af4ec889d31c4503aab621cd5abfba215614fb  async-effects/reference.mjs
ca9166474fa47932ab410103ae76e27d92e23c5bd7bdc09082cd98b369fa391b  http-effects/scripts.mjs
12b19ba313f990dffcd949afebf658f764c6e4f12bc7d473ba63170279ca4445  http-effects/coordination/reports/E4.md
8372307ccbe4482adb535b05ce66a39fb1b633e17f7fb3372441860d5c6c2b50  http-effects/build/e4-fixed-accepted.json
503148408c50641f751ead92a294e162665f6d4069227805c6a1cda153ae292e  http-effects/coordination/reports/XR-E4-probe.mjs
```

## Limits

This review validates the checked source revision and existing one-seed fixed browser evidence. The coordinator's full two-seed replay was still running at review time; this report does not claim that replay result. The harness covers the finite loopback lab in Chromium and does not claim production, cross-origin, focus/IME, or pixel equivalence.
