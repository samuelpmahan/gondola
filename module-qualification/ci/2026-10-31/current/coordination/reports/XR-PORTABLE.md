# XR-PORTABLE — independent review of PATH-based tool selection

**Reviewer:** N5  
**Decision:** `accepted`

## Packet and source integrity

The sealed E-PORTABLE report and receipt match their seal hashes. All 27 author-indexed raw logs match their declared sizes and SHA-256 values. All ten source pins in the receipt match current bytes, including the wrapper, runner, new test, docs, workflow, mutation corpus, and helper dependencies. The previously sealed E-DELIVERY and XR-DELIVERY report and receipt hashes also remain unchanged.

## Independent validation

Node `v22.23.4` passed the focused `node --test module-qualification/run.test.mjs` command: four tests passed, with zero failures, skips, or todos. The tests exercise Go and Python stub executables in an isolated PATH, run those selected stubs, check explicit Go/Python overrides, reject invalid overrides without falling back, and execute the shell wrapper with stub Go/Node tools on a restricted PATH. I also verified that an invalid `GOBI_NODE_BIN` exits 127 rather than selecting the PATH Node. `node --check module-qualification/run.mjs`, `bash -n run-module-qualification.sh`, and wrapper help with explicit Go/Node overrides all passed.

The wrapper resolves Go and Node before execution and exports their selected paths. The Node runner resolves Go and `python3` from PATH unless their explicit overrides are set, rejects unusable override paths, and passes the selected Go/Python paths to the producer. The qualification runner includes the portable tool-selection suite in its source snapshot and runs it before starting the producer. No hardcoded task-local `/tmp` executable paths remain in the reviewed wrapper, runner, workflow, or docs.

The workflow YAML parses with identical push and pull-request filters (38 paths). It checks out the same PR-head/SHA used for `SOURCE_COMMIT`, installs Go 1.24.x and Node 22, and invokes the wrapper. Python is documented as unversioned `python3` from PATH and the job runs on `ubuntu-latest`; the workflow does not pin it with a separate setup action. The README and results accurately distinguish this focused tool-selection repair from a full profile run.

The docs describe the current finite Go-checked matrix: one parent/child fixture, fixed 24-event scenario, three 40-event seeds, React/DOM/swap profiles, and ten listed mutation controls. They require another frontend to implement the same ABI and renderer contracts, supply a capture adapter, and be added explicitly to the Go-checked matrix and replay suite. They say a renderer factory ID alone does not qualify another backend, and explicitly limit OS/architecture claims to Linux/amd64.

## Boundaries

This review establishes portable tool resolution and fail-closed behavior for the focused stubs on Linux. It does not establish hosted CI execution, a fresh compiler/browser producer run, Go verifier acceptance, archive round-trip, M0, or counter interaction. The author packet marks those as not run, and root owns the clean-candidate full run. No source, Git metadata, or native state was changed during review.

Exact command outputs, tool versions, source-pin audit, preserved-packet hash checks, and workflow/doc excerpts are under `native-module-coordination/rawlogs/XR-PORTABLE/`.
