# E-HOST: compiled publications runtime adapter

**Outcome: mixed_change.** Added a thin publications host facade that reuses the existing compiled-children effect policy, correlation driver, and shared frontend runtime. It does not own publication state, snapshots, queue ordering, or delivery decisions; Go receives the typed `On` messages and owns those transitions.

## API and behavior

`compiled-publications/runtime/runtime.mjs` exports:

- `COMPILED_PUBLICATIONS_HOST_CAPABILITIES`
- `validateCompiledPublicationsEffect(effect, label)`
- `createCompiledPublicationsEffectDriver()`
- `mountCompiledPublicationsApp(options)`, returning `{ runtime, effects }`

The validator, driver, and capabilities are direct aliases of the children fixture's closed profile. Accepted effects remain `fixture.request/lookup/token/complete` and `lifecycle.cancel/cancel/token/empty`; token syntax remains `parent:gN:rN` or `child:<key>:gN:rN`, with keys matching `[a-z][a-z0-9_-]{0,15}` and positive canonical safe-integer generation/request IDs. The `effects` surface remains `pending()`, `records()`, and `deliver(token)`. Publication capture and delivery do not become host effects.

The mount delegates to `mountCompiledChildrenApp`, which in turn uses the shared `mountCompiledApp` runtime. It does not hardcode the children package or component ID; the focused test mounts a `publications.App` component with the publication capability set, including `binding.value`, `binding.checked`, `numeric.safe-integer`, and `numeric.float64`, as well as the existing view and effect capabilities.

## Verification

The focused Node 22.23.4 runtime suite passed **5/5** tests. Coverage includes closed effect admission, publication input message forwarding to the GoScript Update boundary, locked capture suppression, pending request preservation across compatible swaps, stale callback rejection, incompatible candidate rejection while preserving the active mount, cancellation, and pending-effect retirement on unmount. Both new runtime files passed `node --check`.

A pre-implementation test run failed as expected because `mountCompiledPublicationsApp` did not yet exist; its log is preserved. The passing tests use a small GoScript ABI test module to exercise the host boundary. Actual Go transition/oracle/compiler/browser evidence remains in N1/N2/N4 lanes and is not claimed by this host packet.

## Limits

No full inherited pipeline, compiler build, browser demo, npm installation, Go test, Git operation, or native-state write was run. The host simply passes publication messages to Go and delegates renderer lifecycle and callback fencing to the existing host/runtime.
