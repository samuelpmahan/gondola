# R-CONTRACT (N6)

**Outcome: `mixed_change`.** Updated the renderer-swap contract and semantic probes to distinguish pre-teardown focus-capture rejection from post-teardown fail-closed errors, and to require a strict boolean restoration result. The runtime fix itself was implemented by N1; N6 made no production-code changes.

## Contract and runtime findings

The earlier XR--CONTRACT review correctly identified two gaps in the initial implementation: focus capture can fail before teardown while leaving the old renderer active, and `restoreFocus` must not treat `undefined` as success. `CONTRACT.md` and `PLAN.md` now state the phase boundary explicitly:

- A throwing focus capture, thenable result, or malformed focus record is rejected before old-renderer unmount. The runtime remains unhalted and usable.
- Focus restoration is checked after the new renderer commits. Only literal `true` counts as restored. `false`, non-boolean, thenable, or thrown results fail closed after teardown; rollback is not claimed.
- Reentry from focus capture, renderer update, and focus restoration cannot cause a Go Update, dispatch ID, or hidden application tick. A held completion remains queued until after synchronous replacement returns.

I added semantic cases for extra focus-record fields, `undefined`, strict restore results, and dispatch/nested-replacement attempts from focus capture. The suite also verifies that capture-time one-shot completion is canceled if capture rejects, that a rejected native Promise from focus restoration is observed while failing closed, and that post-teardown commit failure, completion ordering, duplicate fencing, and cancellation remain correct.

## Execution

Executed with Node v22.23.4 against runtime SHA-256 `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105`:

```text
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-backends/evidence/semantic/swap-semantics.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-backends/evidence/semantic/swap-semantics.test.mjs
syntax check: passed
tests: 9
pass: 9
fail: 0
```

Full output is preserved in `evidence/semantic/r-contract-node22.log`; the syntax-check output is in `evidence/semantic/r-contract-syntax-node22.log`. Node emitted the existing experimental `UNDICI-EHPA` warning. N1 separately reports its full runtime suite passing 25/25; that count is peer-reported and is not included in N6's 8/8 result.

## Preserved review history

The XR--BUILD amendment artifacts were not rewritten. Their report SHA-256 remains `c775352b26a6a52e8baf218304773ea3cf45e421bd2697fb2ed8450155bd9dbd`, receipt SHA-256 `baf7e7a5b6e837628fa287c71759ab166a13ba7b18d604d9143a9559062c680d`, and build-audit SHA-256 `6f34de936802975cb28fd40e89a2f7d9986949c771e1188dd3d36783d518a04e`. To keep Go 1.24 root discovery from treating the review reproducer as a package source, `zero_backend_repro.go` was renamed byte-for-byte to `zero_backend_repro.go.txt`; its SHA-256 is unchanged at `f5cd990adeb80587d8decbfd9fdf13e6f7e779cbb11499f6f99502668f083196`. The historical XR--BUILD report and receipt still refer to its original filename.

The XR--CONTRACT review's pre-amendment source hashes are preserved here: CONTRACT `82ee318d1f8e5788fe1a7b405855465292e9eaa7f5986d19ff43f489a87d073f`, PLAN `c2fa778603e6fdb835b8d0ac778fbcd0c5ab0a011a298d631cb34cadcc9886cd`, and semantic test `dc2f4c7244a8c5bf1804c43e9710ec3b29085211de33df11fc032fa4b1e94b53`. Their amended hashes are recorded in the receipt.

## Limits and review status

The probes use fake renderers and stub Go symbols. They do not establish real DOM focus transfer or the integrated four-app browser matrix. No cross-build bundle-normalization claim is made. Independent cross-review of this R-CONTRACT amendment remains pending; this report is not self-approval.
