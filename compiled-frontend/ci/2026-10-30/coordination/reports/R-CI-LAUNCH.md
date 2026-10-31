# R-CI-LAUNCH

**Outcome: `mixed_change`.** Both no-WASM browser tests now use the repository's shared Chromium launcher options. The focused Node 22 run passed 2/2. This is a bounded unit-test repair; no full compiled CI run is claimed here.

## Change and actual flow

Only `compiled-frontend/conformance/no-wasm.test.mjs` changed. Its SHA-256 after the repair is `4092cbd692428e647d8c2deb361beb5032d3a39f4599aa4d55a0a207c4700775`.

Both tests now pass `process.env.CHROMIUM_PATH` to `chromiumLaunchOptions`, then give that returned object to `chromium.launch`. When the environment variable is unset, the shared helper omits `executablePath` and Playwright selects its managed Chromium. When a path is supplied, the helper includes that path. Headless mode and sandbox/dev-shm arguments come from the same helper.

After launch, the first test installs the WASM guard, checks the initially clear state, attempts a blocked `WebAssembly.compile`, then asserts that the guard records the attempt. The second test installs the guard, requests a `.wasm` URL, then asserts that the request was recorded. Both close Chromium in `finally`. The repair changes launch configuration only; the WASM/API and network assertions remain intact.

## Verification

Exact command:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_PATH=/tmp/chromium node --test compiled-frontend/conformance/no-wasm.test.mjs
```

Node was `v22.23.4`. I ran the command twice; both invocations exited 0 with 2 tests passed and 0 failed. The saved stdout/stderr pair is from the second invocation:

- `audits/R-CI-LAUNCH/focused.stdout.log` — SHA-256 `abcd25ecb369d936d2419f64c5a9f216734699759247dfa9ecef7dd644932e0e`
- `audits/R-CI-LAUNCH/focused.stderr.log` — SHA-256 `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8`

The output contains two passing subtests and a non-fatal Node proxy-agent experimental warning.

## Limits

This packet records only the requested two-test command. It does not claim the complete Node suite or compiled application CI passed. The prior published-head workflow failure remains preserved in CI-PUBLICATION evidence. Root will run the composed gate and independent review separately.
