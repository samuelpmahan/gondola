# Compiled keyed child collections: evidence and status

## Current acceptance status

**The exact-source full acceptance run is pending.** No final runner, CI, or release acceptance is claimed here. The measurements below are historical author/reviewer captures from the pre-repair source snapshot; they explain the current evidence but do not establish that the repaired source still passes. Run `bash run-compiled-children.sh` from the repository root after the active amendments close. The fresh attempt receipt and report must be read as the acceptance record.

At the documentation snapshot, three source repairs were running, and the seeded-assertions source repair was complete. Independent review for all four amendments was pending:

| Repair | Required check before acceptance |
| --- | --- |
| `E-FIX-INHERITED-GATE` | Tie inherited evidence freshness to the actual inherited invocation and verify receipt-bound report, archive, manifest, and source bytes. |
| `E-FIX-WASM-OBSERVABILITY` | Fail closed if WebAssembly observation hooks cannot be installed; record which observations were actually available and state only those finite guarantees. |
| `E-FIX-SEEDED-ASSERTIONS` | Check complete seeded operation tuples and derive the declared collection bound from valid schedule inputs. |
| `E-FIX-HARNESS-LIVENESS` | Prove renderer identity across compatible swaps and rejected candidates, then observe a real action through the retained active renderer. |

Each amendment needs its XR review plus a new source-pinned full run. Earlier counts are not substitutes for that run. The captured coordination status is preserved as `coordination/rawlogs/E-RELEASE-DOCS-20261031/state-snapshot.json`; it is a dated snapshot, not a claim about later live state.

## Historical author captures

### Native, direct compiled, and mounted renderer replay

E-HARNESS attempt 12 recorded a match for the fixed schedule: 42 source events, 38 Go updates, and 39 state checkpoints, including three mounted browser profiles. It compared complete typed state fields, Gobi view trees, effects and event ordering, and normalized DOM/control captures. Six deliberate captured-data mutations were detected. The bounded seed set was `20261031`, `20261032`, and `20261033`; each generated 60 source events and 59 Go updates, and only the first seed was replayed in a mounted browser.

This is a finite historical sample, not a universal equivalence claim. Attempt 12 used the pre-amendment harness/checker. The active liveness repair adds actual renderer-identity checks, and the seeded-assertions repair strengthens schedule coverage checks, so a fresh full run must repeat and source-pin the evidence.

The old report and machine receipt remain at [`E-HARNESS.md`](coordination/reports/E-HARNESS.md) and [`E-HARNESS.json`](coordination/receipts/E-HARNESS.json). Compressed raw native/direct/browser captures and their hashes are in `coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/`. The original attempt and logs are historical evidence only.

### HTTP demo author smoke

The E-DELIVERY author smoke rerun reported 31/31 checks passed using Chromium 153.0.8010.0. It served the demo built from the existing React GoScript output at `compiled-children/compiler-evidence/build/react-repeat`; the bundle was 1,853,920 bytes with SHA-256 `c2d5723c7c15a3bba3a59687a4f610682fe5d8cb387ed465118df79471a84ac9`. This proves that a particular prebuilt app could be exercised by that author smoke, not that the current full build and evidence chain has passed.

XR-DELIVERY later found that the WebAssembly hook setup could silently continue if instrumentation installation failed. Therefore the old smoke's “no WebAssembly activity” summary is not relied on as an acceptance claim. The observable-WASM repair must pass its negative controls, be independently reviewed, and run in the new full attempt. The author report, receipt, smoke JSON, and screenshot remain preserved; see [`E-DELIVERY.md`](coordination/reports/E-DELIVERY.md), [`XR-DELIVERY.md`](coordination/reports/XR-DELIVERY.md), and their receipts/rawlogs.

### Compiler reuse

E-COMPILER's actual GoScript CLI builds accepted the frozen Go package for both React and DOM using Go 1.27.3 and Node 22. The generated encoder accepted actual compiled values through slice growth, reorder, pending work, key reuse, clear, parent removal, and remount. React and DOM produced the same canonical state snapshots in that probe. The lane reports **`confirmed_reuse`**: no production compiler source was changed. This confirms compatibility for this bounded Go fixture, not general Go compilation. See [`E-COMPILER.md`](coordination/reports/E-COMPILER.md).

## Backend and state boundary

The fixture and host follow the frozen [contract](CONTRACT.md). App state is a parent plus a presentation-ordered Go value slice of children. Child keys can be reused only with fresh generations; completion must match a live exact token; cancellation follows the contract's child-first ordering. The AppIR declares `view.node`, `effect.request-reply`, and `effect.cancel`.

The host keeps request correlations and delivery/cancellation records. It does not decide application liveness or maintain a second collection state. React and DOM lower the same Go `View`; real browser controls dispatch the messages in that view. A compatible renderer replacement keeps the runtime and request correlations, while an incompatible candidate must leave the current renderer and callbacks live. New backends must meet that same renderer/capability contract and consume the same fixed and seeded replays.

## Historical custody and excluded items

The original E-ORACLE receipt pinned `compiled-children/oracle/audit-native-protocol.mjs` to `7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e`. Those original bytes were not recovered. The available `f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853` reconstruction was preserved and freshly audited in the accepted custody packet; it is explicitly not represented as the missing original. Original E-ORACLE report and receipt were left untouched. See [`XR-FIX-ORACLE-CUSTODY.md`](coordination/reports/XR-FIX-ORACLE-CUSTODY.md).

The historical XR-ORACLE receipt also has three stale rawlog byte-count fields: it recorded 1,497 / 224 / 20 bytes, while the hash-matching files contain 1,958 / 238 / 21 bytes. The accepted superseding custody packet records the actual byte counts; it preserves the historical metadata and original receipts rather than rewriting them. A prior R15 local archive-corruption item is unresolved and excluded from this milestone's acceptance evidence.

## What this evidence does not establish

The exercised profile is guarded and bounded: it does not establish arbitrary Go object graphs, broad map or pointer support, unrestricted compilation, other JavaScript engines, production request transport, hydration, IME behavior, concurrent React rendering, pixel output, or focus identity. Seeded examples are bounded deterministic samples; only the fixed schedule has independent literal state, tree, and DOM projections.
