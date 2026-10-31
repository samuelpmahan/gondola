# E-PORTABLE — PATH-based tool selection

**Worker:** N6  
**Outcome:** `mixed_change`  
**Scope:** portable tool resolution and its focused tests; no full qualification profile.

## Changes

Removed machine-local `/tmp` Go, Node, Python, and Chromium fallbacks from the owned qualification wrapper/runner. The shell wrapper resolves `go` and `node` from `PATH`, with `GOBI_GO_BIN` and `GOBI_NODE_BIN` as explicit overrides. The runner resolves `go` and `python3` from `PATH`, with `GOBI_GO_BIN` and `GOBI_PYTHON_BIN` overrides. It passes the resolved Go and Python paths to the existing producer. Invalid explicit paths fail closed; they do not silently select another executable. The archive consumer uses Python's standard library and has no rebalancer package dependency.

Added `module-qualification/run.test.mjs` and made the runner execute it before starting the producer. Its four tests use isolated executable stubs to verify default PATH resolution and actual execution, explicit Go/Python override selection, invalid override rejection for Go and Python, and the wrapper's real Go/Node selection under restricted PATH plus invalid-override rejection. The test file is included in the runner's source snapshot. Updated README and RESULTS to state the PATH and override contract, Linux/amd64 boundary, and that a renderer factory ID alone does not qualify a new backend; another frontend requires the same Go module-ABI/renderer contracts and explicit Go-checked capture-profile admission.

The old E-DELIVERY and XR-DELIVERY report/receipt bytes were preserved unchanged.

## Validation

`node --test module-qualification/run.test.mjs` passed **4/4**, with zero failures, skips, or todos, under Node `v22.23.4`. `node --check module-qualification/run.mjs` and `bash -n run-module-qualification.sh` passed. The wrapper `--help` path succeeded with explicit Go and Node overrides. Workflow YAML validation passed: push and pull-request path filters match, the filter has 38 paths, and the job-level `SOURCE_COMMIT` matches the checkout ref.

A wrapper invocation without a Go executable on PATH and without `GOBI_GO_BIN` exited `127` with `GOBI_GO_BIN must name an executable, or go must be available on PATH`. This is the expected fail-closed behavior; the isolated-PATH and override tests verify successful selection. Tool versions observed: `go1.24.0 linux/amd64`, Python `3.12.14`, and Node `v22.23.4`.

One earlier workflow-log capture command referenced its parser file before that file was created; its `python3` file-not-found output is preserved. The corrected parser command ran and passed the workflow checks above.

## Boundaries

No fresh GoScript/compiler/browser producer, Go verifier suite, archive round trip, Milestone 0 run, counter interaction run, or hosted CI run was performed for E-PORTABLE. Root will run the full profile only after publishing a clean source checkpoint. Linux/amd64 is the only exercised platform; this change makes tool discovery PATH-based and does not claim Windows/macOS archive support.

The focused test proves tool selection and fail-closed override behavior. It is not a qualification of the application profile or additional frontends. The existing Go capture verifier still admits its explicit finite React/DOM/swap matrix only.

## Evidence

Command output, versions, final source pins, prior-packet preservation hashes, and the rawlog index are under `native-module-coordination/rawlogs/E-PORTABLE/`. Source-pin record SHA-256: `1f2fa07f991dfbb6f4d451ce22f59d1653f4240613e1f788a094950894bc2391`. Command-record file SHA-256: `8cd6eb9b5e0846b694863d26f5ab59f972d5d1d7fa10357218988b2ae2325af2`.
