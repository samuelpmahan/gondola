# E-CONTRACT (N6) report

**Outcome: `mixed_change`.** Published the bounded compiled React↔DOM replacement contract, execution plan, semantic fixtures, and independent runtime audit tests. This lane did not modify production code, AppIR, Go compiler modules, runtime implementation, dependencies, or Git state.

## Contract decisions communicated to peers

- `runtime.replaceRenderer(nextRenderer)` reuses the already-computed current Go `View`. A successful swap returns `{state, view, dom}` and does not call Go Init/Update/View, add a tick, or allocate a dispatch ID.
- The exact compiled module object is mounted through React and DOM for a given run. Separate backend builds compare AppIR, encoder, forwarding Go, generated TypeScript, component mapping, and role bindings byte-for-byte. Raw compiled-bundle hashes are retained; a temporary-source-label normalizer was rejected because a line regex can mask a line inside a multiline template literal.
- A pending completion received during replacement is accepted and duplicate-fenced, then processed in a microtask after the synchronous replacement returns. The swap-return snapshot remains pending. A queued completion is canceled if the runtime unmounts or the swap fails before drain.
- A retired renderer callback after swap is lifecycle diagnostics only, with no application tick. A retained callback from the active renderer after runtime unmount records one suppressed attempted-action tick with unchanged state and no Go Update/dispatch ID.
- Cross-backend replacement creates a new physical DOM node. The shipped renderers preserve focus/selection by logical key; keyed physical identity is guaranteed only within one renderer.
- Same-instance replacement and malformed renderer/focus pair are rejected before teardown. Failures after teardown fail closed; no rollback is claimed.

These decisions were sent to N1 runtime, N2 DOM, N3 harness, N4 build, N5 demo, and the lead while the implementation lanes were active.

## Scoped semantic audit

`evidence/semantic/swap-semantics.test.mjs` builds a small compiled-module stub and deterministic effect host to exercise the runtime boundary without changing app source. It covers cached-view replacement, focus restoration with a distinct physical node, stable first dispatch ID, retired callback fencing, post-unmount suppressed action tick, pending completion delivery after the swap return, duplicate fencing, a regular dispatch before the completion microtask, cancellation on unmount/failure, same-instance rejection, malformed focus admission, and a thenable commit failure after teardown.

Executed:

```text
node --version
v22.23.4

/tmp/gondola-node22/node_modules/node/bin/node --test compiled-backends/evidence/semantic/swap-semantics.test.mjs
tests: 5
pass: 5
fail: 0
```

Node emitted the non-failing experimental `EnvHttpProxyAgent` warning from the Playwright/undici environment.

`evidence/semantic/module-normalization-vectors.json` preserves the adversarial source-label cases. `module-normalization-audit.md` explains why bundle normalization is not used as proof. These vectors are not a build gate.

## Limits and review status

The local suite uses Go-function stubs and mock renderers; it does not establish the four-app emitted-module/browser harness. That remains N3/N4/N5 integrated evidence. N1 reported 23 runtime tests passing; this report records that as a peer-reported claim, not an independently executed result. The contract lane has not self-approved its own semantics; the assigned independent cross-review remains pending.
