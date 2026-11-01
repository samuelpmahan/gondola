# XR-REG — independent review of E-REG

**Reviewer:** N2  
**Decision:** `accepted`  
**Reviewed evidence:** sealed E-REG precommit source-copy regression packet.

## Review result

The E-REG report and original author receipt match the sealed report/receipt hashes. The protocol-normalized native receipt maps the original outcome `verified_inputs_copy_precommit` to the allowed classification `confirmed_reuse`. Its provenance names the original receipt SHA-256; removing that provenance and restoring the original outcome reproduces the original receipt exactly. The original receipt, report, and seal were not changed.

I independently rehashed all 295 pinned inputs against the pre-run and post-run maps, the current source worktree, and `/tmp/module-effects-regression-source`. All 7,046,852 bytes matched, including all 190 Go files; there were no missing files or pin differences. The isolated-copy record describes the selected inputs and exclusions. The preserved first attempt failed because three fixture groups were omitted; the corrected copy added the exact 11 fixtures and the successful runs passed. No product failure was exposed by that first attempt.

## M0 and counter checks

The M0 artifacts contain 5,000 input cases and 5,000 React outputs at seed `20261030`. The original `EXPECTED.json` and `SHA256SUMS` hashes match the E-RUN baseline; the recorded M0 outputs also match their receipt hashes. The Go rule table has 59 rows. The successful full run shows the `gobi` package ran uncached, and a separate `go test -count=1 ./gobi -run '^TestRulesAgainstReact$'` in the isolated copy passed in 0.083 seconds.

The counter packet reports 107 scripts, 4,473 ticks, eight passing Node tests, zero skips, and zero mismatches; all 107 native comparator cases matched. I decompressed and compared the complete counter trace with the prior E-RUN trace. The only 107 raw differences are `nativeComparison.scenarios[].inputPath`; each new and old path has the same basename under its respective copy root. Replacing only those paths with basenames makes the complete JSON traces equal. The 107 regular files in the native-input archive match the corresponding files in the isolated copy.

The saved trace is 49,491,413 uncompressed bytes with SHA-256 `f02dee21c19f1ce6f087df9214279d55e231c21824d49a630d22e7bce386fd60`; its compressed artifact is 463,291 bytes with SHA-256 `bf93efd5f22c13211a400476b414c0a12ac0e2470a154cd447b5a846460f698e`. The prior trace is 49,491,627 uncompressed bytes. The original large trace and native-input archive are referenced by their E-REG paths and hashes, not copied into this review packet.

## Evidence and limits

The independent audit verified all 29 files in the E-REG rawlogs index, the sealed report/receipt, source pins, M0 outputs, trace comparison, and native-input archive. The audit script, result, command record, and focused Go test output are in `rawlogs/XR-REG`; its index SHA-256 is `1b92c1a7d5988f85cbbd1a1eec5af7850ad8cef2f03221d5eb749d95b58c7885`.

This review accepts E-REG as precommit input-copy regression evidence. The 31 tracked Go paths beneath sparse-excluded coordination, evidence, and CI trees were not present in the checkout and were outside the pinned current-worktree input set. Root still needs to bind the inputs to the final Git source commit before claiming published-source qualification; this review makes no such claim.
