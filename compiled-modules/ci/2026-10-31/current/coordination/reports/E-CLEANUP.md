# E-CLEANUP — renderer candidate cleanup

**Worker:** N5. **Outcome:** `mixed_change`. **Scope:** `compiled-modules/runtime/runtime.mjs`, `compiled-modules/runtime/runtime.test.mjs`, and this evidence packet. No Git, scheduler, Go fixture, ABI, demo, or other source paths were changed.

## Change

Renderer factories now assign each returned candidate to its cleanup-tracked variable before capability validation. If an initial parent or child candidate fails validation, mount cleanup calls `unmount()` on every candidate already created. If a swap candidate fails validation or rendering before commit, swap cleanup unmounts all returned candidates. Cleanup errors remain suppressed in these failure paths, preserving the original capability/rendering exception.

The new tests cover: a rejected initial candidate whose cleanup throws; an accepted parent candidate followed by a rejected child candidate whose cleanup throws; and a rejected swap candidate whose cleanup throws. They assert each created candidate is unmounted exactly once, the original capability error is preserved, initial rejection performs no Go `Init` or outer DOM write, and failed swap preserves old roots/state/call counts and leaves the old callback live.

## Verification

Test-driven red run before the runtime change: 4 passed, 3 failed on the new cleanup assertions. After the change, Node v22.23.4 checks passed:

- `node --check compiled-modules/runtime/runtime.mjs`
- `node --check compiled-modules/runtime/runtime.test.mjs`
- Targeted capability cleanup witness: 3/3 passed.
- Full focused runtime suite: 7/7 passed.

Exact commands, stdout/stderr, and exit codes are retained in `rawlogs/E-CLEANUP/`.

## Pins and limits

- Before: `runtime.mjs` SHA-256 `aa84e7c443ae7a72178ef20c36af5859e37ee11627b8a65865fa6eb8e0b08f9b`; `runtime.test.mjs` SHA-256 `dc79a062e9f74f9f56dcc87e6043df333cbdf9fe785f59d1ddf80261f1db4df5`.
- After: `runtime.mjs` SHA-256 `82aa27d2bad433ce945487c38aa3afcb5848655bd39cf62664aa8e94cb5eda42`; `runtime.test.mjs` SHA-256 `86046cacbac8802caaec8ae7b8982108a053ebb45a171305e619955046e2ab1d`.

The implementation changes only renderer candidate lifecycle cleanup. It does not change module ABI, Go transitions, callbacks, or bridge order. No mounted browser run is claimed in this packet; N4 is capturing against the pinned runtime separately. This packet does not claim arbitrary renderer or browser coverage.
