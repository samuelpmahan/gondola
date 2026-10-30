# Session tree milestone
Base: published PR8 head 6f3bc3057bc67f99580b086e00e34a2dfe7dda22, tree bdd7538539322904856ba9a41e3123005b3204e3. Local parent has the identical tree with a different publication commit ID. PR1 counter through PR8 are complete/green; no nested-work branch/PR found at reconnaissance. This branch is a stacked feature review, not a main integration.

## Contract and scope
Reuse collection.Session, multisession.Manager, the strict gobiMultiRoot WASM bridge, createMultiRootHost and the existing DOM/React/GoDOM renderers. Go owns an immutable parent relation over live typed SessionIDs. Roots have ParentID 0 and Depth1. Children always receive fresh IDs; createChild(0), unknown/dead parent and depth>32 reject atomically. No reparenting, shared state, persistence, arbitrary component compiler, pixels, IME, other engines or production services.

### Go and WASM (frozen wire contract)
Extend multisession.Manager additively:
- Create() is unchanged root creation. CreateChild(parent SessionID) (SessionID,error).
- Tree() []SessionInfo, ordered by SessionID, each {SessionID,ParentID,Depth}; root depth1, maximum32. Returned arrays/records are defensive copies and empty arrays are [].
- Dispose(id) keeps existing leaf behavior but rejects nonleaf BEFORE draining effects or mutating.
- DisposeTree(id) ([]Disposal,error), deterministic depth-first postorder: child IDs ascending, children before parent. Each bundle is {SessionID,Commands}, Commands are the existing queued-cancel-then-pending-row-order deduplicated cancels. Every node is removed atomically under one manager lock; no stale ID can dispatch/complete afterward. Unrelated roots/branches survive.
WASM gobiMultiRoot adds createChild(parentID), tree(), disposeTree(id) with exact arities/positive safe IDs and existing {error:string} failures. Existing methods/codecs keep their signatures. No API reset and no framework logic in Go collection.

### Browser composition (frozen public API)
session-tree/host.mjs exports createSessionTreeHost({manager,descriptors,transportFactory}).
- mountRoot(container,backend='dom') and mountChild(parentID,backend='dom') return {sessionID,parentID,depth,shell,viewRoot,childrenRoot}. Each shell nests viewRoot and childrenRoot as siblings. Child shells live in parent.childrenRoot. Renderer owns only viewRoot, so replacing the parent cannot erase child mounts.
- replace(id,backend); snapshot(id); tree(); snapshotAll(); settled(); dispose(id).
- snapshotAll records include sessionID,parentID,depth,backend,snapshot,audit,domSnapshot,focus,lifecycle,errors (plus harmless diagnostics).
- dispose(id) returns Go's postorder Disposal bundles. Fence ALL descendants before authoritative Go DisposeTree; cache each bundle for the flat host facade.dispose while unmounting leaf-first. Cancel each local request only in its own transport; continue cleanup and aggregate errors. Stale transports/facades cannot enter retired or newly created sessions. Reject unowned subtree nodes before mutation.
- Adapter create() delegates to raw create/createChild only inside a guarded synchronous mount allocation context. Block reentrant composition mounts, roll back failed mounts without orphan sessions, keep raw errors visible. Normal flat host disposal calls raw Dispose for a leaf. Do not call raw Dispose twice after DisposeTree.
- Parent/child descriptors and transports remain independent. Failed replacement rolls back only its renderer. No implicit shared-state update or parent event dispatch from a child's bubbling event.

### Independent reference and replay
session-tree/reference.mjs exports createSessionTreeReference(): Go-manager-shaped model with the same additive API, independent parent graph and existing independent JS collection models. Export mountTreeReferenceCollection as an independently projected pinned React renderer (compatible mount signature root,runtime,initial,onFailure); never consume candidate snapshots. scripts.mjs exports fixedScripts, seededScripts(seed,{cases,maxActions}), makeScripts({seeds,cases,maxActions}), ROOT defaults seeds20261030/20261031. Action wire:
{kind:'root',name,backend}; {kind:'child',name,parent,backend}; {kind:'add'|'fill'|'save'|'focus'|'replace'|'dispose'|'release'|'stale-release',name,...}
fill uses rowID,value; save rowID; focus rowID,start,end,direction; replace backend; release/stale-release requestID,value,error. Scripts use symbolic names mapped to fresh IDs, root/child names never reused without explicit disposal; generated scripts must stay valid, bounded, deterministic. Fixed witnesses must cover parent/child/grandchild and unaffected sibling root, same local requestID1 concurrently, disposal postorder, late callbacks, renderer changes at parent and child with retained child DOM identity and logical selection, parent recreation, failed/unknown-parent mount.
Use deterministic manual transports in the comparative replay with ordered start/cancel/delivery logs and real browser events. A concrete HTTP lifecycle smoke/demo may additionally use the existing HTTP lab; label manual vs HTTP precisely. Compare full Go state/tree/bindings/messages/audit, tree metadata, actual mounted per-view DOM/live values/disabled controls, focus/selection, ordered transports, postorder disposal and stale callback fences, sibling physical input identity. Required channels must fail closed and synchronized no-ops must fail independent action witnesses. Native CompareInteraction is mandatory for every nonempty per-session segment. Reference and candidate must be isolated documents/contexts. Do not weaken an invariant to achieve parity.

### Delivery and gates
run-session-tree.sh defaults to full run-multi-root.sh first; then builds the updated bridge/GoDOM, React/reference bundles and native comparator, runs Go tests/vet, relevant race tests, both bridge smokes, all new Node tests, executable nested demo smoke and default replay. New CI workflow installs Go1.24.x/Node22/pinned deps/standard Chromium and invokes same entrypoint.
Record exact versions/commands/seeds/action counts/mismatches/traces. Preserve all M0 receipts and historical manifests; list intentional prior source changes separately. Keep failures and repairs, never overwrite original receipts. Root owns branch/Git/shared docs and integration; six workers have disjoint paths. No merge, deployment, Slack or email.

Acceptance: real nested demo plus fixed/default seeded browser replay and nonempty native comparisons pass, full inherited suite passes, independent cross-review fixes are accepted, fresh feature-PR CI passes. Next boundary afterward: explicit typed parent/child messages or inputs, not shared mutable frontend state.
