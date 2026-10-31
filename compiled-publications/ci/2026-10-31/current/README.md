# Typed inputs and generation-safe keyed publications

Review: https://github.com/samuelpmahan/gondola/pull/17 (stacked on PR16; no merge or deployment).
Source: `5662efcd7feb7920e4690d38cc76a297fed69d5a`, tree `e0410e9fd67701899351d13f3de879f1672b91a6`.
Local source `96898708846bcd270cb67c3087e1fb43c76650f4` has that exact tree.

Go owns parent step/lock/revision inputs, dynamic keyed counters, captured publication values and a delayed-delivery queue. Delivery consumes once and rejects stale parent/child lifetimes, stale input revisions, locked inputs and older publication IDs. Existing counter, Gobi interfaces, compiler and shared host/renderers are reused. Compatible DOM/React swaps retain Go state and pending effects; incompatible renderers are rejected. There is no JavaScript application reducer.

## Executed evidence

The primary result is a fresh detached checkout of the complete C4 source. Only existing locked npm dependencies were reused via symlinks. There were no author coordination/rawlog inputs. Both GoScript backends and the native Go trace were freshly generated.

- `execution.json` / `execution.md`: all eight focused stages passed; no mismatches or execution failures.
- Fixed replay: 50 events, 45 Go updates, 46 state checkpoints; native Go, direct compiled React/DOM and mounted React/DOM/swap profiles agree. Each mounted profile records 34 physical action clicks, disabled-click suppression, effect order and cancellation.
- Seeds `20261031`, `20261032`, `20261033`: native/direct comparisons; only `20261031` also mounted in Chromium.
- All 16 captured-data mutation controls were detected. These are checker controls, not runtime fault injection.
- HTTP executable demo: 20 checks passed, no page errors; all ten no-WASM hooks installed with zero observed WASM requests/API attempts.
- `root-post-exit-audit.json`: all 361 archive members independently stream-verified and all 128 source pins checked against committed bytes after the command exited.
- `static-regression.json` / `.log`: fresh local `bash run.sh` passed vet, Go tests, 5,000 random cases with seed `20261030`, expected receipt and SHA256SUMS. EXPECTED.json and SHA256SUMS are byte-identical to M0 commit ed3fd43. This static run used C3; C4 adds the seven already-tested support files without changing any of the 128 pinned bytes.

The broader inherited browser chain is pending CI at this publication checkpoint. It has not been rerun locally because of disk capacity. A queued workflow is not a passing result. See `ci-status.json` for exact source and observed run status.

## Reproduce

From the source checkout, with Go1.24, Node22 and the compiler toolchain Go1.27.3 available:

```bash
bash run.sh
bash run-compiled-publications.sh
```

The local focused command was:

```bash
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 CHROMIUM_PATH=/tmp/chromium bash run-compiled-publications.sh
```

Versions actually executed: native Go1.24.0, compiler Go1.27.3, Node22.23.4, npm11.9.0, React/ReactDOM19.3.1, Playwright1.64.1, Chromium153.0.8010.0, esbuild0.28.2. Exact subcommands, environments, input/output hashes and dependency-lock hashes are in execution.json.

To inspect the prebuilt demonstration without compiling, obtain this evidence branch and run:

```bash
cd compiled-publications/ci/2026-10-31/current
bash restore-runtime.sh
python3 -m http.server 8000 --directory restored-runtime/demo/site
```

Open http://127.0.0.1:8000. The restoration script checks every part and the reconstructed archive hash. The archive contains generated modules, native/direct/browser traces, seeded checks, source snapshots, HTTP evidence and screenshot. The screenshot is an observation, not a pixel-equivalence claim.

Primary runtime archive: 7,652,032 bytes, SHA256 `5d1577e5c64c76a181e3aa3f284fa95927974c4f158113c8b0dec6702e900cba`; 361 members. Manifest SHA256 `d42ef9186894d63d7c60021202d8976b001545ef4afb7c1e3db2f872470dd8b0`.

## Review and history

Six actual Luna6 XHigh workers occupied the six available worker slots (seven sessions including root). Native Rebalancer1.0.4 generated assignments; actual agent dispatches were separately acknowledged. `coordination/` contains the capacity record, toolkit probe provenance, solver input/output receipts, author/reviewer receipts, immutable seals, repair links and original raw logs. Its archive preserves older failed/partial captures as historical bytes; they are not acceptance results.

C1 failed before execution because absent root go.sum was incorrectly required. C2 failed on Node's unsupported encoding=buffer. C3 fixed both and passed locally, but seven tested support files were absent from its Git commit. C4 adds their exact bytes, checks all 128 pins against Git, and passes again from a fresh checkout. Earlier logs/receipts remain preserved under prior-C3, failed-attempts and outer-logs. A truncated preliminary unreferenced Git blob upload was rejected by identity checking and replaced before any tree referenced it.

Independent review found an incorrect hash transcription for an older attempt005 capture. The original E-HARNESS report/receipt remain sealed; E-HARNESS-CUSTODY and its independent review provide the additive correction. Current compact and clean-checkout captures are unaffected. The oracle's initial hardcoded Go path was repaired through a separate reviewed portability packet. No historical receipt was silently rewritten.

## Guarantee boundary

Demonstrated: finite synchronous two-level keyed fixture equivalence in the listed Chromium version for state, Gobi trees, mounted DOM and disabled behavior, message/effect ordering, cancellation, captured values, generation/revision/order rejection, and compatible renderer replacement. The compiler emits the same Go application for React and standalone DOM.

Untested: arbitrary Go, arbitrary/deeper component graphs, independently compiled child modules, production transport/timing, other browser engines, hydration, concurrent React scheduling, IME, focus/selection and pixel parity. A different frontend backend must implement the shared component/value ABI, satisfy every declared AppIR capability and closed host-effect policy, and pass the same native/direct/mounted trace and negative-control suite. Manifest hashes alone do not bind AppIR contents; inspect the AppIR hash and capabilities recorded in the evidence.

Next meaningful milestone: independently compiled child modules with typed input/output ports, preserving this lifecycle, publication and renderer-swap contract under the same end-to-end comparison harness.
