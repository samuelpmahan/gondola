# R-T4 — focus and descendant witness correction

## Change

Reordered the existing 21-action `nested-renderer-changes-preserve-child-dom-and-focus` fixed script so each of its first three renderer changes is immediately preceded by focus/selection on that same session:

- focus `oak`, then replace `oak` with React;
- focus `branch`, then replace `branch` with GoDOM;
- keep `branch` interactive, focus `bud`, then replace `bud` with React.

The tree remains `oak → branch → bud`, with `elm` as the separate root. The script action count remains 21. The new targeted test checks each immediate focus/replace pair, a noncollapsed selection, the live descendant chain at replacement time, a focus action on the child immediately after parent replacement, and child interaction after child replacement. Actual physical DOM identity across replay remains the responsibility of T5's browser comparison; this unit test pins the schedule witnesses that let that comparison observe it.

## Test evidence

I added the targeted test first and ran it against the old script. It failed as expected: `oak` replacement was immediately preceded by focus on `bud`. After reordering:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test session-tree/scripts.test.mjs
# passed: 4 tests, 0 failures

CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test session-tree/reference.test.mjs session-tree/scripts.test.mjs
# passed: 9 tests, 0 failures; includes the pinned Chromium reference-renderer test

/tmp/gondola-node22/node_modules/node/bin/node --input-type=module -e 'import {fixedScripts} from "./session-tree/scripts.mjs"; const s=fixedScripts.find(x=>x.name==="nested-renderer-changes-preserve-child-dom-and-focus"); console.log(JSON.stringify({name:s.name,actions:s.actions.length,swaps:s.actions.flatMap((a,i)=>a.kind==="replace"&&["oak","branch","bud"].includes(a.name)?[{target:a.name,backend:a.backend,preceding:s.actions[i-1]}]:[])}))'
# passed: 21 actions; each target swap is preceded by focus on that same session
```

The T5 owner was notified with the final script and hash to rerun the browser/native replay. No integrated T5 replay result is claimed here. No model, host, renderer, or production source was changed.

## Final source hashes

```text
session-tree/scripts.mjs       53b93aebe11ef0a38b41de8b654df2973ba4a82be9a13423c49fb77997f17ac6
session-tree/scripts.test.mjs  95e80bff1788bb60701b2a0d7674dccffc90caf8edef12d98df641e94d197014
```
