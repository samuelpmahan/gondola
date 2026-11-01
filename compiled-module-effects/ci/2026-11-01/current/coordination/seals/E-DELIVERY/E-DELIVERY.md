# E-DELIVERY — Native keyed module effects

**Outcome:** mixed_change  
**Status:** pending_clean_qualification  
**Phase:** author implementation and diagnostics frozen; clean E-RUN, independent demo/archive acceptance, and published readback remain pending.

## Implementation delivered

The profile adds a Go-owned cancellable request/reply child, its host timer transport demo, a reproducible four-build runner, a source-closure archive path, and CI coverage. The request name is a fixture label: the browser timer echoes the opaque Go token; there is no persistence or HTTP request. The demo source also records the actual rendered pending state immediately before transport.start, plus swap and remove/remount action sequences. Those browser smoke assertions are implemented but have not yet run in N6.

The workflow uses PR-head SHA on pull requests and github.sha on pushes, checks the checked-out HEAD, then passes that SHA to the profile wrapper. It pins Go 1.24.x and Node 22, installs the locked packages and Playwright Chromium, runs M0/counter/PR22 keyed regressions before the new profile, and uploads attempt/evidence paths with if: always(). Path filters include every one of the runner’s 23 explicit source pins, including .gitignore, .gitattributes, EXPECTED.json, and SHA256SUMS; push and pull-request filters match. Actionlint passed after the final filter update.

The primary profile closure is the new-effects/compiler/test dependency closure, not the full M0/counter checkout. Reproducing those inherited checks uses the full Git checkout with bash run.sh and bash run-interaction.sh; E-REG separately binds their 295 source inputs. E-REG’s isolated copy passed and was reviewed, but root still needs to bind that evidence to the final Git commit.

## Checks passed

The latest author diagnostic (attempt-20261101T031902805Z-2-00c0492f) used Go 1.24.0, compiler Go 1.27.3, Node v22.23.4, Python 3.12.14, Chromium 153.0.8010.0, Playwright 1.64.1, GNU tar 1.35, GoScript v0.6.2, and esbuild 0.28.2.

On the latest author attempt:

- Four independent React/DOM parent/child builds completed. The build index is 270,909 bytes, SHA-256 c2bc37cc8b7387972ac898e296cf91147494a1a8400758306b161672a274b0f5.
- New fixture/native Go tests passed: 13 tests across two packages.
- The focused module ABI regression passed (1 test).
- Compiler regressions passed: 4 analyzer tests (8 cases) and 1 Build stage diagnostic test.
- The four selected Node test files passed (21 tests total).
- The runner reached native/direct/browser capture generation for all four scenario tapes. The literal had 31 events; seeds 20261104/05/06 had 49/50/48, for 178 source events total. Native outputs contain 182 states, 58 effects, and 116 transport rows. All five profiles were captured for every scenario: 20 streams, 890 profile event rows, and 910 snapshots.

These captures are preserved for review. The N6 conformance attempt did not produce a successful parity/mutation summary. It stopped when the frozen N4 conformance CLI required exactly eight capture mutation controls, while the sealed N5 oracle had expanded the control set. The harness repair and a new clean-source E-RUN are still required; capture presence is not reported as accepted parity.

Independent checks also passed: actionlint v1.7.12; bash -n run-module-effects.sh; Node 22 --check for the runner and demo builder; wrapper --help with pinned Go/Node/Python executables; and the archive-helper test file (7/7 tests). The 21-test aggregate Node run also includes those archive-helper tests. Node emitted only the existing UNDICI-EHPA experimental proxy warning.

## Preserved author attempts

The exact command, environment, failure data, source pins, and logs for all three attempts are indexed at ../rawlogs/E-DELIVERY/index.json.

1. attempt-20261101T025304659Z-2-625e868d stopped in preflight because the runner incorrectly required a nonexistent root go.sum. The pre-repair runner and wrapper bytes are preserved. The runner now records the root file’s absence and pins go.mod as the evidence that the root module has no external dependencies; compiled-frontend/go.sum remains mandatory.
2. attempt-20261101T025457291Z-2-5a98b45e stopped in the build adapter because it rejected an attempt-specific generated TypeScript source comment. The accepted N2 path-normalization repair addressed this issue.
3. attempt-20261101T031902805Z-2-00c0492f completed all four builds and Go/Node tests and wrote the full four-scenario, five-profile capture set. The conformance CLI then failed on its stale eight-control expectation. Captures, source and command metadata, and failure are preserved under ../rawlogs/E-DELIVERY/attempt-02-conformance/. Four regenerable browser bundles (36,219,348 bytes total) and four duplicate native stdout files (6,279,000 bytes total) were not copied; their exact pins are in that attempt’s index. No primary archive was created.

## Final qualification still pending

The author attempts used base commit f4c8f70199a8ca896c13e225a85901abe658d0de with a dirty working tree. They are diagnostic evidence, not clean-source qualification. The latest failed attempt did not reach the real timer demo smoke, archive creation, independent archive consumer, or final source-stability checks. It also did not run M0/counter or the prior PR22 keyed regression; CI and the forthcoming clean E-RUN cover those separately.

The current frozen source closure contains 199 pinned files, including 56 test sources. Its complete author-local pin map is ../rawlogs/E-DELIVERY/source-pins-final.json (37,581 bytes, SHA-256 64838b786c7948810baaf46498a4f23d036e810c185e001701645edc491b3e71); it is not Git-bound qualification. No report or archive claims a clean commit, successful mounted parity acceptance, Chromium timer smoke, standalone demo replay, or archive round-trip yet. Root will publish the source checkpoint and assign the clean Git-bound E-RUN after the N4 control-contract repair is reviewed.
