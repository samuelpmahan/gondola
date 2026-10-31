# XR-ADVERSARIAL — independent review of the Go mutation controls

**Reviewer:** N5  
**Decision:** `accepted`

## Packet integrity and inputs

The sealed E-ADVERSARIAL report and receipt match their seal hashes. All 41 entries in the author raw-log index match their recorded sizes and SHA-256 values. The two owned test/corpus files and six pinned checker dependencies match the sealed byte counts and hashes. All 17 captured inputs in `evidence-inputs.json` also match, including fixed native/direct traces, browser capture, summary, scenario and literal expectations, four ABI build records, source-pin metadata, and the fixture source. The capture metadata identifies commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0` and explicitly says the restored capture root is not an authoritative checkout of that commit.

## Test and mutation review

I reran the exact focused Go command with Go `1.24.0 linux/amd64` and `GOBI_MODULE_CAPTURE_ROOT=/tmp/gobi-published-restore-check`. It exited 0: the positive baseline and mutation-control parent passed, all ten named mutation subtests passed, and no test skipped. The positive case runs `CheckCaptures`, `CheckABIs`, and `VerifyDirectory` against the unmodified root and checks 12 profiles, 144 source events, 99 updates, three exact seeds, and zero checker-run mutation controls.

The negative controls make valid, targeted changes to native initial state, native NodeRecord tree, direct typed state, browser DOM, a coherently updated disabled control across HTML and control records, direct bridge-call order, native trace schema, ABI role, generated module bytes, and pinned Go source bytes. Each uses the intended checker and asserts a diagnostic for the intended semantic gate; the ABI and artifact controls also require their specific detail. The fixture summary stays matched, and the original mutation target hash is checked after each overlay run. The overlay hard-links regular files and unlinks the chosen target before replacing it; if hard links are unavailable it copies regular bytes. This avoids passing because a malformed JSON file, symlink, missing input, or changed producer summary was rejected first.

The positive baseline precedes the negative controls in the test run. That prevents all negatives from appearing effective only because the verifier rejects the unmodified capture. The task log preserves earlier setup and checker failures; the final passing run is clearly identified as attempt 020.

## Limits

The test uses the finite restored capture and does not launch Chromium or rebuild the frontend. It demonstrates independent Go verifier rejection for these ten concrete mutations in the single module pair and four captured builds. It does not prove arbitrary module-graph correctness, producer authenticity, or behavior outside the pinned capture. No source, Git metadata, application, or native scheduler state was changed in this review.

The exact rerun output, command/environment, input-pin audit, author-packet integrity audit, and raw-log index are under `native-module-coordination/rawlogs/XR-ADVERSARIAL/`.
