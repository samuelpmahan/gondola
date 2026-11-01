# E-ACCEPTAUDIT — frozen consumer-preparation audit

**Worker:** N1  
**Job:** E-ACCEPTAUDIT  
**Decision:** `amend` (`amend_required`)  
**Outcome:** `insufficient_evidence` for clean archive acceptance

## Scope and pinned inputs

I audited the exact external consumer-preparation files copied into `rawlogs/E-ACCEPTAUDIT/` before probing them. The copies are byte-identical to their pinned originals:

| File | Bytes | SHA-256 |
|---|---:|---|
| `consume.py` | 85,643 | `c1d7fed5afb75ca2cecbed4df8ddca50890d3cafd60dd5b0bfbc032e2a1e8a82` |
| `consume-browser.mjs` | 24,902 | `426174dfe05fb2eb91666a713f7bafee06844c002612e59b086ff5e39577129e` |
| `restore.py` | 33,703 | `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98` |

No consumer, restore, production, Git, or source-pin files were changed. The only additions are independent audit evidence under `rawlogs/E-ACCEPTAUDIT/` and this report/receipt.

## Findings

**Amend is required before this consumer can be used as the clean E-RUN acceptance gate.** In the frozen `consume.py`, `verify_execution_snapshot()` (lines 539–554) requires `counts` and `commands` as fields through the exact object key set, but then checks neither their type nor contents and does not bind them to the E-RUN receipt. The reproducible probe supplies a valid source/commit snapshot once with sane fields and once with `counts={"builds":"not-a-count","nativeEvents":-999}` and `commands={"not":"an array"}`. Both are accepted by the function. The exact probe is `execution-snapshot-poisoned-counts-and-commands-currently-accepted` in `contract-probes.stdout.json`.

There is a related receipt contract hole: the top-level E-RUN receipt schema requires `commands`, but `verify_manifest_and_run()` does not read or validate `receipt["commands"]`. It checks only that `receipt.archive.commands` is a nonempty list, without validating the command record shapes. This leaves the receipt’s declared command inventory unbound. N5 has received both findings and the exact reproducer; the authorized repair should validate complete count/command records and compare the archived execution snapshot to receipt values.

Other checked areas behaved fail-closed in the bounded probes: mutation-control reports reject missing, duplicate, non-rejected, and mismatched-count records; explicit capture extras are accepted under the declared policy while build extras are rejected; source-closure unknown fields and an invalid `rootGoSum` assertion are rejected; restore index counts are derived and mismatches/boolean-as-integer are rejected; and the browser plan JSON reader rejects duplicate object keys.

The browser consumer’s source is consistent with the requested local smoke: it launches Playwright Chromium, blocks external requests, uses actual `HTMLElement.click()` calls, exercises pending disabled/enabled controls, cancellation, a timer reply across renderer swap, and removal/remount with a new key generation. It asserts the unmount → Go commit → declared cancel → transport cancel → renderer teardown ordering and checks errors/network failures. These are source-level observations only. Clicks are DOM `HTMLElement.click()` events, not trusted OS/pointer input.

## Probe results and limits

The reviewer probe packet reports **18 probes, 18 expected outcomes, 0 failures**. See `contract-probes.py`, `contract-probes.stdout.json`, `contract-probes.stderr.log`, and `commands.log`. Python 3.12.14 syntax compilation and Node 22.23.4 `--check` passed. The duplicate-key browser-plan probe exited 2 with the expected rejection.

The schema/count baseline and old archive files available for these probes are from the translated PR22/legacy keyed fixture, not a new clean module-effects publication. The attempted old keyed archive was rejected at the archive regular-file/symlink check; it is not treated as a positive consumer run. Synthetic snapshots are used only to test the validator contract. **No actual clean E-RUN effects archive was consumed and no browser timer/demo execution was performed.** The latest E-RUN attempt stopped before timer-demo and archive qualification because the outer runner expected missing `native.stdoutPath`/`native.stderrPath` fields; XR-RUN records that negative run. Therefore this packet makes no archive-acceptance, delivery, or end-to-end browser claim.

## Evidence index

`rawlogs/E-ACCEPTAUDIT/index.json` uses `gobi.worker-rawlogs-index/v1`, excludes itself, and covers 13 files. Its SHA-256 is recorded in the receipt. The index includes the exact frozen script copies, probe source and outputs, command/version transcript, duplicate-key input/output, and the index generator. No production or Git state was changed.
