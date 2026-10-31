# E-LOGS — unique before/after Git command logs

**Worker:** N4  
**Outcome:** `mixed_change`

## Change

The delivery runner now gives the before/after `git rev-parse HEAD` and `git status --porcelain` commands unique names: `git-before-head`, `git-before-status`, `git-after-head`, and `git-after-status`. `execute()` still writes each command's stdout, stderr, and command record with exclusive `wx` files. The final source comparison can therefore log both snapshots without colliding on `git-head.stdout.bin`.

Focused test discovery now uses the existing compiled-modules ABI, runtime, conformance and oracle roots, then appends only the explicitly pinned `compiled-capabilities/archive-helper.test.mjs`, deduplicating and sorting the result. This avoids also discovering the two unrelated capability oracle/runner-acceptance suites under that directory. The single existing Node test invocation and the helper test source pin are retained.

## Verification

The preserved source `f984` producer log shows the earlier full run passed focused tests, fresh native capture, four builds, 12 conformance profiles and demo HTTP smoke, then failed at `final-source-pin-comparison` when the second Git snapshot attempted to open the already-created `git-head.stdout.bin`.

I evaluated the actual `execute`, `writeJSON`, `gitMetadata`, and `discoverTests` functions from the current runner source in a read-only regression harness. It performed both real Git metadata reads into a temporary log directory and created all 12 expected command artifacts, covering four distinct command records and their stdout/stderr files, without collision. Discovery produced five tests total: the four existing compiled-modules suites and the one pinned archive helper test; no duplicate path or extra compiled-capabilities test was present. The archive helper suite passed 7/7, and `node --check compiled-modules/run.mjs` exited 0.

The source diff from E-PARSER contains only the phase-specific Git log names/call sites and the narrow test-discovery adjustment. The prior whole-stdout JSON parsing fix remains in place. No profile counts or schemas changed. The full producer was not rerun here; root owns that run after source publication.

## Evidence boundary

The E-LOGS regression harness is stored under `module-coordination/rawlogs/E-LOGS/`. The earlier f984 failure log and command record remain preserved under `module-coordination/`; this packet does not overwrite or reinterpret them. No source outside `compiled-modules/run.mjs`, Git state, or scheduler state was changed.
