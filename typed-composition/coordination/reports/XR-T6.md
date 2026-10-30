# XR-T6 — Independent review of demo and delivery

## Decision: amend

T6's delivery is otherwise well scoped and the reported smoke exercises the requested application paths. I found one failure-path issue in the browser smoke's HTTP lab lifecycle:

- browser-smoke.mjs attaches its final lab exit wait only after calling lab.kill("SIGTERM"). If the lab exits before readiness, the readiness promise rejects from the earlier exit listener, then finally subscribes to an event that has already occurred and waits forever. A spawn error can also leave readiness to time out without a process exit event to await.
- Create one exit promise when starting the child, handle the child's error event, then kill if needed and await the already-created exit promise (or skip the wait when the child has already exited). This lets startup failures report promptly instead of hanging the CI job.
- demo.html says “The title and Published count appear in the parent collection view.” The policy sets the child's title; the parent view shows its own empty title and the Published count. Update the helper copy to say the child view shows the title and the parent view shows the count.

## Review checks

- The demo uses the real composition WASM manager and loopback HTTP lab. Its browser smoke starts http-lab, sets the child lane to held, observes a pending HTTP save, changes parent inputs to read-only, releases the real request, and checks that the Go collection completes while view controls remain disabled.
- The smoke then checks DOM → GoDOM → React renderer replacement with a new input element, retained draft/saved values, active focus, and the exact noncollapsed backward selection. It publishes the saved value, checks the parent Go Inbox receipt, disposes the child, confirms the receipt remains, and recreates the child with a fresh ID.
- The UI exposes the parent title/read-only controls, child response mode, renderer selectors, publish button, retained receipt view, and child disposal/recreation flow.
- run-typed-composition.sh starts with the inherited run-session-tree.sh, which starts the inherited run-multi-root.sh. It enforces Go 1.24 and Node 22, builds composition/GoDOM WASM and native replay, runs Go test/race/vet, both WASM smokes, composition Node tests, the browser smoke, and the seeded checker. No test-skipping switch is present. The two GONDOLA_SKIP_* workflow environment values are not used by these runners and do not bypass any gates.
- The workflow installs Go 1.24, Node 22, pinned interaction dependencies, and Chromium. Its artifact paths include typed-composition build outputs and the inherited build/evidence directories.

## Bounded verification

    node --check gondola/typed-composition/demo.mjs
    node --check gondola/typed-composition/browser-smoke.mjs
    bash -n gondola/run-typed-composition.sh

All three checks passed. I did not rerun the browser smoke because the root's full inherited runner was active and rebuilding shared HTTP/WASM assets. T6's author report records the successful focused browser run; this review does not claim the full inherited runner or seeded oracle passed.
