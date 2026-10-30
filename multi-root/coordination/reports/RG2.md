# RG2 — GoDOM mount-failure lease repair

## Outcome: mixed_change

This is a follow-up to the R-GODOM repair. The native RG2/W2 allocation was recorded after this repair task was dispatched; this report records that chronology rather than treating the earlier dispatch as a native start. The original R-GODOM report and receipt remain unchanged.

W6 identified a defer-order edge case in `mountRenderer`: if `rendererAPI` panicked after `godom.New` had painted the root, the later-registered lease-release defer ran before the panic-recovery defer. Recovery then called `Renderer.Unmount()` after the root was no longer reserved, allowing cleanup to re-enter a mount on the same root.

The lease-release defer is now registered before panic recovery and guarded by a `reserved` flag, set immediately after appending the root reservation. LIFO execution runs panic recovery and renderer cleanup first, while the root remains reserved; the outer defer releases the root afterward. The recovery cleanup also contains its own panic guard so the lease-release defer still runs if unmount cleanup panics.

The smoke now overrides `Function.prototype.bind` temporarily to force renderer API construction to fail after the initial render. During the recovery cleanup, the root's `replaceChildren` override attempts a nested mount. The assertions require the nested mount to fail before its `init`, the root to be empty after cleanup, and a fresh mount to succeed after the failure. The built-in bind function and root method are restored in `finally`.

## Checks and limits

- `node --check` passed for the extracted inline smoke script and `cmd/godom-wasm/smoke.mjs`.
- Go compilation and the real Go/WASM browser smoke remain unavailable locally: no Go toolchain is present, and Playwright has no installed Chromium executable. CI must compile and execute the smoke; no runtime pass is claimed here.
- Source cross-review requested by the parent remains pending. The patch hashes for reviewer inspection are:

  - `cmd/godom-wasm/main_wasm.go`: `0088ad98470707502e8b84b5afeea7e85ea28ff3d6e892a1c3f5d22beaab49e7`
  - `cmd/godom-wasm/smoke.html`: `f0600bb6d260348d8db4fd17641179881980aafed830a488243379da0bb43a03`
