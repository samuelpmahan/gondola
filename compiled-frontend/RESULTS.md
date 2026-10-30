# Executed compiled frontend milestone

On 2026-10-30, the unchanged Go counter and the Go form, keyed list and deterministic effect ran through pinned GoScript, real generated Go forwarding functions, generated typed encoders and one generic React19.3.1 renderer. **Four apps, five scripts, 43 native/direct-JavaScript/mounted-browser ticks match; zero mismatches.** No WASM is used by this compiled path. The older inherited paths still include WASM.

## Exact local commands

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false \
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium bash run-typed-composition.sh

GOFLAGS=-buildvcs=false CHROMIUM_PATH=/tmp/chromium \
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
bash run-compiled-frontend.sh --compiled-only
```

These are two completed local gates, not a claimed single default-command run. The first default inherited attempt passed static checks but failed binary VCS stamping: Go1.24 recognizes `.git` directories rather than this environment's linked-worktree `.git` file and searched the invalid `/workspace` ancestor. The retry disabled only binary VCS stamping and exited0. No application source workaround was used. Exact commands/logs and this attribution are retained in `evidence/inherited/`.

The new composed command's third attempt passed all33 recorded commands from **22:29:02.391Z to22:29:18.546Z**. Its first attempt incorrectly selected a documentation-only `semantic` directory as a Go package; the second caught a launcher unit test inheriting CHROMIUM_PATH. Both failed attempts are retained. The final helper separates pure launch-option selection from the configured browser caller. Earlier focused checks are attributed in lane reports, not substituted for this fresh complete run.

## Results and immutable local pins

| Profile | Ticks | Mutation controls |
| --- | ---: | ---: |
| Unchanged counter | 5 | 17 |
| Form / checkbox / literal argument | 10 | 18 |
| Keyed list / focus / detached handler | 11 | 19 |
| Deterministic effect | 5 | 18 |
| Five-row growth / edit / reorder / reset | 12 | 17 |
| **Total** | **43** | **89** |

- **81/81 Node tests**, current Go1.24 root contract/fixture/native tests, race and vet, and current Go1.27.3 analyzer/build/CLI/emitter tests, race and vet passed. The isolated compiler has four production Go package groups; semantic ABI documentation and historical audit programs are verified by their separately recorded commands.
- **116 execution source pins** are identical before/after. **All209 generated output hashes and byte counts** match before/after, including186 inspectable emitted TypeScript files and5 generated forwarding module inputs (four Go files plus go.mod). The standalone forwarder module invokes the original Go functions; registry aliases map those compiled exports to original AppIR role IDs. No handwritten JS application reducer substitutes for them.
- Native Go and direct emitted JavaScript are exact for state, requested action intent, actual message, dispatch identity, typed node tree/bindings, and ordered effect requests/completions. Browser comparison adds an independent hand-authored outerHTML-v1/live-control oracle. Every attempted action, including suppressed disabled/stale attempts, is retained; effect reply is a separate tick.
- The HTTP demo smoke mounted all four components, clicked counter twice/reset, saved text/checkbox state, preserved literal `target.value`, edited/reordered the list, and observed pending effect DOM before one captured manual reply. No page errors/runtime failures or WASM requests occurred. `evidence/accepted/demo.png` is the actual capture.
- All inherited gates exited0, including original **5,000 static cases /seed20261030 /59 compatibility rules /24 pinned hashes**, counter, replacement, input, effects/HTTP, keyed renderer, roots, nested lifetimes and typed composition. The last fresh inherited replay is **63 scripts,2,463 actions,4,926 actor/native frame comparisons,zero mismatches**, seeds20261030/20261031,30 generated cases each,max40 actions. All1,228 predecessor tracked paths match base42df. The new codec was repaired after the inherited root-Go-test phase; its current Go1.24 tests/race/vet ran in the new command above.

| Receipt | SHA-256 |
| --- | --- |
| `evidence/accepted/execution.json` | `e4f2d958d76f5ed03079e00914d705b0514f7de29023231206c0b00869c8c7b5` |
| `evidence/accepted/demo-smoke.json` | `5fe970ca1c663e45d830284d57ca1f9ad661e847bfbd12076e2a17e0f0487c4e` |
| `evidence/accepted/artifact-manifest.json` (309 files) | `143bfbd999995343e3341e5394c47aa9db2e81f36ba1bee469846b0498180440` |
| `evidence/compiled-artifacts.tar.xz` | `d88b651a05f5c085f33a7763b7a5e2e7c14c9dfd7df6641e99885463aa344f66` |
| Fresh inherited typed-composition report | `7f3bfc90929aa38d481f791d2dc45e7b8488b4a8d8f32afd5d9c044a02923387` |

Versions: **Go1.24.0** root / **Go1.27.3** compiler and new native replay; **Node22.23.4**, React/ReactDOM19.3.1, esbuild0.28.2, Playwright1.64.1, actual Chromium153.0.8010.0. GoScript is `github.com/s4wave/goscript v0.6.2`, commit `d8f58a091947cff26a9171be7bd130892b0afad3`. New compiler scripts are fixed deterministic fixtures, not random seeds; inherited seeds remain separately recorded. Fresh clean-checkout CI is configured through `bash run-compiled-frontend.sh`; its result is attributed separately to the published commit and actual CI versions.

## Repairs and evidence limits

### Clean-CI browser launcher repair

The first published head `408e330517b1dd5e5f865e2ff1914465f98bcf66` ran in GitHub Actions run `41140265213` (job `124352550636`). All ten inherited workflows succeeded. The new composed workflow passed the root Go1.24.13 and compiler Go1.27.3 test/race/vet gates, then failed at Node tests: **79/81 passed**. Both no-WASM guard tests hardcoded `/tmp/chromium`; CI installs Playwright-managed Chromium and leaves `CHROMIUM_PATH` unset. They failed before executing their guard assertions. That run never reached the four-app build, traces or demo. Its artifact `13019432197` has archive SHA-256 `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`; it remains failed evidence.

The repair changes only those two test launch calls to the existing `chromiumLaunchOptions(process.env.CHROMIUM_PATH)` helper. The actual WebAssembly API and network rejection assertions remain intact; application, compiler, runtime, dependencies and workflow code do not change. A new local `--compiled-only` run passed all33 commands and81 Node tests, four apps/five scripts/43 ticks/89 mutation controls/zero mismatches, including the HTTP demo, from23:18:26.440Z to23:18:46.463Z. It uses the exact local command above, Go1.24.0/Go1.27.3 and explicit Chromium153.0.8010.0. All116 source pins and209 output entries match before/after.

The new receipt is `evidence/ci-launcher-repair/execution.json`, SHA-256 `ecff3e303fa0cb32f5e618c27a10d013796f5b43835433f84c15abe21faa975c`; its manifest pins309 artifacts. The revised test SHA-256 is `4092cbd692428e647d8c2deb361beb5032d3a39f4599aa4d55a0a207c4700775`. Earlier `evidence/accepted/` pins and archives above remain the original local acceptance, with the previous test bytes; they are not rewritten as evidence of this repair. The inherited local run is unchanged historical evidence. Fresh CI on the repaired published head must separately establish the managed-browser launch and full default command; this local rerun does not claim it.

Independent review found and repaired action casing, raw Go effect struct markers/exact kind-name-reply contract, getter/Proxy admission reentry (including completion and error observation), stale logical view versus physically empty unmounted DOM, numeric guard mutation/alternative-case/compound-operand mistakes, native versus JS Number range rejection, named numeric constant bypass, and entry-package global/init admission. The independent numeric audit rejects14 unsafe numeric/package cases with source spans and accepts6 controls. Guarded `+=1` and caller-bounded helper arithmetic remain conservatively rejected.

Real compiled GoScript integration then exposed grown slice backing arrays with a private non-global `Symbol(goscript.spareZero)` and lazy unused-capacity holes. Renderer and encoder copy validated visible data, admit the pinned metadata shape and never execute its zero factory. Actual list growth at3/5 rows plus editing/reorder/reset now passes. Marker/prototype shape is not authentication; the renderer and encoder have deliberately different conservative factory-shape checks. The Float64Array-backed GoSlice wrapper path/hidden spare values were not exercised by this repair.

Initial amendments, raw failed traces/bundles and final independent captures remain preserved. The very first effect-browser failure was reported without saving its raw source/trace; later fully captured failures are distinct. Some old AppIR hashes preceded available blobs; fresh current artifacts supersede those provenance gaps without pretending the historical versions can be reconstructed. The early root go-get incident was restored and is documented with actual retained bytes. Receipt enum/path corrections and one byte-identical out-of-scope verifier write are recorded; original reports are not rewritten as pristine success.

## Demonstrated scope and next milestone

This establishes finite **serialized synchronous Chromium** equivalence for the four named apps/five scripts. It includes literal versus bound events, checked/value/disabled properties, keyed identity and immediate/settled backward selection[0,2] during a reorder without native focus transfer, stale callbacks after node removal, effect pending DOM before correlated reply, duplicate completion rejection, strict input fences and empty DOM after unmount. Retained browser callbacks after runtime unmount remain untested; direct runtime stale APIs have separate unit/probe evidence.

No universal Go equivalence, complete range analysis, arbitrary standard library or imported dependency initializer analysis, second compiled frontend backend, concurrent React scheduling, hydration, IME, pixels, other engine, production service/transport or rollback of committed state is established. The compiler public API exposes no usable typed semantic IR; independent Go AST/go-types analysis supplies AppIR. Byte-identical builds across different directories/toolchains are not claimed; exact executed artifacts are hashed.

Another compiled backend must consume the same AppIR and emitted Go symbols, implement the configured existing `gobi.Backend` seam, preserve typed state/tree/bindings/keys/controlled properties, provide synchronous commits and honest lifecycle/DOM observations, and pass these same native/direct/browser scripts and mutation/rejection controls. **Next meaningful milestone: a second compiled DOM backend through this same pipeline and oracle**, with no duplicated application transitions.

No main merge or production deployment. The review branch stacks on published PR10 `42df6883337605d901a23e9fed874768c7ce1824`, tree `7204bcfbc8992f9c47ac5d1bfd9d639a37a65e67`.
