# Interactive counter verification — 2026-10-30

Baseline: `ed3fd43b24a58375032a6bc8f9ef0411bcb0ad46`.
Review branch: `codex/gobi-interactive-counter-20261030`. Main is not modified.

## Executed static and native verification

Environment: Linux x86_64, Go 1.24.0; Node 22.23.4. Npm 11.9.0 installed the lockfiles. The initial baseline run also passed under Node 24.22.1; the recorded final baseline uses Node 22.

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH bash run.sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH go test ./... -count=1
```

Both commands exited 0. The original 59-row React compatibility table, vet, unit tests, and 5,000 seeded static inputs pass. Seed is `20261030`. The generated cases SHA-256 is `36be8659504a42e3d50c224323d9117a1cb9fa858e4d02bc2a03b0077ab42260`; verdict SHA-256 is `180297809767b3d65c35b64abeb23ad53775d961128d9a235cb273bbc955ec23`. These match the unchanged EXPECTED.json. SHA256SUMS verification passes.

New native tests include disabled Reset at zero, repeated Add, Add/Reset/Add, fresh Init, invalid path/event, and negative comparison fixtures for state drift, reordered actions, bad indexes, absent pixels, tree/DOM differences, and empty traces. The JSON comparator CLI was also checked manually: match exits 0; same-DOM/different-state exits 1 and identifies State.

[Static command log](evidence/static-node22.log) · [Uncached native test log](evidence/go-tests-node22.log)

## Coordination

Six Luna 6 workers at XHigh ran concurrently, the maximum available child-agent capacity in this session. Initial authoring was manually dispatched while the native dependency installed. Rebalancer 1.0.4 then allocated all six independent cross-reviews; native/exact scores 600/600, zero reported broken constraints, unique assignments with each author excluded. The lead used the platform's agent controls to deliver the allocation.

[Allocation, review reports and receipts](coordination/cross-review-assignment.md) distinguish solver recommendations, dispatch acknowledgments, observed reviews and native workflow status. The extraction-only completion schema rejected a review receipt; no false extraction outcome was inserted. This is not evidence of autonomous solver-to-agent API integration or a throughput gain.

## Guarantee boundary

The experiment compares a Go WASM candidate that executes the unchanged Go application with an independent React 19.3.1 implementation. A reference Gobi Node tree is projected from React's own state; the separately mounted DOM is observed directly. Browser clicks use `.click()` with synchronous React flushing after each event, including bursts in one browser task. These observations do not establish concurrent React scheduling, other event types, general keyed reconciliation, focus/selection retention, effects, hydration, pixels, all browsers, or universal interactive equivalence.

See [the implementation and backend requirements](README.md). The added `CompareInteraction` preserves the old `Compare` implementation and adds state/order/shape checks in a separate entry point.

## Executed mounted interaction verification

| Seed | Scripts | User actions | Initial/action ticks | Mismatches | Native comparisons |
| --- | ---: | ---: | ---: | ---: | --- |
| 20261030 | 107 | 4,366 | 4,473 | 0 | all matched |
| 20261031 | 107 | 4,145 | 4,252 | 0 | all matched |

Each run includes seven fixed boundary/burst scripts plus 100 seeded scripts of up to 80 actions. Every script starts with fresh Go and React sessions. Comparisons include State, complete serialized Gobi Node fields, actual mounted HTML, disabled button paths, and the complete ordered delivered-message log after every action. A native Go Trace/CompareInteraction comparison runs per script. Reset at zero delivers no message; repeated clicks, reset after reset and alternating Add/Reset are included. The visible demo is separately mounted and asserts Count 0→1→0→0 with the last disabled Reset suppressed.

The primary runner passed under Go 1.24.0 and Node 24.22.1. The second independent seed, and the final static/native suite, passed under Go 1.24.0 and Node 22.23.4. Both browser runs used actual Chromium **153.0.8010.0**, provisioned through `@sparticuz/chromium@153.0.0`, driven by pinned Playwright 1.64.1. The official Playwright Chromium 156.0.8078.4 download returned an invalid archive in this environment. It was not used for the passing runs. CI is configured to use Playwright's standard browser installation; that CI/browser combination requires its own green run.

Exact successful interaction commands (temporary provisioning paths are specific to this run):

```sh
PATH=/tmp/gondola-go/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-interaction.sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GO_COMPARE_BIN=$PWD/interaction/build/compare-interaction node interaction/check.mjs --seed 20261031 --cases 100 --max-actions 80
```

The npm-hosted browser extraction required disabling chown in its temporary archive extractor because this execution filesystem does not support that operation. No application dependency or repository source was patched for this provisioning step. [Environment details](evidence/environment.md) record it.

[Primary runner log](evidence/interaction-primary.log) · [Node 22 second-seed log](evidence/interaction-node22-seed20261031.log) · [Machine-readable summary](evidence/summary.json) · [Full traces and native comparator inputs](evidence/interaction-traces.tar.gz) · [Executed demo screenshot](evidence/demo-count-two.png)

Extract the archive with `tar -xzf interaction/evidence/interaction-traces.tar.gz -C <empty-directory>`. It contains both complete browser reports and every native input envelope; replay an envelope with `go run ./cmd/compare-interaction <native-input-file.json>`. Absolute original report paths in receipts are provenance; extracted input files can be passed at their new location. SHA-256 hashes for original reports are in summary.json, and the delivery manifest binds the compressed archive and source files.

Demonstrated: 214 independently initialized scripts, 8,511 user actions and 8,725 observed initial/action ticks agree across the stated implementations and synchronous event policy. These finite tests support this counter experiment; they are not a proof over every possible action sequence or frontend backend.
