# E4 author report — browser parity harness

## Owned files

- `async-effects/check.mjs` serves a Playwright fixture with two isolated real Go WASM sessions published through `globalThis.gobiAsyncSave`, the unchanged controlled-input DOM and React renderers, the independent React state-machine reference, and a fresh manual transport per candidate.
- The harness runs fixed and seeded edit, type, save, reset, cancel, reply, renderer-swap, and stale-input actions. It waits for both Go hosts to settle before recording each observation. Reports include complete state/tree/binding/message snapshots, audit outcomes, ordered transport logs and pending commands, live `outerHTML`, renderer DOM snapshots, input value/disabled state, control properties, backend names, and runtime call counts.
- Each Go candidate is compared against the independent reference and against the other Go candidate. The harness saves one native `CompareInteraction` envelope per candidate per script, fails on absent/mislabeled E6 probes or browser/WASM global errors, and checks that each host calls `init()` exactly once.
- `async-effects/check.test.mjs` adds negative checks for state, tree, bindings, ordered messages, audit, transport order/pending work, live DOM, input properties, renderer DOM reports, native trace fields, and CLI defaults/seed validation.

## Verification

Node `v22.23.4`:

- `node --check async-effects/check.mjs`
- `node --check async-effects/check.test.mjs`
- `node --test async-effects/check.test.mjs`: **8/8 passed**.

Fixed-only real-browser diagnostic (both default seeds, no generated cases):

- **16 scripts / 122 observations**, with zero parity mismatches or global errors.
- Native `CompareInteraction`: **32/32 candidate envelopes matched**.
- Adversarial probes: **11/11 passed**, including real-Go stale, out-of-order, duplicate, error/retry, reset, renderer-swap, unmount, and session-collision probes plus three explicitly synthetic transport/facade probes.
- Every recorded Go host retained exactly one `init()` call.
- Browser: Chromium `153.0.8010.0`.

The retained build-ignored report and stdout are `async-effects/build/e4-fixed-diagnostic-recheck.json` and `.log`. The initial probe run exposed a mistaken E6 expectation that Reset would preserve saved editor fields; the corrected probe checks that Reset clears those fields while preserving the request counter. Its first report and output remain as `e4-fixed-diagnostic-first.json` and `.log`.

The two-seed generated replay was not run in this author pass; the integrated runner owns that longer run.
