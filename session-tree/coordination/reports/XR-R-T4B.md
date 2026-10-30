# XR-R-T4B — fixed schedule repair review

## Decision: accepted

Reviewed the repaired fixed schedules and schedule tests against the requested XR-T5 coverage. Both assigned file hashes match. No source files were changed in this review.

The postorder witness now adds two empty oak rows after its two existing saved rows, reaching the four-row collection cap immediately before disposing oak. The extra rows create no drafts, requests, or cancellation commands; the test asserts there are still only two oak saves and no fills for rows 3 or 4.

The recreation witness disposes the old orchard subtree, remounts the same orchard/fruit/seed symbolic names, then issues the old seed request-1 callback before creating any request in the new seed. `lookupRetired()` searches histories newest-first but selects a history only when that transport owns the request ID. The fresh seed has no request 1, so the lookup reaches the retired seed transport. The checker then compares the live tree and active session snapshots/audits before and after delivery while the recreated subtree is nonempty. The script test asserts this ordering and that the recreated seed does not save before the old callback.

The fixed schedule counts are `[29, 21, 18]`. The six schedule tests passed, including deterministic/bounded generated schedules and the new explicit cap/recreation witnesses.

## Verification

```sh
node --test session-tree/scripts.test.mjs
# 6 passed, 0 failed
node --check session-tree/scripts.mjs
node --check session-tree/scripts.test.mjs
```

| File | SHA-256 |
| --- | --- |
| `session-tree/scripts.mjs` | `17707f0ca1b6147a25cd6a121e444189900f5b06ed512906d43766cda0e01631` |
| `session-tree/scripts.test.mjs` | `ed2588447d2de094694c1b50324875c238aa27e1a840d248658b6f313f7a18b8` |

This is a source and schedule-unit review only. It makes no integrated browser replay or native-comparison claim for the repaired schedules; the prior default green report was produced before these schedule changes and remains historical evidence for that earlier input set.
