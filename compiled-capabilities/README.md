# Compiled backend capability negotiation

This milestone adds explicit capability negotiation to the existing compiled Go lifecycle. The Go compiler declares capabilities from the reachable typed Go program. The host and each renderer state what they support, and the runtime checks those declarations before it starts an app or retires the active renderer.

The two declarations use separate namespaces:

| Profile | Declares | Examples |
| --- | --- | --- |
| Effect host `hostCapabilities` | Effect handling | `effect.request-reply`, `effect.cancel` |
| Renderer `viewCapabilities` | View and input rendering | `view.node`, `binding.value`, `binding.checked` |

Numeric requirements stay in the AppIR/compiler/runtime contract; renderers do not declare numeric support. A profile is a claim about a backend. The finite native/direct/React/DOM replays in this milestone demonstrate the tested implementations and do not certify arbitrary backends.

Legacy profile-less hosts retain request/reply behavior. Legacy profile-less renderers remain available to components that do not require cancellation. A component that requires `effect.cancel` needs an explicit renderer profile. An incompatible candidate is rejected before the old renderer lease, DOM, callbacks, Go state, or pending requests are changed. Cancellation remains independently declared by the component and effect host before a cancellation policy handles it.

Compiler inference for `effect.cancel` is intentionally narrow: it recognizes reachable, exact typed cancellation descriptors. A computed or otherwise unrecognized cancellation emission may not appear in AppIR. If such an effect is emitted, runtime validation rejects it after Go `Update` and before the host policy runs. The pre-`Init` guarantee applies to declared capability mismatches, not to every possible cancellation emission.

The actual GoScript build uses the existing `fixtures/compiled/lifecycle` package. Its AppIR capability list is `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and compiler-derived `effect.cancel`. Numeric support comes from the compiler/runtime contract, not renderer declarations. The lifecycle view has no value/checked input bindings; N4's literal oracle exercises strict binding capability cases with a synthetic fixture so those checks are not presented as properties of the actual Go view.

## Full runner

The full command records its toolchain, runs the archive-startup regressions, regenerates and verifies the original M0 map, and runs seven runner-acceptance regressions. Those tests verify hash-bound full receipts for the inherited lifecycle and nested compiled-methods/backend/frontend chain, and check that a failed final receipt produces a nonzero Node child exit. It then runs `bash run-compiled-lifecycle.sh`, which reruns the static and interaction gates, original M0 verification, and previous compiled lifecycle evidence. The capability runner continues with fresh React and DOM GoScript outputs, N4's independent literal oracle, N3's native/direct/React/DOM conformance driver, and N5's HTTP demo smoke in Chromium.

The runner requires Go 1.24 for the repository/native lifecycle, Go 1.27.3 for the compiler module, Node 22, the existing npm lockfiles, React/ReactDOM 19.3.1, and Chromium. It uses the existing package-lock files and adds no dependencies. CI installs with:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
```

The runner first regenerates the ignored M0 `react-map.gen.mjs` with Go 1.24, verifies all 24 original `SHA256SUMS` entries, and only then records its source pins. The inherited `run.sh` removes and regenerates that map again, so the final source pins require its bytes to remain identical. The worktree's Go commands carry `GOFLAGS=-buildvcs=false` so Go can build in linked worktrees. The runner records that override, exact Go/Node/browser/dependency versions, lockfile hashes, commands, command logs, build requests and results, all compiler output hashes, N3 mismatch/replay traces, the N4 literal test transcript, and the N5 browser screenshot and HTTP requests. The frozen finite scenario and literal expectation file are deterministic; the new capability checks use no random seed.

Every full attempt is stored under `compiled-capabilities/builds/attempts/` and archived with a hash manifest and extraction round-trip verification. Immediately before archiving, the runner writes a read-only `execution-before-archive.json` into the tar. It records the full `sourceBefore` set, `preArchiveSourcePins`, toolchain and dependency versions, command ledger, stage outcomes, and explicit `archivePending: true` / `finalAcceptance: false` fields. The manifest stays outside the tar to avoid a self-hash cycle; the final outer execution receipt binds its exact hash, the archive hash, and `sourceAfter`. A passing source check requires `sourceAfter` to match both `sourceBefore` and the snapshot pins. The final canonical receipt stays outside the tar.

The source-pin set excludes installed packages, build outputs, evidence/logs, and coordination receipts/reports. It includes the original `SHA256SUMS` and every M0 file named there, plus the milestone inputs, toolchain files, runners, and workflow.

```sh
bash run-compiled-capabilities.sh
```

After a completed run, serve the actual compiled capability demo locally using the attempt recorded in the final receipt:

```sh
attempt="$(node -p 'JSON.parse(require("node:fs").readFileSync("compiled-capabilities/coordination/receipts/E-BUILD.json", "utf8")).attempt')"
python3 -m http.server 8000 --directory "$attempt/demo/site"
```

Open [http://localhost:8000](http://localhost:8000) to try the React and DOM renderers, rejected swap, and recovery flow. There is no partial mode: a passing result requires the inherited full run and every capability stage.
