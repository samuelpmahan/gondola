# E-COVERAGE — include archive-helper tests in producer verification

**Worker:** N2  
**Decision:** implementation complete  
**Scope:** only compiled-modules/run.mjs and .github/workflows/gobi-compiled-modules.yml were changed.

## Change

The producer source inventory now explicitly pins compiled-capabilities/archive-helper.test.mjs. Its existing focused Node test discovery now searches compiled-capabilities alongside the existing ABI, runtime, conformance and oracle directories. The producer retains a single Node test invocation, so the seven archive-helper tests run as part of that existing test stage.

The workflow path filters now include compiled-capabilities/archive-helper.test.mjs under both push and pull_request. The existing helper implementation path was already present. No effect counts, profile counts, output schemas or acceptance logic changed.

## Verification

- Node 22.23.4 syntax check of compiled-modules/run.mjs exited 0.
- Node 22.23.4 ran compiled-capabilities/archive-helper.test.mjs: all 7 tests passed, 0 failed.
- actionlint v1.7.12 accepted .github/workflows/gobi-compiled-modules.yml.
- A mechanical check passed: the test appears exactly once in sourceFiles, compiled-capabilities appears once in focused-test discovery, the runner still has one focused Node invocation, and the test path appears in each workflow filter exactly once.

The Node processes emitted the environment’s existing experimental EnvHttpProxyAgent warning on stderr; commands exited 0. The complete producer/profile pipeline was not launched.

Exact commands, stdout/stderr, exit codes, mechanical-check source and raw evidence hashes are recorded in module-coordination/rawlogs/E-COVERAGE/index.json.
