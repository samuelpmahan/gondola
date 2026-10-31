# XR-R-CONTRACT (N1 independent review)

**Decision: amend.** N6's nine semantic cases pass independently against the frozen N1 runtime, and the pre-teardown/post-teardown focus semantics match the implementation. This scoped review found rejected Promises from post-commit observation methods fail the swap closed but still emit unhandled rejections.

## Verified R-CONTRACT claims

- The semantic suite has nine test cases. I independently ran its syntax check and all nine tests on Node `v22.23.4`; both commands exited 0. Its runtime source hash matches N1's frozen runtime hash `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105`.
- Focus capture accepts `null` or a valid closed record. Throwing, thenable, `undefined`, invalid-range/type, and extra-field capture results reject before teardown; the old renderer remains mounted, `runtime.failure()` stays null, the trace and Go call counts remain unchanged, `snapshot()` works, and a later valid replacement succeeds. The capture-reentry and one-shot completion cancellation cases also match the runtime's pre-teardown branch.
- `restoreFocus` only records success for literal `true`. `false`, `undefined`, a string, a rejected Promise, and a thrown restore fail at `focus-restore` after old teardown, set the runtime failure, make snapshots unavailable, preserve the application trace, and do not claim rollback.
- The other semantic cases retain cached-view replacement, no application tick, pending effect correlation, duplicate fencing, post-return completion ordering, cancellation, and preflight focus-pair/async admission behavior.

## Finding XR-R-CONTRACT-01 — rejected observation Promises leak after a failed swap

`replaceRenderer` calls `noThenable` on `update` and `restoreFocus`, but its post-commit calls to `viewSnapshot()` and `domSnapshot()` do not. In [runtime.mjs](../../../compiled-frontend/frontend/runtime/runtime.mjs), `viewSnapshot` calls `viewRecord()` and immediately checks the returned value's keys; `domSnapshot` does the same for `domSnapshot()`. A regular synchronous method can return `Promise.reject(...)` and pass the declared-async preflight. After the old renderer has been unmounted, the schema check throws and the runtime correctly surfaces `RuntimeFailure(stage="renderer-replacement")`, halts, and makes snapshots unavailable. Both rejected Promises remain unobserved. These shared helpers also serve non-swap runtime snapshots.

I reproduced this independently for both `viewRecord()` and `domSnapshot()` with an ordinary (non-async) function returning `Promise.reject(...)`. The runtime failed closed in both cases, but the next-turn `unhandledRejection` list contained `late viewRecord rejection` and `late domSnapshot rejection`. The exact script/result are in [the probe](../../evidence/reviews/xr-r-contract/postcommit-observation-promise-probe.mjs) and [its JSON output](../../evidence/reviews/xr-r-contract/postcommit-observation-promise-probe.json). This is outside the nine semantic cases, which cover rejected Promises from focus restoration and completion/update paths but do not return a Promise from either post-commit snapshot method.

The runtime should apply the same synchronous-result guard before validating both snapshot results. Add regressions for each rejected Promise, keeping the existing post-teardown fail-closed/no-rollback semantics and asserting that no unhandled rejection is emitted. Declared async methods can still be rejected during preflight; regular functions returning thenables must be checked after invocation. I made no production changes in this review.

## Contract and report wording

The contract's general statement that every method result is checked for a thenable and its post-commit-observation failure rule are broader than the current runtime guard at the two snapshot-method calls above. There is also a small focus-pair wording ambiguity: the implementation captures focus only when both old and candidate renderers provide the pair (`focusSupported`), while CONTRACT.md says to capture whenever the old renderer implements the pair. Clarify the latter as “when both renderers implement the pair” for the optional third-party renderer case.

R-CONTRACT.md line 28 says N6's “8/8 result,” while its execution section and receipt both record **9/9**. Correct that stale count.

## Preserved history and N3 boundary

The historical XR--CONTRACT report and receipt remain present with SHA-256 `b2e68fa43543a6468733998cf4c55233f632feb9576df76b23f0165ef4223043` and `29b7a5076a5abab2819f6a5b9a91799f632b4324ce0adb859f0f0712388e8054`. Its pre-amendment source hashes remain recorded: CONTRACT `82ee318d1f8e5788fe1a7b405855465292e9eaa7f5986d19ff43f489a87d073f`, PLAN `c2fa778603e6fdb835b8d0ac778fbcd0c5ab0a011a298d631cb34cadcc9886cd`, semantic test `dc2f4c7244a8c5bf1804c43e9710ec3b29085211de33df11fc032fa4b1e94b53`, and pre-repair runtime `a35338302fc391499575fe7d3c7c59c41a3eeaddce23a3039f0a13d84ac94ae2`. The old XR--CONTRACT probe script/result remain at SHA-256 `c54a1170fe850d259f1dce9ee22890616427e3716dfb78a18c6c48b176e0f06e` / `9b4879df48ceb42ef1e1de302de2faf3f77a4f02b8ab3b10f06f6a43354816c2` and retain the original `restoreFocus(undefined)` false-success observation. The XR--BUILD report, receipt, and build-audit hashes still match the R-CONTRACT preservation record: `c775352b26a6a52e8baf218304773ea3cf45e421bd2697fb2ed8450155bd9dbd`, `baf7e7a5b6e837628fa287c71759ab166a13ba7b18d604d9143a9559062c680d`, and `6f34de936802975cb28fd40e89a2f7d9986949c771e1188dd3d36783d518a04e`. `zero_backend_repro.go.txt` remains byte-identical at SHA-256 `f5cd990adeb80587d8decbfd9fdf13e6f7e779cbb11499f6f99502668f083196`; the old `.go` pathname is absent and no `.go` files occur under `compiled-backends/evidence`, so this artifact does not enter Go package source discovery. R-CONTRACT's references to the earlier E-RUNTIME, E-DOM, and E-BUILD failure histories are preserved.

N3's `attempt-07` captures remain separate integration evidence. The effect run rejects with `swap 1 lost the keyed input focus or selection witness`; its browser event records identical before/after focus on swaps 1 and 2 (`["effect","effect-input"]`, selection `14..14`, direction `forward`), and the effect fixture declares `focusWitnesses: []`. That run pinned `conformance/check.mjs` at `54f4755…`, while the current file is `e0327c…`, so its `sourceStable: true` only attests stability during that attempt. The attempt-07 form, list, and list-growth browser captures also reject at the post-swap DOM oracle; their captured React hash is older than the current React renderer hash. These captures do not establish current-source four-app acceptance, and this contract review makes no such claim.

## Independent commands and evidence

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-backends/evidence/semantic/swap-semantics.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-backends/evidence/semantic/swap-semantics.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node compiled-backends/evidence/reviews/xr-r-contract/postcommit-observation-promise-probe.mjs
```

The semantic suite passed **9/9**; the probe reproduced both unhandled rejections. Raw logs and source hashes are in [the review evidence directory](../../evidence/reviews/xr-r-contract/audit.md). Node emitted the existing experimental `UNDICI-EHPA` warning. This review changed no runtime, test, contract, or harness production source.
