# A-PRESERVATION — M0 and predecessor pin audit

## Result

**Outcome: mixed change.** This read-only audit compared the current working tree with the published PR9 base `d6d425765ee9d48eae22342a3cb75fab2e2871ba` (local tree `22016d39285f9d2776530f404a0cb5acbdf7f5c6`, matching the preflight record). The worktree contains four intentional refresh-related changes to predecessor-pinned host files, four historical PR8 pin exceptions, and a current `README.md` difference from M0. The README comparison includes a preexisting M0-to-PR9 change as well as the new append-only index section relative to PR9. The original checksum and delivery-manifest bytes remain unchanged.

## M0

```sh
sha256sum -c --quiet SHA256SUMS
# passed: all 24 entries
```

`SHA256SUMS` hashes to `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`, identical to the original M0 commit `ed3fd43b24a58375032a6bc8f9ef0411bcb0ad46` and PR9 base. All 24 listed files verify.

**Historical correction:** the six source hashes in the preflight were sampled from the PR9 baseline (`baselineSourcePins`), not from M0. Five of those six files match both M0 and PR9. `README.md` already differed between M0 and PR9: M0 SHA-256 `d902638d147b9d2dbffbcebd82e8a62ab388234c387fa0d3a798829f4e6d7540`; PR9 SHA-256 `55a3521ddd5e4321b251e1dd352cc8db7813a2d5d7be910b7a6d19d60caa1773`. Current README SHA-256 is `8f2d142a0544630ce1a6787cc33c1bd94d4c38a9281f05fe58ab71bbf3bd57ed`, reflecting the typed-composition append-only index section relative to PR9. README is not one of the 24 `SHA256SUMS` entries. The machine-readable comparison now labels the six values as PR9 preflight pins and records the distinct M0, PR9, and current hashes.

## Predecessor delivery manifests

All eight predecessor `delivery-manifest.json` files are byte-identical to their PR9-base versions. Their 796 pin entries yield 788 exact current matches and eight mismatches:

| Manifest | Pins | Exact | Mismatches |
|---|---:|---:|---:|
| `async-effects/evidence/delivery-manifest.json` | 72 | 72 | 0 |
| `backend-replacement/evidence/delivery-manifest.json` | 53 | 53 | 0 |
| `controlled-input/evidence/delivery-manifest.json` | 92 | 92 | 0 |
| `http-effects/evidence/delivery-manifest.json` | 100 | 100 | 0 |
| `interaction/evidence/delivery-manifest.json` | 56 | 56 | 0 |
| `keyed-editor/evidence/delivery-manifest.json` | 136 | 134 | 2 intentional T3 refresh changes |
| `renderer-conformance/evidence/delivery-manifest.json` | 141 | 137 | 4 preexisting PR8 exceptions |
| `session-tree/evidence/delivery-manifest.json` | 146 | 144 | 2 intentional T3 refresh changes |
| **Total** | **796** | **788** | **8** |

The four intentional mismatches are `keyed-editor/host.mjs`, `keyed-editor/host.test.mjs`, `session-tree/host.mjs`, and `session-tree/host.test.mjs`. Each expected pin equals its PR9-base hash; the current file adds the T3 refresh API and its focused test.

The four historical exceptions are `cmd/godom-wasm/main_wasm.go`, `cmd/godom-wasm/smoke.html`, `renderer-conformance/adapter.mjs`, and `renderer-conformance/adapter.test.mjs`. I independently compared each file in the available published PR8 commit `6f3bc3057bc67f99580b086e00e34a2dfe7dda22`, the PR9 base, and the current tree. All three hashes are equal for each path, confirming the existing PR8 exception record and no later change.

The other intentional T3 changes against PR9 are `multi-root/host.mjs`, `multi-root/host.test.mjs`, `multi-root/runtime.mjs`, and `multi-root/runtime.test.mjs`. None is an entry in any predecessor delivery-manifest hash map, so these changes are reported as unpinned additions rather than as preserved bytes or mismatches. The machine-readable audit lists their base/current hashes.

## Fresh tracked changes against PR9

The tracked diff contains exactly these paths:

- `README.md` — append-only typed-composition index section.
- `keyed-editor/host.mjs` and `keyed-editor/host.test.mjs` — T3 keyed refresh.
- `multi-root/host.mjs`, `multi-root/host.test.mjs`, `multi-root/runtime.mjs`, and `multi-root/runtime.test.mjs` — T3 root refresh and generation-guarded snapshot.
- `session-tree/host.mjs` and `session-tree/host.test.mjs` — T3 session-tree refresh.

Typed-composition feature files are new paths outside the predecessor manifests. The full tracked-path and pin-by-pin records are in [`inherited-pins.json`](../../evidence/inherited-pins.json).

## Limits

This audit verifies the original M0 checksum file and its 24 entries, compares the six PR9 preflight source pins against actual M0 and PR9 Git objects, and checks the eight predecessor delivery-manifest pin maps and their manifest bytes against PR9/PR8 Git objects. It makes no global claim about runtime behavior, unpinned files, or end-to-end preservation. No source, historic receipt, checksum file, or predecessor manifest was edited.
