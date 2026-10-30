# Replaceable renderer milestone

Starting checkpoint: interactive-counter PR #1 at 534c9d239af83c7d9d51b035d6c0f7c2d35a7bf5. It is open, with green standalone and combined Inertia/main CI. Current main 3b46301e69104d82298126e58e0c65565825a4c4 remains untouched. This work is a stacked PR targeting PR #1's branch, with no edits to that branch.

Goal: run the same compiled Go counter with two interchangeable frontend implementations, and replace renderers during a live session without resetting Go state or the ordered message log.

Implementation: existing DOM renderer; new React-backed Node renderer; a host that calls real Go Init once, caches accepted snapshots and supplies a per-mount facade; a three-way browser oracle comparing both Go-backed candidates with the independent React counter. Scope is the existing counter subset and synchronous event policy. No application transition is translated to JavaScript.

Native Rebalancer 1.0.4 allocated six slots before implementation dispatch (score600/600, zero reported broken constraints):

| Worker | Packet | Ownership |
| --- | --- | --- |
| W1 | E3 | scripts, three-way harness, negative comparison tests |
| W2 | E6 | native allocation, receipt ledger, contract review |
| W3 | E5 | runnable demo, runner, CI, usage documentation |
| W4 | E1 | React Node renderer |
| W5 | E2 | lifecycle host and unit tests |
| W6 | E4 | browser adversarial tests |

Each worker is Luna6 at XHigh. The lead alone owns Git/integration. Authoring writes are disjoint. Harness execution waits for host+renderer+assets. Independent cross-review assignments are selected after authoring; every reviewer excludes the lane author. Solver proposals, platform dispatch, actual observed results and acceptance remain separate records. The legacy probe's extraction-only finish schema is not used to fabricate implementation outcomes.

Host API: createBackendHost(root,runtime,backends,initialBackend='dom'); backends is a name-to-mount-function object. Both mount functions accept (root,runtimeFacade) and return snapshot(),domSnapshot(),click(path),unmount(). Host also offers replaceBackend(name),backendName(),unmount(). snapshot is the original Go {state,tree,messages}; domSnapshot is {html,disabled: child-index paths}. Root paths1/2 identify Add/Reset. Unknown backend requests leave the current renderer usable. Same-backend selection is idempotent. Epoch fences reject stale dispatch facades.

Proof required: original static+interaction checks remain passing; meaningful host unit tests; seeded/fixed three-way scripts including many swaps while Count>0; strict State/tree/DOM/disabled/message-order observations after every action; initializations remain isolated; native Gobi Trace comparisons; disabled Reset suppresses messages; invalid and repeated replacements; stale detached controls and unmount cannot mutate Go; failed runtime/rendering paths preserve host snapshots or fail closed; executable demo and CI artifacts. Preserve all earlier receipt bytes and record source-scoped new receipts rather than rewriting historical manifests.

Non-goals: generic compiler support, new application components, effects, keys/reconciliation guarantees, focus/selection retention, pixels, concurrent React scheduling, Firefox/Safari equivalence, merging or deployment. A second backend here means a concrete renderer consuming unchanged Go-produced Nodes, not a universal Go-to-React source compiler.
