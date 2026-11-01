# XR-CONSUMEV4AUDIT — independent review of the v4 consumer preflight

**Worker:** N2  
**Reviewed job:** E-CONSUMEV4AUDIT  
**Decision:** `accepted` — accepted as source-contract preflight evidence only. Overall archive qualification remains `insufficient_evidence`.

## Packet and source integrity

The frozen N1 report, receipt, and rawlogs index match the receipt pins. I checked all 26 indexed raw files; there were zero byte or SHA-256 mismatches. The retained audit output has 49 unique named assertions, all passing. I reran the audit into this review directory to avoid touching the N1 packet.

The rerun produced the same 49 assertion rows as N1's frozen audit. Its complete JSON differs only in the recorded Python executable path (`/tmp/rebalancer-env/bin/python` for this review versus the primary-runtime path in N1's run); both reported Python 3.12.14.

All three consumer candidate files match their source-v4 index and the independent `/tmp/module-effects-publish` copies:

| File | Bytes | SHA-256 |
|---|---:|---|
| `consume-econsume-v4.py` | 109,901 | `feececf7081e6d67eac4179b4eeb647f1eb7e2169a0684fdf0cbf5b46ee781bc` |
| `consume-browser-econsume-v4.mjs` | 28,493 | `947e92caa4a7856e8f0cf434d9401bb8218296859481ae7eebddcfd515e48d1c` |
| `restore.py` | 33,703 | `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98` |

Candidate browser syntax and Python AST checks passed. The helper restore source remains the pinned frozen copy.

## Reproduced contract probes and code review

The 45 snapshot/count/command/control probes and 9 scoped lifecycle probes reproduced byte-for-byte from the frozen preflight outputs. All expected outcomes passed, with zero failures. These probes use synthetic author-only/schema data, and both outputs explicitly label themselves `not_acceptance`.

The v4 source addresses the earlier poisoned snapshot/receipt gap: `verify_execution_snapshot()` now reads and validates exact count fields and command records, binds the 19-command archived prefix to the receipt's 20 commands and one post-archive consumer, and validates the separate archive-helper command array. Count parsing uses strict integer checks that reject booleans, strings, negative values, and unknown/missing keys. Mutation application records derive totals from the arrays, require the exact four scenarios and reviewed control-ID set, reject duplicate, missing, extra, or undetected rows, and compare their aggregate rows with the per-scenario rows. The 64-application total is validated from those arrays rather than trusted as a manually supplied count.

The source closure check requires the root `go.mod` pin and explicit absent-root-`go.sum` evidence bound to it. Native replay uses `destination/source` as its working directory and evidence-local Go caches with `GOPROXY=off`, `GOSUMDB=off`, and `GOWORK=off`. The browser helper resolves the archived loader under `sourceRoot`, verifies its bytes against the archived build-index self-pin, and imports direct replay, oracle, and scenario modules from that same extracted source tree; no original checkout fallback is present. Browser external origins are blocked and recorded as failures. The lifecycle assertion enforces Go unmount, committed unmounted state, declared cancellation, transport cancellation/result, then renderer teardown.

## Historical execution and limits

The preserved F6 attempt03 receipt documents archive extraction of 638 members and 201 source pins, then four native replays that matched the archived results byte-for-byte and as canonical JSON. The attempt stopped later at the pre-repair archived loader's checkout-root guard, before relocated direct profiles and the full browser consumer completed. This is partial native-leg evidence, not a v4 archive acceptance.

The demo-only browser diagnostic is separately bounded: six steps, 12 programmatic `HTMLElement.click()` activations, two timer replies, three renderer swaps, four local requests, and zero reported external requests or runtime errors. Its screenshot is illustrative and pixel equivalence is not asserted. `HTMLElement.click()` does not establish trusted pointer or OS input. The demo-only trace is not a full direct-profile/browser consumer run.

The E-RELOCATE report records the focused copied-source loader repair and five focused tests, using the old F6 builds with a temporary test index whose loader self-pin alone was updated. The archived F6 index itself remains pinned to the old loader. A fresh source-bound producer archive must include the repaired loader self-pin before the full v4 consumer can finish restore, all native replays, all eight direct role profiles, and browser verification.

I accept N1's v4 candidate and the 49 preflight assertions for the stated scope. I do not accept the end-to-end archive consumer: the evidence deliberately leaves that outcome `insufficient_evidence` pending a fresh clean archive run. No producer/consumer source, Go, runtime, Git, archive, or scheduler files were changed during this review.

Commands, the exact probe reruns, candidate and report/index checks, and historical references are indexed in `rawlogs/XR-CONSUMEV4AUDIT/index.json`.
