# XR-SNAPSHOT — independent review

**Worker:** N2  
**Decision:** `amend`  
**Reviewed job:** E-SNAPSHOT (N4)

## Finding

The sealed E-SNAPSHOT report gives the two-member helper round-trip archive SHA-256 as `9cae8f7b11fb88db2bdee4c15f3feeea96ab2132fa0f8a63aa0af113ba9bc40f`. The sealed receipt gives `c059b138df643500fb1092624ddc1840b38ff41bdffa3ab900a2bbb43c41685b`, and the pinned `archive-root-roundtrip.stdout.log` independently prints that same `c059…` digest. The captured command exited 0 and reports a passed round trip. The author report should be corrected by an additive erratum; the sealed report and receipt remain unchanged.

## Source and behavior review

The reviewed `compiled-modules/run.mjs` is 46,750 bytes, SHA-256 `7c46f2bb16acfefb9a2beaaea63dac750b9bb4022ab192d4c452ff9db485b12c`, matching its sealed source inventory and current source. Relative to E-TEMP, the diff has exactly two one-line path changes: write `execution-before-archive.json` at the attempt root, and add that exact root filename to the producer include paths. The shared archive helper still resolves the extracted `execution-before-archive.json` at the archive root; its hash and the unchanged helper-test hash match the E-SNAPSHOT receipt. The captured syntax check and 7/7 helper tests passed.

The later root-owned full producer run at source commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0` passed. Its 6,373,581-byte archive has SHA-256 `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c`; the manifest SHA-256 is `ef2f332d15e306daabc290d127a42bfc2f9486fa43219785192f1674d7804fb2`. I streamed and checked all 529 archive members against the manifest. The root snapshot occurs once as `execution-before-archive.json`, is absent from `metadata/`, and matches the attempt-root snapshot. All 147 source pins agree across before/after metadata, the snapshot, and manifest. The run reports 12 matched browser profiles, six mutation controls detected, and a successful HTTP 200 demo smoke. Git source closure was clean before and after at the same source commit.

## Scope

The decision amends the E-SNAPSHOT report’s historical small-fixture digest only. It does not indicate a source or archive-path failure: the final producer confirms the root-path behavior and archive contents. This review did not rerun the producer or author tests. The independent read-only audit and its exact pins are in `module-coordination/rawlogs/XR-SNAPSHOT/independent-audit.json`.
