# E-CI-DEMO — current-source managed-CI demo audit

**Audit outcome: `confirmed_reuse`.** The fresh primary managed-CI artifact contains a full successful methods run and the real HTTP demo smoke for the exact published source commit and tree. The executed methods runner labels its implementation outcome `mixed_change`; this audit outcome means the pinned implementation was actually exercised in that current-head CI run. It does not claim raw React/DOM compiler bundles are byte-identical.

## Source and primary artifact

The published checkout is `6b49cc0bd4c9512a041f723c86b632ec506afd9d` with tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81` and parent `8ed5b66a223de1992756516f8d3895c6e096f842`. Its current publication record SHA-256 is `d138fb5a364348b9ea7f218c2ffdfd32fd46bc083977fa40c68455edff3c835a`. The compiled-methods runner source SHA-256 is `eb1aa250c0c9cfbb7f3d73abf7692f8e50a57314836f8e5d0ac7d53a77a3cb68`. The CI execution receipt contains 137 before/after source pins, reports `sourcePinsMatch: true`, and the audit verified every pin against the checked-out source.

The selected primary push run is `41169518187`, job `124444234335`, artifact `13030848292`. The job snapshot records the job and the `Install Playwright managed Chromium`, `Run inherited gates and compiled method demo`, and `Preserve method and inherited compiler evidence` steps as completed successfully. Snapshot: `compiled-methods/ci/2026-10-31/lanes/evidence/snapshots/jobs-2026-10-31T050732-682Z-6b49cc0-terminal.json` (captured `2026-10-31T05:07:32.682Z`, SHA-256 `408aca6aec71391933281fdf078ad23f62665844f01d0125461d642571b87172`).

The provider ZIP is 11,460,089 bytes with SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`. It is retained as 3 chunks; the audit reassembled and verified the exact ZIP hash/size, its 968 manifest members, and all extracted members. Provider metadata agrees on the run, source SHA, artifact ID, size, digest, and successful workflow outcome. `primary-demo-audit.json` records 164 passing checks and no failures.

## Full CI execution

The CI runner invocation was `bash run-compiled-methods.sh` with no `--methods-only` flag. Its receipt status is `passed` in `full` mode, for attempt `compiled-methods/artifacts/attempts/attempt-20261031T044100445Z` (2026-10-31T04:41:00.445Z–2026-10-31T05:05:25.193Z). The 17 outer commands all exited 0 and their stdout/stderr artifacts match the recorded hashes:

| # | Command | Exit |
|---:|---|---:|
| 01 | `inherited-full-runner` | `0` |
| 02 | `syntax-runner` | `0` |
| 03 | `syntax-demo-app` | `0` |
| 04 | `syntax-demo-build` | `0` |
| 05 | `syntax-demo-smoke` | `0` |
| 06 | `syntax-shell-runner` | `0` |
| 07 | `syntax-shell-inherited` | `0` |
| 08 | `version-root-go` | `0` |
| 09 | `version-compiled-go` | `0` |
| 10 | `method-owned-node-tests` | `0` |
| 11 | `method-go-tests` | `0` |
| 12 | `build-native` | `0` |
| 13 | `compile-react` | `0` |
| 14 | `compile-dom` | `0` |
| 15 | `method-conformance` | `0` |
| 16 | `build-http-demo` | `0` |
| 17 | `http-demo-smoke` | `0` |

Command arguments, working directories, log paths and stdout/stderr SHA-256 pins are in the archived execution receipt `compiled-methods/ci/2026-10-31/extracted/compiled-methods/coordination/receipts/E-DEMO.json`. The first command ran the inherited `bash run-compiled-backends.sh`; the nested full backend receipt inside the retained artifact is `compiled-backends/coordination/receipts/E-DEMO.json`, SHA-256 `591c5a6bb5712cfd831c51d5a0d81d32e67cab01c4ebbe3053c5283e87b968b1`, with 18 successful inherited commands. The local incomplete full-run attempts described below are not substituted for this CI execution.

The runner built and compared React and DOM profiles. Each build retained 67 output pins before/after the matrix and the 67-row inventories remained stable. The AppIR and encoder outputs are byte-identical; manifests compare equal after removing only the backend tag. Raw GoScript bundle hashes differ: React `2cdfb64e7232627bbd7fe3f7470990a09e36f3f6e09808d950ceeeb1369c8337`; DOM `457f16106ac40117aa0fcf8be891b54130755b8be3d4ff92fd39d2d6f2aae795`. No raw bundle equality is claimed. The HTTP site was built from the React output and its actual module is pinned by the site bundle below.

The conformance matrix matched native, direct, React, DOM and swap behavior: 19 ticks, 18 fixture actions, 4 suppressed child-control intents, and 18 renderer swaps. It reports 14 value-semantics checks; the saved-child witness confirms the captured value is published after later child edits.

## Actual HTTP demo smoke

The browser smoke was served from `http://127.0.0.1:46363/` and used managed Chromium `156.0.8078.4`. `CHROMIUM_PATH` and `CHROMIUM_EXECUTABLE_PATH` were both unset in the runner environment; the smoke command did not provide `--chromium`. The smoke record reports status `passed`, 14 accepted Go dispatches and 3 actual renderer swaps, ending on `dom` with Go state `{"parent":0,"child":2,"readOnly":false,"savedChild":1}`.

The smoke assertions check full Go snapshot equality and unchanged tick count across renderer replacement. The successful command ran against the source-pinned `compiled-methods/demo/smoke.mjs` (SHA-256 `488143df10d2b8aae31950ba115420401ead04dc6b03db1c687fcced4270e171`). The smoke explicitly checked the value capture/publish flow, child-only read-only suppression, React/DOM state retention, and disabled zero reset controls. There were 0 browser errors, 0 WASM requests, and 0 WASM API attempts.

| HTTP resource | Status | Bytes | SHA-256 |
|---|---:|---:|---|
| `/` | 200 | 4,346 | `9551977e3b6899a868bf5cda8d1acdf81461f74e83a9cf09578280c05acb3704` |
| `/demo.css` | 200 | 8,097 | `1513ffe54275bc970a3910d1cd51891b23cd76aa57495290cffc30f16d9275e0` |
| `/demo.bundle.mjs` | 200 | 1,800,935 | `ba7db6f481b9a8fc67959b4febacc63ef4b0c2feed2d92c3c7c26a34d4e9f0c5` |

The screenshot is `compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/http-demo/demo.png`, 244,666 bytes, SHA-256 `623f8f010d87c0c2c2f1e709ce2daec64c11a1bfca508a1071352682ec7ba55b`. I visually checked the retained capture: it shows the completed parent/child Go state, disabled zero reset controls, DOM selected, and the visible runtime state panel. The smoke JSON is `compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/http-demo/demo-smoke.json`, SHA-256 `412f3c341dfdf67a521defef21965e0a2c993cb9cefb89fd6aabbf58060fe80d`. The site pins immediately before and after the smoke are equal.

## Audit reproduction

The independent audit command was:

```sh
python3 compiled-methods/ci/2026-10-31/lanes/demo/audit.py ci \
  --artifact-root compiled-methods/ci/2026-10-31/extracted \
  --receipt compiled-methods/ci/2026-10-31/extracted/compiled-methods/coordination/receipts/E-DEMO.json \
  --source-root . \
  --retention compiled-methods/ci/2026-10-31/artifact-retention.json \
  --provider-metadata compiled-methods/ci/2026-10-31/primary-artifact-metadata.json \
  --workflow-snapshot compiled-methods/ci/2026-10-31/lanes/evidence/snapshots/jobs-2026-10-31T050732-682Z-6b49cc0-terminal.json \
  --output compiled-methods/ci/2026-10-31/lanes/demo/primary-demo-audit.json
```

It exited 0 under Python 3.12.14 and returned `passed`, 164 checks, zero failures. Audit script SHA-256: `f9b2143844af0cbd19ccb72b700cde046670bd14dc5aee0700dbfd01d01a1127`. Machine result SHA-256: `b1a43514f2b943d38caad7ea9cd03136baddd163df3eff571c2285f0fc25ac5c`.

## Local history and scope limits

The local preflight remains separate: `compiled-methods/ci/2026-10-31/lanes/demo/preflight/local-demo-audit.json` is `passed` with classification `local-preflight-only` and SHA-256 `bf2700eab73118fcd4bb771c4bbc6d00eb72e7777fb1456c359a22ee18578722`. It records a standalone M0 pass and a methods-only pass, but also records the local inherited full attempt as incomplete. The exact status correction is `compiled-methods/ci/2026-10-31/local-execution-status-correction.json` (SHA-256 `a644fb6e2b3d0bca93dd805474f2a7df73b41de009c7afaa83f25f82eb8146fb`): the first local full attempt stopped after source-pin drift; the next has no terminal receipt or exit code. Neither is reported as a local full pass. The older `8ed5b66a223de1992756516f8d3895c6e096f842` artifact is not used for current-head acceptance.

This report covers the selected current-head push job and its method-demo artifact. It makes no claim about the aggregate PR status or unrelated workflows. No production source, CI artifact, or Git state was changed for this audit.
