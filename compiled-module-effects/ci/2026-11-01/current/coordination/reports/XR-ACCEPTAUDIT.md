# XR-ACCEPTAUDIT — independent review of frozen E-ACCEPTAUDIT

**Worker:** N2  
**Job:** XR-ACCEPTAUDIT  
**Decision:** `accepted` — accepted as an accurate `amend_required` audit only; archive acceptance remains untested.

## Review conclusion

The frozen E-ACCEPTAUDIT packet is internally pinned and its concrete AMEND finding reproduces. `verify_execution_snapshot()` requires `counts` and `commands` to exist in the exact object-key set, but the function never reads or validates either value. The saved probe and an independent rerun both accepted a snapshot with `counts={"builds":"not-a-count","nativeEvents":-999}` and `commands={"not":"an array"}`. The receipt validator likewise requires the top-level `commands` key by its key-set schema, but does not read it; it only requires `receipt.archive.commands` to be a nonempty list, without validating command record shapes. Those checks do not bind the receipt command inventory or snapshot counts/commands to the archive and receipt. E-ACCEPTAUDIT correctly marks the consumer `amend_required` for the clean acceptance gate. The E-CONSUME repair is separate; this review made no consumer edits.

## Frozen packet and reproduced probes

The sealed E-ACCEPTAUDIT report, receipt, and rawlogs index each match the SHA-256 values in the seal. All 13 indexed rawlog files match their recorded byte lengths and hashes. The copied prep scripts are byte-identical to their pinned `/tmp/module-effects-publish` originals:

| File | Bytes | SHA-256 |
|---|---:|---|
| `consume.py` | 85,643 | `c1d7fed5afb75ca2cecbed4df8ddca50890d3cafd60dd5b0bfbc032e2a1e8a82` |
| `consume-browser.mjs` | 24,902 | `426174dfe05fb2eb91666a713f7bafee06844c002612e59b086ff5e39577129e` |
| `restore.py` | 33,703 | `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98` |

I reran the 18 probes using temporary copies of the sealed scripts from the original recorded working directory, leaving the E-ACCEPTAUDIT packet untouched. The rerun produced 18 expected outcomes, zero failures, and reproduced the same negative result for the old keyed archive fixture and the poisoned snapshot’s acceptance. The successful fixture/control probes remain schema and negative-contract evidence; they do not establish a clean effects archive. Python 3.12.14 and Node v22.23.4 match the packet’s recorded versions.

## Browser evidence boundary

Static source inspection confirms that the script is written to launch headless Chromium through Playwright, serve the local demo, block requests whose origin differs from the local server, check intended pending/cancel/reply/remount assertions, and invoke DOM `HTMLElement.click()` calls. These are source assertions about the workflow. This packet did not execute the browser workflow: it has no observed browser states, timer results, network trace, or screenshot from an effects demo. `HTMLElement.click()` is programmatic DOM activation and does not establish trusted OS/pointer input. The source also explicitly leaves pixel equivalence unasserted. I therefore accept the static description only and make no runtime browser/demo claim.

## Qualification boundary

No clean E-RUN effects archive was consumed. The saved E-RUN attempt stopped in the outer consumer on the missing native `stdoutPath`/`stderrPath` fields before timer-demo and archive qualification. The old keyed archive probe is only a negative incompatible-fixture control. This review did not attempt archive acceptance, run Playwright/Chromium, or make production, consumer, restore, Git, or scheduler changes. E-ACCEPTAUDIT remains an accurate `amend_required` report with `insufficient_evidence` for archive acceptance.

Commands, exact source pins, and the independent probe output are indexed in `rawlogs/XR-ACCEPTAUDIT/index.json`.
