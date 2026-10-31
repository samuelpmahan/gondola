# E-HARNESS: mounted backend fault qualification

**Worker:** N4  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Result

Added `backend-qualification/conformance/qualification.mjs`, exporting `runQualification({ inputs, outputDir, chromiumPath, sourceCommit })`. The runner launches one isolated Chromium page per matrix case, reuses the existing publications `runProfile`, and sends the three healthy React, DOM, and DOM-to-React swap profiles through the existing full native/direct/browser/literal checker. Fault cases use N3's default-off renderer decorator and read-only `inspectRaw()` seam. No application state transitions or expected values are implemented in JavaScript.

The Node 22 author run matched all 13 cases. The three healthy profiles each exercised 50 source events and 46 checkpoints, and the existing checker returned `matched`. All ten fault cases activated exactly once. The five families produced the following observations on both renderers:

| Fault | Observed channels | Event/tick checkpoint |
| --- | --- | --- |
| Text corruption | `dom` | Initial state: 0 source events, 1 trace tick |
| Key order | `dom` | Initial state: 0 source events, 1 trace tick |
| Enabled control | `dom`, `disabled` | Initial state: 0 source events, 1 trace tick |
| Dropped click | `dom`, `dispatch-count`, `trace-count`, `state` | Event 0 attempted: 1 source event, 1 trace tick |
| Duplicate click | `dom`, `dispatch-count`, `trace-count`, `state` | Event 0 attempted: 1 source event, 3 trace ticks |

The channel list is derived from five explicit expected/observed comparisons in each case evidence file: rendered HTML, stable control-path disabled values, dispatch count, trace count, and full AppIR-typed state. The probe exception from the strict replay is preserved as context; it does not count as detection. The captures report zero page errors and zero infrastructure errors.

N1's Go certificate independently accepted the raw report, verified its report-relative evidence hashes, derived channels from the comparison pairs, and returned `qualified: true` for 13/13 cases. The certificate is preserved under `backend-qualification/coordination/rawlogs/E-GOCLI/actual-certificate.json`; its SHA-256 is `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174`.

## Inputs and execution

The raw report is `backend-qualification/coordination/rawlogs/E-HARNESS/attempt-04-node22-source-pinned/qualification.raw.json` (7,820 bytes, SHA-256 `4222a32d73fde4e9fa31e534ebad7ab61fae8337f6cff7e0b2c9b05486586bcf`). Its 13 compact case captures are in the adjacent `cases/` directory. The summary is `attempt-04-node22-source-pinned/qualification.summary.json` (12,468 bytes, SHA-256 `3110e119c325eb644c26671290c482b09ee8408f6a9eca868e0066b5f36c3cc0`); it records all nine input/artifact pins as stable before and after the matrix.

The tested inputs were N2's fresh React and DOM GoScript builds, matching generated encoders and AppIR, the Go 1.24 native trace, the fixed publications fixture, and the independent baseline oracle and 13-case plan. Both GoScript builds had five required capabilities and 67 emitted outputs. AppIR and encoder identity across the two backends was checked by the existing baseline checker. Input hashes are in the run summary and receipt.

The final author command is preserved in `attempt-04-node22-source-pinned/command.txt`. It used Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node` and Chromium `153.0.8010.0` at `/tmp/chromium`. The runner source SHA-256 is `18991f813d2bfb78499b542a0b99dfd2eae3252fec6c61203759abbde744b050`. The adapter source SHA-256 is `c6e75b5a6b935b7d009ce0fd6d5a0d58f6490bfe44c5a34c54b3ba8544a2ba31`; the browser-entry seam SHA-256 is `b99a9d24fd39bfb59662ca6859559f508f60f8da07b3777a004d4397b2ee2492`.

## Attempt history and limits

The first Node 24 attempt exposed a harness inspection bug: `inspectRaw()` returns unwrapped runtime snapshot and trace values, but the first reader incorrectly looked for nested `.value` members. That attempt failed its derived checks and is retained as `attempt-01-node24-initial`. After correcting the reader, Node 24 and then Node 22 both passed 13/13. The final source-pinned Node 22 rerun also passed 13/13 with stable input hashes. Its raw report and case evidence bytes match the immediately prior Node 22 capture exactly; `deduplication.json` records the byte comparison and hard-link reuse.

The report's explicit `sourceCommit` is the 40-character base reference from the frozen contract, `5662efcd7feb7920e4690d38cc76a297fed69d5a`. This is an author-run against uncommitted qualification changes, recorded as `author-uncommitted-base-source`; it is not a final candidate source claim. Root's frozen-candidate rerun remains the final source-acceptance step. This packet does not claim a full hosted workflow or broader backend/runtime support.
