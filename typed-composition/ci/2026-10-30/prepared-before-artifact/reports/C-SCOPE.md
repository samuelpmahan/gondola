# C-SCOPE — reproduction and renderer boundaries

**Outcome: insufficient evidence; prepared/pending.** I reviewed declared PR tree `7204bcfbc8992f9c47ac5d1bfd9d639a37a65e67`, `typed-composition/{README,DESIGN,RESULTS}.md`, `run-typed-composition.sh`, the workflow, renderer protocol, and composition host/manager source. Local tree matches. No repository changes, builds, tests, replay, or Git mutations were made.

Reproduce from the repository root with `bash run-typed-composition.sh`. The script first runs the full `run-session-tree.sh` gate, then builds Go/WASM and native replay assets, runs Go tests/race/vet, WASM smokes, Node tests, browser smoke, and the seeded replay. CI installs Go 1.24, Node 22, pinned npm packages and Playwright Chromium before invoking it. The standalone replay command is recorded in `typed-composition/RESULTS.md`.

The docs record local acceptance at 63 scripts, 2,463 actions/native frames, 4,926 actor-frame comparisons and zero mismatches. This is explicitly separate from fresh CI. The supplied CI snapshot had eight of ten workflows successful and the typed-composition primary plus nested-session workflow still in progress. At last check `artifact-ready.json` and CI ZIP/extracted bytes were absent, so no new CI result is verified.

The tested profile is serialized Chromium with DOM, React 19.3.1 and GoDOM, finite action traces, full Go/model/tree/DOM/focus/effect comparisons and a loopback HTTP demo. Other engines, IME, hydration, pixels, arbitrary `Backend.Emit`, production services/authentication, transactional rollback and exact error prose are outside the guarantee.

Another renderer must implement the Go-generated keyed-renderer v1 contract (manifest, bounded snapshot admission, keyed update, controlled/disabled inputs, declared events, per-root lifecycle/focus/failure methods), preserve app-provided trees and messages without JS application decisions, and pass both renderer fixtures/conformance and typed-composition replay. No fourth renderer is claimed.
