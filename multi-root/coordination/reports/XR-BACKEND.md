# XR-BACKEND — Independent review of backend transition validation

## Decision: accepted

Reviewed the backend-transition validator and regression test added on top of
the PR8 tree. The base checkout is commit
`06bf40e6f499d186f7f3e7944db251b6bd038bbb`, tree
`59139e1d03481919f615bc74840f2798de9fbdb5`; `multi-root/check.mjs` and
`multi-root/check.test.mjs` contain the root's local repair under review.
I made no implementation changes.

## Native allocation and chronology

The review dispatch was requested immediately before the native allocation.
My source inspection began before that allocation was recorded. The captured
`backend-review-native/epoch-00.json` then assigned XR-BACKEND to W4 at
`2026-10-30T16:11:32.906128Z`, with exact/native score 100/100 and zero broken
constraints. The state records the actual W4 start at
`2026-10-30T16:11:33.010340Z`. This review report was completed after that
start; the allocation is recorded as later than the initial review request
and initial inspection.

## Verification

The new guard checks every root and participant when the same mounted session
appears before and after a tick. The expected backend remains the prior value
except for a targeted candidate `replace`, where it must equal the requested
backend. This catches backend drift on siblings and on reference roots while
allowing unmount/remount generation changes to be validated by the existing
lifecycle checks.

I ran the complete focused suite with Node `v24.22.1`:

```sh
node --test multi-root/*.test.mjs renderer-conformance/adapter.test.mjs
# 40 passed, 0 failed
```

I also ran complete-oracle probes with valid native frames for all three roots
and both ticks:

| Case | Result |
| --- | --- |
| Targeted `renderer-failure` leaves alpha on `dom` | No issues |
| Targeted `renderer-failure` changes alpha from `dom` to `react` | `backend-transition` on alpha candidate, expected `dom`, actual `react` |
| Successful alpha swap from `dom` to `react` | No issues |
| Alpha failure probe changes sibling beta from `react` to `godom` | `backend-transition` on beta candidate, expected `react`, actual `godom` |

The prior false exclusion is now closed: failed replacement events remain
candidate-local and are semantically validated, and the backend state must
remain unchanged. Successful targeted swaps are allowed only for the
candidate root and must reach the requested backend. Sibling and reference
backend changes are rejected. No additional blocker was found in this repair.

## Browser evidence

I did not rerun browser tests because the temporary Go 1.24, Node 22, and
Chromium executables were absent. Root reports that CI run `41079481294` passed
all eight workflows and that retained-trace validation matched 63 scripts,
1,896 actions, and 11,754 observations with zero mismatches (raw SHA-256
`9a07a712e25ebaee207bfd858d42bf030394af37157d224cf36a5d9c92009aa`). Those are
root-supplied integration results, not an independent browser rerun in this
review.
