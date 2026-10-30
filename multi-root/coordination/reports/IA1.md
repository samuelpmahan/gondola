# IA1 — Cross-layer contract audit

## Result: mixed; integration is not yet verified

Audited \`multisession\`, \`cmd/multi-root-wasm\`, \`multi-root/host.mjs\`, \`runtime.mjs\`, \`renderer-conformance/adapter.mjs\`, the replay helpers, browser smoke, and default runner. The Go/WASM method signatures, session scoping, safe-integer IDs, GoDOM per-mount handle shape, and host callback-generation checks align. Focused native and JavaScript suites pass. I found two active integration blockers and one boundary mismatch.

## Findings

### 1. The default replay gate is a successful no-op

\`run-multi-root.sh\` ends by executing \`node multi-root/check.mjs "$@"\`. \`check.mjs\` only exports validation helpers; it has no CLI entrypoint, no top-level \`main()\`, and no calls to \`makeScripts\`, \`createMultiRootReference\`, \`compareReplayScenario\`, or \`nativeComparisonInput\`. Those symbols are otherwise used only by unit tests. Running the claimed final gate:

\`\`\`sh
/tmp/gondola-node22/node_modules/node/bin/node multi-root/check.mjs --must-run-replay
# exit 0, no output, no report or replay artifacts
\`\`\`

Therefore the default runner cannot establish the required seeded replay, zero mismatches, or native comparisons. The browser smoke is a separate fixed demonstration flow and does not call the replay helpers. \`nativeTick()\` also builds \`State\`, \`Tree\`, and \`DOM\` directly from one browser observation and hardcodes \`Pixels: ""\` and \`Mutations: 0\`; no multi-root call site sends those frames through \`cmd/compare-interaction\`. A replay driver must execute both independent actors and the native comparator, then fail on missing/empty evidence.

### 2. The current browser smoke fails at the post-swap Save action

The demo did initialize three sessions and rendered the React replacement correctly. The smoke then failed to locate the Save button. Its \`action()\` helper filters each \`.row\` using \`input(slot, rowID)\`, but that input locator is already scoped to \`[data-app-root]\`; Playwright's \`has\` locator is evaluated relative to each row and cannot match an ancestor-scoped locator.

Reproduction:

\`\`\`sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node multi-root/browser-smoke.mjs
# exits 1: locator.click timeout on the Save action after the React swap
\`\`\`

An isolated Chromium probe after the same swap observed \`rowCount: 1\`, \`inputCount: 1\`, \`saveCount: 1\`, but \`row.filter({has: app.getByLabel("Row 1")}).count() === 0\`. The product DOM contained \`.row button.save\`; the failure is in the smoke locator, not renderer output. This prevents the default runner from reaching its final checker on the current tree.

### 3. The runtime accepts, but does not unwrap, E2 error frames

\`gobiMultiRoot\` returns exact \`{error: string}\` frames. \`createSessionRuntime()\` clones the result of each manager call without checking that frame. The GoDOM adapter and the demo's \`unwrapManager()\` do unwrap frames, but the exported host/runtime path does not. Its structural validator accepts the raw bridge, while runtime unit fakes only throw exceptions.

Actual-WASM reproduction with a valid session and invalid path:

\`\`\`text
gobiMultiRoot.dispatch(id, {Path:"999",Event:"click",Value:"",Key:"missing"})
  -> {"error":"child index 999 out of range in path \\"999\\""}
createSessionRuntime(gobiMultiRoot, id).dispatch(sameStep)
  -> the same {error:...} object as a return value
\`\`\`

The browser demo currently compensates by wrapping the bridge before host creation, so its normal path is protected. Direct \`createMultiRootHost({manager: gobiMultiRoot, ...})\` calls are not: a manager error is treated as snapshot/effect data and later reported as a generic keyed-host validation error. Unwrap error frames centrally in the runtime/host contract, or make and validate the throwing-manager adapter as an explicit required input.

### Resolved during this audit: missing \`list()\` wrapper

The first read found that \`demo.mjs\` omitted \`list\` from \`unwrapManager\`, while \`assertMultiRootManager\` requires it. I reported this to root; the current shared tree now includes \`list\`, and a targeted Chromium load reports \`3 / 3\` sessions. No production files were changed by this audit.

## Verification

- \`/tmp/gondola-node22/node_modules/node/bin/node --test multi-root/*.test.mjs renderer-conformance/adapter.test.mjs\` — passed, 26 tests.
- \`GOTOOLCHAIN=local /tmp/gondola-go/bin/go test ./multisession ./cmd/multi-root-wasm\` — passed.
- \`GOTOOLCHAIN=local /tmp/gondola-go/bin/go vet ./multisession ./cmd/multi-root-wasm\` — passed with no output.
- Direct raw-WASM/runtime error-frame probe — confirmed the runtime returns the bridge error frame instead of throwing/unwrapping it.
- Targeted Chromium startup after \`list\` was added — mounted 3/3 sessions.
- Full \`multi-root/browser-smoke.mjs\` — failed at the post-swap Save locator as described above.
- \`node multi-root/check.mjs --must-run-replay\` — exit 0 with no output.

## Limits

No production or test files were edited. The full default runner was not run because its browser smoke is already reproduced failing; the final checker no-op was exercised independently. Cross-browser behavior and any complete seeded/native replay remain unverified until the runner has a real replay driver and the browser smoke locator is repaired.
