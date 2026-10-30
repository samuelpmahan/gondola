# XR-E4 — Independent review of the multi-root host and runtime

## Decision: accepted

Reviewed `multi-root/host.mjs`, `runtime.mjs`, and their focused tests. I found no blocking host/runtime defect in the requested isolation and lifecycle paths. I did not edit production or test files.

## Probes and findings

- **Same numeric request IDs:** the focused host test starts request ID `1` in two sessions, checks their distinct payloads and transports, completes only the selected session, and confirms the sibling remains pending.
- **Transport reuse:** the focused test rejects using one transport object for two roots while preserving the first root. `issuedTransports` also retains a per-host `WeakSet` across root generations, so the same transport object cannot be reintroduced after unmount.
- **Duplicate session IDs:** a fake manager that returns ID `1` twice causes the second mount to fail before transport allocation; the existing owner remains mounted and its session is not disposed.
- **Immediate disposal before effect drain:** the focused test saves, unmounts synchronously before the keyed host's queued effects drain, observes only the disposed session's cancel, and verifies the sibling's effects are untouched.
- **Late callbacks and root reuse:** tests deliver a stale reply after unmount and after remount into the same root. The old record fails both active-record and generation checks, and the new session remains unchanged.
- **Sibling survival and renderer failure:** tests dispose one root while the sibling completes successfully, and separately cause a renderer update failure in one root while the sibling remains active and renders its completion.
- **Focus isolation:** the focused test captures/restores root A's selection while leaving root B's backend intact. I ran an additional Node 22 probe with selection values on both roots; replacing A preserved A's selection and left B's selection byte-for-byte unchanged.
- **Runtime scoping:** runtime tests verify every call carries the one bound SessionID, clone bridge outputs before renderer mutation, and fence all calls after generation retirement.

The wrapper transport closes callbacks over one record and checks active root identity plus its generation before invoking the keyed host. Session runtime calls use the same record-current fence. Disposal marks the record inactive before requesting manager cancels, then unmounts the keyed host; the scoped transport deduplicates cancellation requests so manager disposal and keyed-host cleanup do not cancel the same request twice.

## Verification

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test multi-root/host.test.mjs multi-root/runtime.test.mjs
# passed, 12 tests; Node emitted only the supplied environment's experimental proxy-agent warning
```

An additional inline Node 22 focus-isolation probe passed. It was not added to the repository.

## Scope limits

These tests use fake manager, renderer, and transport implementations; this review did not rerun the real-browser multi-root composition replay. The host/runtime layer relies on the manager's `dispose()` contract and the keyed host's existing cleanup behavior. No E4 source or test changes were made.
