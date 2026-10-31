# XR-CI2-TRACE — independent trace packet review

**Decision: amend.** The four-app/five-profile trace evidence is independently verified and internally consistent. The producer report and receipt need one provenance correction before their metadata can be accepted: they label the PR base commit as the repaired head's direct parent.

## Evidence rechecked

I reviewed the immutable extracted primary artifact and independently rehashed its archive, manifest, compiler files, source pins, output pins, and recorded command logs. I also reran a copy of the offline trace checker into this review's own audit directory; it did not rebuild or launch the application or browser and did not alter the producer's audit.

| Evidence | Independent result |
|---|---|
| Workflow artifact | Run `41144116537`, job `124365059288`, artifact `13020568606`, 124,558,516 bytes; completed PR workflow success |
| ZIP and manifest | ZIP SHA-256 `c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e` matches the local preserved ZIP, run metadata, and extraction manifest; manifest SHA-256 `a79aa22c45f3b5cac2af4ddc2e5015352e038a7c6b88012c1c807a43f22631bc` |
| Extracted compiler files | All 309 manifest paths are present, comprise the exact compiler-artifact file set, and match recorded sizes and hashes |
| Retained inherited reports | Four selected reports are present and match their manifest hashes. The extraction manifest explicitly covers all compiler artifacts plus inherited JSON reports under 1 MB; it does not claim to materialize every large inherited report shard. |
| Source pins | 116 pins independently match the exact local head checkout; producer evidence records before/after equality |
| Compiler-output pins | All 209 output paths independently match their recorded byte counts and SHA-256 values |
| Recorded command logs | All 33 execution entries have exit code 0; all 66 stdout/stderr files match their execution-receipt hashes |
| Node tests and browser | Preserved Node log hash is `826d281fc0e122d9f10e80b7c678c3f630cb5db8c6d7878922087c2e0d2b5572`; its summary is 81 passed, 0 failed. The environment records both Chromium path overrides as unset, and each of the five profile reports records Chromium `156.0.8078.4`. |
| Offline trace audit | A byte-for-byte copy of the producer's offline checker, run against the extracted artifact under local Node `v24.22.1`, reproduces the producer's core semantic payload (source pins, command hashes, versions, profiles, totals, sentinels, and output pins). This is independent evidence comparison, not a second CI execution. |

## Five fixture profiles

All five check reports are `matched`; native and direct traces match exactly, browser trace cores match, browser DOM is checked against the authored oracle, and all 89 mutation controls are detected. No profile records a WASM request or API attempt.

| Profile | Ticks | Action ticks | Effect requests / completions | Controls | Browser |
|---|---:|---:|---:|---:|---|
| counter | 5 | 4 | 0 / 0 | 17 | 156.0.8078.4 |
| form | 10 | 9 | 0 / 0 | 18 | 156.0.8078.4 |
| list | 11 | 10 | 0 / 0 | 19 | 156.0.8078.4 |
| effect | 5 | 3 | 1 / 1 | 18 | 156.0.8078.4 |
| list-growth | 12 | 11 | 0 / 0 | 17 | 156.0.8078.4 |
| **Total** | **43** | **37** | **1 / 1** | **89** | **0 mismatches** |

Nil versus empty non-nil slice sentinels and IEEE-754 negative-zero bits are preserved in the recorded traces. The numeric trace includes Number-backed `int64` at `9007199254740991` and BigInt-backed `uint64` list IDs 0 through 5. These are fixture-level observations; full-width BigInt boundaries and Float64Array-backed Go slice wrappers are outside this packet.

## Required metadata correction

The repaired head is `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`, tree `ca99e9432dca87a6bf6718c20186b1223b870126`. The exact checked-out Git commit has direct parent `408e330517b1dd5e5f865e2ff1914465f98bcf66`. GitHub run metadata identifies `42df6883337605d901a23e9fed874768c7ce1824` as the **PR base**. Producer report `CI2-TRACE.md` calls that base the head's “parent,” and producer receipt field `parent_sha` repeats that value. The head, tree, workflow, artifact, and trace data otherwise match. Correct the field/label to distinguish `direct_parent_sha` (`408e330...`) from `pr_base_sha` (`42df688...`); I have preserved the original producer report and receipt unchanged.

The audit work and independently reproduced checker output are under `audits/XR-CI2-TRACE/`. The detailed cross-check is [crosscheck.json](../../audits/XR-CI2-TRACE/crosscheck.json), the exact producer inputs are preserved as `producer-report.original.md` and `producer-receipt.original.json`, and the copied offline validator writes only `raw-evidence.json` in this review directory.

## Scope

This review accepts the trace and pin evidence for the five recorded profiles on this repaired head, subject to the parent/base metadata correction. It does not establish general Go compiler correctness, broader program coverage, full-width BigInt behavior, or Float64Array slice behavior.
