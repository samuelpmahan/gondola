# XR-E5 independent review

**Initial result: AMEND.** The HTTP demo, workflow wiring, lockfile dependency resolution, and current receipt fail-closed behavior passed targeted review. Two runner issues need repair before E5 acceptance; the report's current Node test count also needs refreshing.

## Initial findings

### XR-E5-1 — stale inherited receipt misses `counter/` (required)

`run-http-effects.sh` hashes selected roots at lines 24–28, including `interaction/` and `cmd/counter-wasm/`, but omits `counter/`. The existing counter WASM application reaches `counter/counter.go` through `interaction/session.go`; `counter/counter.go` is also pinned by the existing `SHA256SUMS`. A passing receipt can therefore still match after a relevant old application source changes.

I reproduced this without touching the shared build: in `/tmp/gondola-http-e5-review`, I copied the current passing receipt and `counter/counter.go`, appended a reviewer-only comment to that temporary source, then ran:

```sh
GONDOLA_HTTP_SKIP_INHERITED=1 PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH bash run-http-effects.sh
```

The runner printed `Using a matching prior inherited pass receipt.` before stopping later because the isolated partial fixture had no `go.mod`. This confirms the counter mutation did not stale the receipt. The digest root set must include `counter/`; if the baseline static gate is included in the receipt (XR-E5-2), its other runtime inputs and manifests must also be covered.

### XR-E5-2 — standalone default runner omits the Milestone 0 static gate (required)

`run-http-effects.sh` invokes `run-async-effects.sh` at line 77. That chain reaches controlled input, renderer replacement, and interaction, but it never invokes root `run.sh`. Root `run.sh` supplies additional baseline checks: `go vet ./...`, the 5,000-case seeded HTML comparison against `EXPECTED.json`, and `sha256sum -c SHA256SUMS` (lines 12–18 of `run.sh`). The plan requires the default runner to cover the original static and inherited regressions. The workflow does run `bash run.sh` separately at `.github/workflows/http-effects.yml:25–38`, so CI includes this gate, but a standalone documented `bash run-http-effects.sh` does not. Add the baseline gate to the default runner or have the coordinator explicitly revise the acceptance contract; do not claim the standalone runner covers it until then.

The current digest also omits `EXPECTED.json` and `SHA256SUMS`. If a valid skip receipt is intended to cover the static gate, include those manifests and every source/tool input used by that gate, including `cmd/gobi/` and all relevant Go packages.

### XR-E5-3 — E5 Node test count is behind the current suite

`http-effects/coordination/reports/E5.md:42,70` records 20 passing tests. The current suite has 23 tests after E3/E4 additions. Refresh the recorded result when the final E5 gate is rerun; the historical 20-test result may have been accurate at author-run time.

## Passed checks and observations

- The same-origin demo composes the Go WASM runtime, existing DOM/React renderers, HTTP transport, and Go lab. `demo-smoke.mjs` starts the actual loopback binary and verifies hold, renderer swap, release, server error, malformed response, retries, and observed abort. I ran it in an isolated copy with copied built assets; it exited 0 and printed all scenario passes. It wrote its screenshot only under the isolated copy. I inspected the checked-in-workspace screenshot: it shows the pending React render, server hold record/release buttons, empty audit, start event, and matching reported/live DOM.
- Current HTTP Node unit suite: 23 passed, 0 failed.
- `.github/workflows/http-effects.yml` sets Go 1.24 and Node 22, runs the baseline `run.sh`, installs interaction dependencies and Chromium, runs the HTTP runner, and uploads interaction, inherited, and HTTP build/artifact/evidence directories. The workflow's baseline step compensates for XR-E5-2 in CI only.
- Fresh-copy lockfile dry runs passed for the root and interaction packages, resolving 5 and 7 packages respectively.
- Receipt checks in an isolated copy: no receipt exits 1 with the missing-receipt message; a wrong digest exits 1 with the stale-receipt message; the current receipt digest matches the current inherited roots. A later dependency/build failure was expected because the copy was intentionally partial.
- `bash -n run-http-effects.sh`, `node --check http-effects/demo.mjs`, and `node --check http-effects/demo-smoke.mjs` passed.

## Exact targeted commands

From the repository root, using Go `go1.24.0 linux/amd64` and Node `v22.23.4`:

```sh
bash -n run-http-effects.sh
node --check http-effects/demo.mjs
node --check http-effects/demo-smoke.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test http-effects/*.test.mjs
npm ci --prefix /tmp/gondola-http-e5-review --dry-run --no-audit --no-fund
npm ci --prefix /tmp/gondola-http-e5-review/interaction --dry-run --no-audit --no-fund
```

The Node suite reported `23` tests, `23` pass, `0` fail. Both npm dry runs resolved from the checked-in lockfiles without installing into the source tree.

In `/tmp/gondola-http-e5-review`, with built HTTP lab/WASM/bundles copied from the repository and Playwright dependencies symlinked read-only from `interaction/node_modules`:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node http-effects/demo-smoke.mjs
```

Result: exit 0; held HTTP release, renderer swap, server-error retry, malformed-response retry, and observed fetch abort all passed.

Receipt probes in the isolated copy:

```sh
GONDOLA_HTTP_SKIP_INHERITED=1 PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH bash run-http-effects.sh
```

With no receipt this exited 1 and rejected the skip. With a deliberately stale `sourceDigest`, it exited 1 and rejected the receipt. With the current receipt, the runner accepted it; after mutating only the copied `counter/counter.go`, it still accepted it, demonstrating XR-E5-1.

## Source and screenshot SHA-256

Command:

```sh
sha256sum http-effects/demo.html http-effects/demo.mjs http-effects/demo-smoke.mjs http-effects/README.md http-effects/.gitignore run-http-effects.sh .github/workflows/http-effects.yml http-effects/coordination/reports/E5.md http-effects/build/demo-pending-swap.png
```

Hashes at initial review:

| File | SHA-256 |
|---|---|
| `http-effects/demo.html` | `40fe04779585354926aeb8a23773504b47c7dc85df19688992da18dbf8a18111` |
| `http-effects/demo.mjs` | `acf60fb96fa50dda283321c6f87b1b7d61d45e35c73528917c0965c9eb13de54` |
| `http-effects/demo-smoke.mjs` | `380eed72adbbf9890a39ec47d4e6928c3babc605db8e66a0f652235ddb20d76a` |
| `http-effects/README.md` | `f44e9ea8dac4e23a3c125cad42b620df0a14bd3c8d8f5942be46426c27120c40` |
| `http-effects/.gitignore` | `8b0cc19467645734ea6b634f1af4d73fde91ed780bc63ae67fa336883be7e3b1` |
| `run-http-effects.sh` | `a20deb82d87c51caae474b857e66232668a69cad100c7bba78f815a55cb964f1` |
| `.github/workflows/http-effects.yml` | `66215fa1fa40884fc2cb701cdadd362874c818e911915c9c3319b88d26a9efee` |
| `http-effects/coordination/reports/E5.md` | `2dbe9a4b0acd5faf0743fffea0f12a782601c037c2efa72ea4651bf3fb7fa1d8` |
| `http-effects/build/demo-pending-swap.png` | `25790e463149e7240b6e2d80da8eedfe625be9e588cbe1667080e54fb3653801` |

## Limits and recheck

I did not run `run-http-effects.sh` or `check.mjs` in the shared tree because the root seeded run was active and those commands overwrite shared build traces and screenshot outputs. The demo smoke was run in an isolated copy. The full runner and final seeded evidence remain for the coordinator. Preserve the three initial findings above when recording author repairs and recheck results.

## Final recheck after E5 author repair

**Final E5 source review: PASS.** The initial AMEND findings above remain intact as the review history.

- The runner digest now walks source/config files and adds every path from `SHA256SUMS`. I confirmed the closure covers `counter/counter.go`, all `cmd/gobi/*.go`, `go.mod`, `EXPECTED.json`, and `SHA256SUMS`; the source tree has no `.js`, `.ts`, `.jsx`, `.tsx`, or `.css` implementation files omitted by the extension set. Build, dependency, evidence, and coordination directories remain excluded.
- The default branch at `run-http-effects.sh:74–90` runs `run.sh`, then `run-async-effects.sh`, and writes the receipt only after both return successfully. The redundant standalone `run.sh` step was removed from CI; the workflow prepares dependencies and runs the full runner.
- A copied prior narrow-digest receipt was rejected as stale by the repaired runner.
- In an isolated copy with a synthetic receipt matching the repaired digest, I changed each of `counter/counter.go`, `EXPECTED.json`, `SHA256SUMS`, and `cmd/gobi/main.go` separately. Each mutation caused the skip check to reject the receipt before the build/dependency stage. The baseline matching receipt was accepted before mutation.
- `http-effects/coordination/reports/E5.md` now records 23 passing Node tests and explicitly limits the full post-repair runner claim to the coordinator’s pending run.

The isolated current-source digest used for these probes was `3742fc9fe37aa33eda06d549bdd86d977195ecb0a9feba5c0c5557029a2cdfdd`. The matching-receipt probe then stopped at the expected missing `interaction/node_modules/.bin/esbuild` check because the fixture intentionally omitted installed dependencies; mutation probes stopped earlier at receipt validation.

Recheck commands in the repository root:

```sh
bash -n run-http-effects.sh
sha256sum http-effects/demo.html http-effects/demo.mjs http-effects/demo-smoke.mjs http-effects/README.md http-effects/.gitignore run-http-effects.sh .github/workflows/http-effects.yml http-effects/coordination/reports/E5.md
```

The first command passed. Final source hashes:

| File | SHA-256 |
|---|---|
| `http-effects/demo.html` | `40fe04779585354926aeb8a23773504b47c7dc85df19688992da18dbf8a18111` |
| `http-effects/demo.mjs` | `acf60fb96fa50dda283321c6f87b1b7d61d45e35c73528917c0965c9eb13de54` |
| `http-effects/demo-smoke.mjs` | `380eed72adbbf9890a39ec47d4e6928c3babc605db8e66a0f652235ddb20d76a` |
| `http-effects/README.md` | `c6fbdde49c065283c9a993fe2345ab359d5754880cc8925e3f8187aa26acf278` |
| `http-effects/.gitignore` | `8b0cc19467645734ea6b634f1af4d73fde91ed780bc63ae67fa336883be7e3b1` |
| `run-http-effects.sh` | `dee63efde5fc459628702d315a5e9c697c59057d594e621f5ae027049e7e0934` |
| `.github/workflows/http-effects.yml` | `ff9c98849e6a4d88e6f7fd9060531565b9e6a50d402d7c2ee056abfa224b87b5` |
| `http-effects/coordination/reports/E5.md` | `d6e1bde08d6d6f584f38234c1abd6a61f36ca348549158a21a58402095ccb9f3` |

The coordinator is running the full default command on the repaired tree. I did not rerun that command or the seeded harness; their final result belongs to the coordinator’s report.
