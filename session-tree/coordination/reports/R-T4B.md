# R-T4B — capacity and same-alias stale callback witnesses

## Change

Updated only `scripts.mjs` and `scripts.test.mjs`:

- The postorder witness now adds oak rows 3 and 4 before disposing oak. Oak reaches the collection's four-row limit, while the original two save actions and their cancellation behavior remain unchanged. The fixed script grows from 27 to 29 actions.
- The recreation witness now remounts `orchard`, then child `fruit`, then grandchild `seed`, reusing the same symbolic aliases after the old orchard subtree was disposed. It dispatches the retired seed's request 1 callback only after the new seed is mounted and before the new orchard starts its request 1. The fixed script grows from 16 to 18 actions.
- The focus/replace witness remains 21 actions. Fixed counts are now 29/21/18 (68 total); generated schedule construction and seeds are unchanged.
- The script validator now accepts a stale callback for a disposed generation after its symbolic alias has been reused, but rejects the action if the current generation has already allocated that same request ID. This matches T5's retired-transport lookup and preserves the fencing condition.
- New targeted tests pin the four oak rows/two original saves and the old-dispose → same-alias remount → stale old seed request → new orchard request ordering. The script validator independently checks that the old pending request existed before disposal and that the new generation has not reused request ID 1.

## Test evidence

I added the targeted tests first. Against the original scripts, they failed on the expected fixed-action counts (`27 !== 29`, `16 !== 18`). After the schedule and validator changes:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test session-tree/scripts.test.mjs
# passed: 6 tests, 0 failures

node --input-type=module -e 'import {fixedScripts,makeScripts} from "./session-tree/scripts.mjs"; console.log(JSON.stringify({fixed:fixedScripts.map(s=>({name:s.name,actions:s.actions.length})),defaultCount:makeScripts().length,seededCount:60}));'
# passed: fixed action counts 29/21/18; 63 default scripts (3 fixed + 60 generated)
```

T5 was notified with the updated sequence and source hash. Its checker currently has an expected-count assertion that must move to 29/21/18; T5 confirmed it will update that owned test and bind the replay witness to the alias-reuse order. The integrated browser/native replay is pending; no browser gate result is claimed in this receipt.

## Final source hashes

```text
session-tree/scripts.mjs       17707f0ca1b6147a25cd6a121e444189900f5b06ed512906d43766cda0e01631
session-tree/scripts.test.mjs  ed2588447d2de094694c1b50324875c238aa27e1a840d248658b6f313f7a18b8
```
