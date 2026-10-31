# Native Go qualification of independent frontend modules — 2026-10-31

[PR21](https://github.com/samuelpmahan/gondola/pull/21) adds a standalone Go verifier for the independently compiled parent/child React and DOM experiment. It reuses the existing Go application, compiler and renderer contracts; all 24 changed files are additions. Source commit `4395d41ade7e4196878b6885d4c46dd4d8ec85f1`, tree `5835ca66f5c4903c711e04aa7e8d14212632bc3a`. The PR is stacked on PR20. Nothing was merged or deployed.

## Executed result

The fresh producer and Go verifier passed on this clean source. Native Go replays the actual parent/child application functions, regenerates the deterministic seeded actions and compares the archived native/direct/browser captures. It checks state, Gobi trees, mounted DOM, disabled controls, bridge values/order, Go call counts, swaps and stale-callback fences. It does not ask Node to make semantic decisions or launch a browser itself.

| Check | Observed |
| --- | --- |
| Fresh browser producer | 12 React/DOM/swap profiles matched; no unexpected mismatches or page errors |
| Fixed source script | 24 events, 16 Go updates, 17 state checkpoints |
| Seeded source scripts | 20261031, 20261032, 20261033; 40 actions each |
| Go replay total | 144 unique source actions, 99 updates; browser swaps add two swap events and one stale-callback probe per seeded swap profile |
| ABI | Four separate parent/child builds; two pairs; actual AppIR, sidecars and four artifact byte strings validated in Go |
| Input closure | 529 files; all 147 embedded source pins checked against actual bytes; stable before/after input hashes |
| Go tests | 30 top-level tests /82 test-and-subtest names, zero failed or skipped; includes ten semantic mutation controls and 19 coherency regressions |
| Portable tool tests | Four tests passed using executable PATH stubs and explicit override/failure cases |
| M0 | 5,000 cases, seed20261030; receipt and original checksums matched; 59 compatibility rules preserved |
| Counter regression | 107 scripts /4,473 initial/action ticks, seed20261030; native comparator matched; eight Node tests passed |

Go's decoder normally maps missing or null scalar fields to zero values. The verifier checks required native-record fields before typed decoding, so an absent/null count cannot impersonate numeric zero. Browser profile, backend and seed identities are checked as well. The report deliberately leaves `capture.mutationControls` at0: the old producer's six capture mutations are distinct from the ten newly executed Go mutation tests.

Versions: Go1.24.0 linux/amd64; compiler Go1.27.3; Node22.23.4; Python3.12.14; Chromium153.0.8010.0; pinned React19.3.1, Playwright1.64.1, GoScript0.6.2 and esbuild0.28.2. Exact argv, selected environment, stdout/stderr, source pins, seeds and expected negative results are retained in the bundle and audit.

## Restore the executable demo and Go verifier

Check out this evidence branch, then run from this directory:

```sh
python3 restore.py /tmp/gobi-native-qualified
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/gobi-native-qualified/runtime/demo/site
```

Open `http://127.0.0.1:8000/`. This serves the actual fresh-run prebuilt demo without deploying it. The restore helper verifies all segments, the bundle index and every outer/inner archive member before writing a new destination.

To rebuild and run the verifier without Node, a browser, npm or network module downloads (Go1.24 must already be installed):

```sh
cd /tmp/gobi-native-qualified/bundle/verifier-source
GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-buildvcs=false \
  go build -o /tmp/gobi-module-qualify ./cmd/module-qualify
/tmp/gobi-module-qualify \
  --archive /tmp/gobi-native-qualified/bundle/upstream/runtime.tar.gz \
  --manifest /tmp/gobi-native-qualified/bundle/upstream/runtime.manifest.json
```

The CLI emits a JSON verification report only on success. Directory mode is `go run ./cmd/module-qualify --directory <restored-runtime-root>`. Archive publication uses Linux/amd64 `renameat2(RENAME_NOREPLACE)`; unsupported platforms/kernels fail closed. The Darwin/arm64 fallback was cross-compiled, not executed.

## Reproduce the whole experiment

Use a clean checkout of source4395, existing locked dependencies and the tool versions above:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
CHROMIUM_PATH=/path/to/chromium \
  bash run-module-qualification.sh --source-commit 4395d41ade7e4196878b6885d4c46dd4d8ec85f1
```

The wrapper resolves Go/Node/Python3 from PATH or explicit `GOBI_GO_BIN`, `GOBI_NODE_BIN`, `GOBI_PYTHON_BIN`. It runs the fresh existing module producer, both Go CLI modes, Go tests with actual capture/archive/manifest/expected-source inputs, M0 and counter regressions, then packages the Go source dependency/test closure plus the raw runtime archive. Another frontend needs the shared ABI/renderer contract, an actual capture adapter and explicit admission into the checked profile matrix; renderer registration alone is insufficient.

## Inspect evidence and limitations

Attempt `attempt-20261031T230513555Z-8` wraps producer `attempt-20261031T230514281Z-99`. Verifier bundle: 6,616,802 bytes, SHA256 `98a1c68ed0c2453775a4e069482256b186f6446af40dd3ec0c7837d116914e9e`, 123 members. Embedded runtime archive: 6,376,501 bytes, SHA256 `05c71d20f7d7e25281b885a5bed20c337540d9bd6bb9728b23aeaf845f70066d`, 529 members. Its manifest SHA256 is `4d0e4a7b7362d2d206f32785d3844a1c326f9796ce243252c0dd0ecd31f808c9`.

The immutable bundle contains 18 commands and its commandCount18 is correct for that snapshot. Two successful final Git checks occur after archiving; their exact command/stdout/stderr records and the overall20-command finalization are published separately. Earlier post-run reader errors (double `bundle/` prefix and an incorrectly scoped20-command assertion) remain visible with corrections. They are not producer failures.

Six actually available Luna6XHigh workers were coordinated through native Rebalancer1.0.4; seven total sessions includes root. The native probe recommends and records starts; actual worker followups are separate. All20 packets closed through10 independent pairs (seven accepted reviews and three preserved AMENDs resolved by accepted repairs). Assignment bundles, eligibility/capacity/max-score checks, disjoint source ownership, frozen author/reviewer packets, raw failures and repair receipts are in the audit. The final state and `coordination/final-acceptance.json` are authoritative; earlier dated candidate/current snapshots are historical operational records. Original AMENDs remain: POSIX replacement race, local-only tool fallbacks, and backend/seed/null/missing-field false accepts. Each has a scoped repair and independent accepted review. Earlier CLI dependency hashes remain historical; final acceptance binds the clean source and fresh run.

Run `python3 restore.py --audit /tmp/gobi-native-audit` for the complete compact audit. It references prior PR20 evidence at7478295 rather than duplicating its390MB historical audit. M0's existing receipt files are unchanged.

These guarantees cover the finite synchronous Go fixture and admitted React/DOM Chromium/Linux captures. They do not cover arbitrary Go/module graphs, effects in this profile, other frontend implementations or browser engines, hydration, IME/OS pointer input, concurrent React, pixels, signer authenticity or resistance to fabricated producers. Hashes establish byte consistency, not an authenticated build chain. The independent consumer rebuilt the supplied 43-file Go source/data closure (41 Go files, go.mod and the control JSON) with an empty module cache and module downloads disabled, then passed both CLI modes with matching input inventories and semantic results. This does not turn self-reported Git identifiers into signatures. This new module verifier does not extend the earlier unrelated13-case backendqualification certificate.

Hosted CI is reported separately; queued jobs are not claimed as passed. Next substantial milestone: independently compiled keyed child instances, lifecycle identity and typed cancellable effects through the now Go-checked module boundary.
