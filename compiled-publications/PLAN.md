# Typed keyed publications implementation plan

Goal: carry typed parent inputs and delayed child publications through Go-owned dynamic children across replaceable React and DOM.
Architecture: extend the admitted value/slice fixture in a new package, reuse compiler and shared host; Go owns the queue, captured payload and validation. Node22, nativeGo1.24, compilerGo1.27.3; pinned existing locks.
Spec: CONTRACT.md. User authorized autonomous execution without approval pauses.

Six disjoint tasks: N1 Go fixture/native CLI; N2 actual compiler/encoder proof; N3 host and closed policy adapter; N4 native/direct/mounted seeded replay+mutation checker; N5 independent literal fixed oracle; N6 demo+runner+CI+docs. Root owns contracts, Git and scheduler. Test concrete counterexamples before implementation where useful. Compiler/host/harness production integration waits for frozen Go shape; oracle fixtures coordinate with N1 without editing its scenario; N6 assembles only after all consumers exist. Send deviations to root instead of inventing incompatible types.

Review focus: stale generation and revision, reordered publication delivery, slice-history mutation, disabled click bypass, compatible/incompatible swaps with pending effects. N1 tests these typed transitions; N3/N4 test browser dispatch/control behavior; N5 checks literal values independently; N6 tests HTTP delivery and standalone artifact integrity. Preserve old failures and capture each run in unique outputs.

Every author gets a native-assigned independent reviewer. Receipts live coordination/receipts/<job>.json (job_id,worker,summary,outcome; reviews decision). Reports and raw logs remain owned perlane. Seal only AFTER final validation and exact SHA read; after final message no edits. Root snapshots immutable author bytes before nativefinish. No entire output recopy or full local inherited pipeline until disk budget allows; full CI is required before ready.
