# XR-REBUILDS — independent review of the four-build evidence packet

**Reviewer:** N1  
**Decision:** `accepted`  
**Reviewed packet:** N2 `E-REBUILDS`  
**Scope:** Build records, four emitted output directories, 46 enumerated source inputs, ABI/type closure, direct Unicode/bridge probes, and evidence custody. No builds or package tests were rerun.

## Decision

The sealed packet's finite build and direct-probe claims are supported by the pinned files. I independently verified the author report, receipt, raw evidence index, all 53 raw files listed in that index, the four actual output directories, and the source snapshot against current files.

The requests are four separate `go run ./cmd/gobi-build` calls with unique output directories: React parent, React child, DOM parent, and DOM child. Each returned exit 0, `ok:true`, one AppIR, and no diagnostics. I recomputed the byte length and SHA-256 for **all 274 declared output files** and confirmed each build directory contains exactly the recorded paths, with no missing or unrecorded files. Counts were 67 parent outputs and 70 child outputs per backend.

The 46-entry source map has byte-identical before/after maps. I also compared each current source file with its recorded after pin; all 46 still match. This is limited to those enumerated compiler, contract, modulewire, parent, and child inputs. It is not a whole-worktree cleanliness claim.

## ABI, modules, encoder, and type closure

For each profile I checked the actual manifest and module ABI sidecar bytes against the output inventories and the separate artifact integrity record. The sidecars bind the actual AppIR, generated module, encoder, and components file. Their parent roles are exactly `Init`/`Update`/`View` plus `Output`/`Receive`; child roles are exactly `Init`/`Update`/`View` plus `Input`/`Publication`.

I independently derived reachable type IDs from each descriptor role signature and the corresponding AppIR struct/slice/array/map field references. All four sidecar type sets equal that reachable closure (19 parent types and 20 child types); the unused `byte` AppIR entry is excluded. All four encoders contain the strict GoScript UTF-8 decoder, and all four emitted modules contain the message and view string boundary adapters. The output inventory and descriptor hashes cover the actual bytes, not only metadata copied into the report.

The actual Node ABI-pair probe passes for React and DOM, using the emitted descriptor bytes, AppIRs, and the four artifact byte maps per module. The direct module probe passes for all four modules: parent View contains exact `Step −` and no mojibake; the parent Output/Receive record and child Input/Publication/Add probes return the recorded values and encoded state. The probe summary reports all four module checks and both ABI-pair checks passing.

## Failure history and limits

The preserved first exploratory probe is a real, correctly classified red: it passed the GoScript `Update` result tuple `(State, []Effect)` to the single-State encoder, which rejected the tuple's fields. The corrected probe selects `updateResult[0]` and exits 0. The failed attempt is not evidence of a compiler/build defect and is not hidden by the passing rerun.

Two early versions of my independent audit script also exited 1 because I assumed a top-level `allExactInventories` field and then searched for the wrong corrected-probe source spelling. The actual evidence schema has `builds[].exactInventoryMatch`, and the corrected script uses `row.afterAdd=...updateResult[0]`. An intermediate passing audit iteration also repeated the final build’s output count in its per-build summary; the final v4 output reports 67/70 correctly. These reviewer-tooling attempts are preserved under `rawlogs/XR-REBUILDS/`; the final audit uses the actual schema and passes.

The first final receipt-index check failed before reading any pins because my Python verifier tried to concatenate a list with a dictionary while flattening its two evidence groups; that traceback is preserved. Follow-on pin-validation attempts also detected stale report/index pins during packet assembly. Their transient stderr was later overwritten by the final passing output at the same rawlog path, so those exact bytes are unavailable; this was a review-packet sequencing issue, not a reported artifact/source mismatch. After refreshing report, receipt, and raw index pins, the final validator verifies the report/receipt metadata and every indexed reviewer/author file.

E-REBUILDS itself makes no browser interaction or full profile acceptance claim. A later N4 harness packet is separate. This review covers the build/evidence procedure, not an independent semantic review of the UTF-8 implementation; N2's review of that source remains the separate codec review gate. I make no claim about arbitrary Go programs, module graphs, or whole-worktree cleanliness.

## Reviewed packet pins

- E-REBUILDS report: 5,278 bytes, SHA-256 `daef8cfe6efce0d579c94a6c7f8904662ea8493475cc293f6771de836092a34c`.
- E-REBUILDS receipt: SHA-256 `b633c50ba40e7a29fa65c1ae7f4d0974ae1732b0871309f45a86072813f869a1`.
- E-REBUILDS raw evidence index: 10,717 bytes, SHA-256 `0286411f8a6e1703b97203f2862ebfa0f3cadbde39a153aa7fb2f844b857be87`.
- Output integrity record: 9,500 bytes, SHA-256 `99c58f1864ad2992f46b5216dbbe28fdd8d64065815e41e2fb4bcbf535f5ffe7`.
- Source snapshot: 14,781 bytes, SHA-256 `1653781498f4b420a85370c6a8fc60207b60675c9f07f24aff0efef1ff04b6ed`.
- Corrected bridge/state probe output SHA-256 `b11fb56b2b668558344023da6ec0bbcb0f1c29565b459966a7857c9ce6012d5b`; ABI pair probe output SHA-256 `2a71d22d96632059b412b3175e1b309c83c67232b778c1b80513bfefe8106528`.
- Independent byte-audit result: `rawlogs/XR-REBUILDS/verify-v4.stdout.json`, SHA-256 `7d1567281c9beb3783041f96ffb1efb85026ee038e0c0becea1d5200f7368077`.
- Review raw evidence index: `rawlogs/XR-REBUILDS/index.json`, SHA-256 `a3276441e46743004f554f098a5a03d043a06365eebd760ee2688dd6159a210a`.

No source, Git, or scheduler state was changed during this review.
