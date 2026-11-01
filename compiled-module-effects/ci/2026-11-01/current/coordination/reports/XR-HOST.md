# XR-HOST — independent review of the runtime host

**Reviewer:** N1  
**Decision:** `accepted`  
**Reviewed packet:** sealed E-HOST, with runtime source inventory and E-BUILD-final artifacts

## Review result

I verified the sealed E-HOST report and receipt hashes, both runtime source pins, the E-HOST raw-log index, and the E-BUILD-final build-index hash. The independent Node `v22.23.4` rerun loaded the frozen build index and passed all six host unit tests.

The implementation meets the host-unit scope:

- A child request is started after Go update, publication, view creation, renderer update, and commit ledger entries. A synchronous `transport.start` reply sees the request as pending and queues delivery while the dispatch is busy or starts are in progress. Delivery runs after the dispatch unwinds; repeated delivery is ignored after the item becomes delivered.
- Each request retains its validated Go token tuple and a separate host transport correlation. A reply is accepted only when the current child at the token key still has the captured mount lifetime and generation. Reply routing does not depend on renderer epoch, so pending work survives a backend swap.
- Child unmount runs the Go transition and records its post-unmount state before consuming the declared cancel effect. Cancellation marks the correlation `cancelled` before calling `transport.cancel`, so a synchronous retained callback is rejected without another Go update. Renderer teardown follows that call in the ordered lifecycle ledger.
- Backend replacement stages renderer instances and callbacks for the next epoch, then commits the copied child-instance map and epoch. The copy preserves the mount lifetime used by pending replies. Old callbacks fail the epoch/current-instance checks, candidate callbacks become live at commit, and later mounts use the active backend factory.

These observations are backed by the passing tests for synchronous delivery, renderer swap and active-backend remount, cancellation ordering and stale generation callbacks, and closed effect/reply tuple validation. No material host-unit defect was found.

## Verification

Exact rerun command:

```sh
GOBI_MODULE_EFFECTS_BUILD_INDEX=compiled-module-effects/build/output/E-BUILD-final/build-index.json /tmp/gondola-node22/node_modules/node/bin/node --test compiled-module-effects/runtime/runtime.test.mjs
```

Result: 6 passed, 0 failed. The canonical E-BUILD-final index is 220,837 bytes with SHA-256 `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444`; it declares four independently compiled parent/child artifacts across React and DOM. Runtime and test source hashes match the E-HOST seal. Exact TAP streams, command record, versions, and source verification are under `module-effects-coordination/rawlogs/XR-HOST/`.

## Evidence limits

This review covers runtime host behavior using the sealed synthetic memory renderer and actual emitted Go modules. It does not establish mounted React behavior, real browser DOM events, timer transport behavior, or broader repository test coverage. Those remain outside the E-HOST host-unit claim. No production files were changed during this review.
