# C-SCOPE — reproduction and renderer boundaries

**Outcome: confirmed_reuse.** I reviewed the declared PR tree `7204bcfbc8992f9c47ac5d1bfd9d639a37a65e67` (matching the local checkout), typed-composition README/DESIGN/RESULTS, runner/workflow, renderer protocol, and composition host/manager. No source changed during this audit.

Fresh PR 10 primary run/job `41123116952/124294552127` and all ten listed PR workflows succeeded. The extracted report SHA-256 matches `artifact-ready.json`: status matched, 63 scripts, 2,463 actions/native frames, 4,926 actor/native-frame comparisons, zero mismatches. All five mutation controls had their declared outcomes. CI used Go 1.24.13, Node 22.23.4, Chromium 156.0.8078.4 and React/ReactDOM 19.3.1; its source-set SHA-256 is `f6dc04706c9437210b889935b5467cee179264d56b1e2955ce0557cd56e004f4`. This is separate from the local frozen run and its toolchain/build pins.

The earlier 248-finding mixed-process output remains a separate diagnostic.

Reproduce from the root with `bash run-typed-composition.sh`. It first executes `run-session-tree.sh`, then builds Go/WASM/native assets and runs Go test/race/vet, WASM smokes, Node tests, browser smoke and seeded replay. CI installs Go 1.24, Node 22, pinned npm dependencies and Playwright Chromium before invoking it. `typed-composition/RESULTS.md` records the standalone replay command.

Evidence covers the finite serialized Chromium profile with DOM, React and GoDOM, Go/reference/native action replay, dirty/effect/lifecycle channels and the loopback HTTP demo. It does not establish other browser engines, IME, hydration, pixels, arbitrary `Backend.Emit`, production auth/services, rollback or exact error-text equivalence.

Another renderer must implement the Go-generated keyed-renderer v1 manifest and bounded snapshot admission; keyed updates, controlled/disabled inputs, declared events, per-root lifecycle/focus/failure methods; preserve app-provided trees/messages without JS application decisions; and pass renderer conformance plus composition replay. No fourth renderer is claimed.
