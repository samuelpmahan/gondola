# XR-R-T2 — independent review of bridge and host admission repair

## Decision

**Accepted.** The repair closes the reviewed WASM own-field/reentry gaps and
prevents the public host from normalizing caller input before Go admission.

## Reviewed

Read the XR-T2 amendment, H-HOST report and retained pre/post host probes,
R-T2 report, current `main_wasm.go`, `bridge_decode.go`, direct bridge smoke,
`host.mjs`, `host.test.mjs`, `WIRE.md`, and `XR-R-T2.diff`. Compared the changed
source with `evidence/source-before-review.tar.xz`; the original failure
artifacts remain in place. I did not edit production source or rerun the host
unit suite.

## Findings

- Every exported bridge method enters `method()`, which sets the
  `bridgeRunning` fence before argument validation or schema decoding and
  clears it with `defer`. This covers proxy `ownKeys` and descriptor traps as
  well as ordinary accessors; nested exported calls return an error without
  entering the manager.
- `exactDataFields` rejects null/undefined, arrays, unknown/missing fields and
  symbol keys. It captures values only from own descriptors returned by
  `Reflect.getOwnPropertyDescriptor`, and requires each descriptor to have an
  own `value` property. It does not read input fields with `Reflect.get`, so
  accessors and inherited-value fallback are rejected without invoking input
  getters. Trap failures are converted to errors. The source and wire contract
  correctly limit this claim: arbitrary JavaScript side effects outside nested
  bridge calls are not rolled back.
- The public host passes the original `args` references through
  `Reflect.apply(manager[method], manager, args)`. It clones only the manager
  result after admission, so symbols, non-enumerable properties and accessor
  descriptors reach Go unchanged for validation.
- The retained post-repair host probe binds the observed result to WASM SHA-256
  `3e2ad04fc31bab0684c942590b3f030d83328e6b43e513bd69e8bafc5fdb87cc`, current
  bridge/decoder source hashes
  `6030447ef75d87188c9fd58b24b87f386288f5f399b44d6e3724243cc9fd5459` and
  `9e07552eeadd896575209f4ec3e5406ba0b0f0264131d9366e46fb47b59f6893`, and
  host hash
  `e030ff3e1f10a19b2a520f7b652df5e1bc14cb7d5d33bc2f10076f0d11685f3c`.
  Its symbol input is rejected through the host without changing the child
  title/revision; the accessor getter count is zero, no nested session ID is
  created, and manager/host trees remain `[1, 2]`.
- I ran the bounded direct bridge browser smoke against that same WASM. Its
  retained result reports 16 methods, 18 malformed schemas rejected, six
  unsafe IDs rejected, zero accessor reads, both ownKeys and descriptor trap
  reentry blocked, and valid methods usable after the failures. Result file:
  `coordination/reviews/xr_r_t2_post_repair_smoke.json` (SHA-256
  `cea5d277f57a06f318599a9beaddf64c47e901152fdefa6d5ac17201794b8f4c`).
- The original reentry probe still records the pre-repair mutation: outer
  invalid input allocated session 3 and fabricated keys published inherited
  title data. Its original raw output hash remains
  `b2f37464fddb3a3e61630cf23b04f346aeaf5bc5dc891e6b580d85c842791fca`.

## Verification limits

This review did not rerun the author’s host tests, full runner, or seeded
oracle. It does not claim a broader JavaScript sandbox or rollback of arbitrary
proxy-trap side effects. The integrated full runner remains root-owned and
pending.
