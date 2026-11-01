# Independent keyed modules implementation plan
Goal: extend actual separately built Go modules to two keyed counter instances while keeping application authority in Go.
Architecture: Go parent owns a/b membership, generation and order. Existing modulechild/counter is built independently and instantiated per admitted identity. Shared ABI bridges move typed primitive input/publication records. Host applies the Go projection to physical renderer instances, fences removed lifetimes and preserves live children across order/swap operations.
Tech: existing Go24, GoScript/compiler Go1.27.3, Node22, React19.3.1 and DOM, Chromium.
Spec: CONTRACT.md. Scope and ownership: spec.json. Root sole Git/scheduler owner.
- [x] GO: freeze new keyed parent interface, test transitions and generation rejection, produce native composed oracle.
- [x] BUILD: build real keyed parent and child separately for both backends, verify descriptors/artifact byte binding and extra exported helper access.
- [x] HOST: reconcile Go membership without copying Go transition logic, test isolated states and removal/remount fencing.
- [x] HARNESS: replay one literal and three seeded scripts in native/direct/mounted React/DOM/swap profiles, compare exact observations.
- [x] ORACLE: independently validate healthy captures then run targeted mismatch controls.
- [x] DELIVERY: build prebuilt interactive demo and reproducible runner, capture commands/versions/pins/traces/archive inventory.
Gates: interface before cross-lane implementation; actual builds before browser acceptance; native baseline before healthy comparison; healthy baseline before negative-control acceptance. Native solver releases cross-reviews only after frozen author receipts, with a different worker. Repairs retain original findings and get independent re-review. Final clean-source execution, M0 and interaction regressions, published Git readback, PR ready. No main merge/deployment.
Review focus: sibling isolation; generation reuse after same-key remount; retained callbacks after removal and renderer replacement; DOM identity through reorder; bridge/seed/source identity coherence. Each belongs in native/host/harness/oracle checks rather than prose claims. Arbitrary graphs, asynchronous effects, other browsers, IME and pixels excluded.

All six source lanes independently accepted; clean-source E-RUN and independent XR-RUN passed. E-RESTORE AMEND preserved; E-RESTORE-SAFE / XR-RESTORE-SAFE closes the reproduced no-replace contract failure. Native state closes18 packets in9 independentpairs. Final Git publication readback is a separate delivery record.
