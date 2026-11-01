# E-BUILD author report — N2

**Outcome:** `mixed_change`. Added the independent keyed GoScript build orchestrator in `compiled-keyed-modules/build/build.mjs`. No shared compiler, compiler adapter, dependency manifest, or lockfile was changed.

## Build and validation

Author command:

```sh
GOBI_GO_BIN=/tmp/gondola-go/go/bin/go GOBI_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-node22/node_modules/node/bin/node compiled-keyed-modules/build/build.mjs --output /workspace/scratch/39a56936f173/gondola/compiled-keyed-modules/build/output/E-BUILD-final
```

Recorded versions: root Go 1.24.0, compiler Go 1.27.3, Node 22.23.4, GoScript v0.6.2, esbuild 0.28.2. The runner made four separate `go run ./cmd/gobi-build` requests, each with exactly one entry package and one backend. The exact JSON requests, commands, stdout, and stderr are preserved under `../keyed-module-coordination/rawlogs/E-BUILD/final-metadata/`.

| Backend | Parent output files | Child output files | Parent ABI SHA-256 | Child ABI SHA-256 | Pair admission |
|---|---:|---:|---|---|---|
| React | 71 | 70 | `3e34e9d8b09e7d9e726ec30c2325340e8ae4be1542d4d3c0ded0243b0009bea3` | `ed5fad22b7b94b4d7ffeb52e1ac880cafc582057673c656c875e369b7bd1ac69` | passed |
| DOM | 71 | 70 | `afcc8a633dd042f197eae1fc980c51d36c6c606bddcda336e649871183932146` | `ffbba9b1c36182a7623f9b24468814bfab6210d725d5f3e549fd41542337166d` | passed |

For every build, the compiler `BuildResult` inventory matched the physical output directory exactly. Each `module-abi.json` pinned exactly four generated artifacts: AppIR, module, encoder, and components. The existing closed module-pair validator admitted the keyed parent with the separately compiled existing `modulechild` for both backends.

The parent helper adapter is `adapters/{react,dom}-parent/gobi-keyed-helpers.mjs`, exported as `gobiKeyedModuleHelpers` with `children`, `receiveKeyed`, and `isCurrent`. It is bundled from the same build's GoScript-emitted package sources using the existing pinned esbuild entry point. `children` returns a detached, frozen native array of `{key,generation}` records. `receiveKeyed` clones the primary GoScript state before invoking the helper and its returned state was accepted by the primary module's encoder, Update, View, and Output. The direct build smoke covered initial membership, reorder, remove/remount generation fencing, and the existing Output bridge.

The index is `compiled-keyed-modules/build/output/E-BUILD-final/build-index.json`, 84,891 bytes, SHA-256 `75df29c02218fab47294454bb0338a720d806901d64377b4cae024fd4f6a2e66`. It pins the four compiler output inventories, all standard module artifacts, helper bytes and helper descriptor bytes. The helper descriptor also pins the keyed parent Go source and the emitted GoScript `index.ts` and `app.gs.ts` bytes. The source pin inventory is `../keyed-module-coordination/rawlogs/E-BUILD/source-pins.json` (62 files, SHA-256 `426177701609db9d8c16171dd5c8459cf907a97f276b96d8ac87b3ec8e396da7`).

The independent host consumer test `node --test compiled-keyed-modules/runtime/runtime.test.mjs`, run with `GOBI_KEYED_BUILD_INDEX` set to this index, passed 2/2 tests. It exercised actual loaded artifacts, renderer lifecycle, and rejection of mutated helper bytes and backend/package/component/moduleABI/AppIR identity pins before renderer creation or Go `Init`. Logs are in `../keyed-module-coordination/rawlogs/E-BUILD/final-runtime-test.*`. This is dependency evidence from E-HOST, not a claim that the full browser/profile acceptance has passed.

## ABI scope

The compiler's unchanged `gobi.module-abi/v1` descriptor admits the conventional `Init`, `Update`, `View`, `Output`, and `Receive` roles and binds those four generated artifacts. `Children` is reachable through `View` and appears in AppIR as `func(State) []keyedmodulewire.ChildRef`. `ReceiveKeyed` and `IsCurrent` are exported in the generated GoScript package and their exact signatures/source/emitted bytes are recorded in the supplemental helper descriptor. They are not AppIR-reachability-admitted by the unchanged shared analyzer. The extension is bounded to these pinned fixture helpers; no general helper ABI admission claim is made.

## Preserved failed attempts

The first real builds surfaced fixture and adapter issues, all preserved under `../keyed-module-coordination/rawlogs/E-BUILD/`:

- `probe-01`: compiler rejected the pointer receiver helper (`source.signature-type: parameter 0: pointer type is unsupported`).
- `probe-02`: compiler rejected `moduleparent.Output` as an unsupported call and three integer increments/decrements without analyzer-recognized range guards.
- `probe-03`: parent compilation succeeded; helper bundling initially had a duplicate export.
- `probe-04`: all four builds and helpers completed; the author runner passed loader objects with extra fields to the validator's closed input record.
- `probe-05`: author runner omitted parsed AppIR when calling the validator.
- `probe-06`: author runner formed module paths without the role output directory.
- `probe-07`: helper passed the original state directly and mutated it; the adapter now clones using the primary GoScript state clone before the call.
- `probe-08`: first full four-build, pair-admission, and helper-smoke pass. The final build adds explicit helper fixture/emitted-source pins.

The keyed Go source was adjusted by N1 for the first two diagnostics. No production compiler change was needed.

## Source state and review

Base commit: `4395d41ade7e4196878b6885d4c46dd4d8ec85f1`. The shared workspace was dirty during this author build because the milestone lanes were creating their owned files; the relevant 62 source inputs are pinned separately. This receipt does not claim a clean-source build or independent review acceptance. `XR-BUILD` remains for the assigned independent reviewer.
