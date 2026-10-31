# XR-WORKFLOW — independent N5 review

## Decision: accepted

The N3 workflow repair removes the reported job-initialization issue. The frozen pre-repair workflow and the current workflow differ only by moving `GOBI_PORTABLE_OUTPUT_DIR` from job-level `env` to the `Verify the published archive with Go` step's `env`. The artifact upload path remains unchanged.

## Findings

- The preserved pre-repair workflow matches the E-DELIVERY pin at SHA-256 `7d75b9481957099f53e33fc52fa9158fee10f3128a84483216376b6b1452d5e9`. Its pinned actionlint output identifies `runner` as unavailable in the portable job's job-level `env`.
- The current workflow has SHA-256 `c34209d93ce6a157f4d7a711046f84841ded0f69c30498185bac30914bdaf596`. `GOBI_PORTABLE_OUTPUT_DIR` is now set in the Go verification step, where `runner.temp` is allowed; the upload step still points at the same run-ID/attempt-specific directory.
- Actionlint v1.7.12, built with Go 1.27.3 for linux/amd64, passed against only `.github/workflows/gobi-portable-qualification.yml` with exit 0 and no diagnostics. PyYAML 6.0.3 parsed the workflow, both jobs remain, and an independently generated diff exactly matches the preserved diff.
- The associated run 41235795977 is represented in the author packet as task-dispatch metadata only. No original GitHub API payload or job log was supplied, so I do not treat it as a downloaded platform log.

## Bounded verification

I ran only:

```sh
/tmp/portable-tools/actionlint .github/workflows/gobi-portable-qualification.yml
```

I also checked the before/after workflow hashes, diff, YAML structure, placement of the output-directory expression, and unchanged artifact upload path. I did not rerun the hosted workflow, portable runner, Node/browser checks, or Milestone Zero job. Static actionlint acceptance removes the specific workflow-context error; it does not establish that a hosted run succeeded.

The review audit retained three initial read-only script failures: the validator virtualenv did not include PyYAML, the sealed author record's pre-edit source entry has no path field, and a corrected audit script retained stale locals from its former YAML block. The independent system-Python YAML parse and the final native receipt/hash audit passed. These were review-evidence collection errors, not workflow failures.

## Pins reviewed

| Evidence | SHA-256 |
|---|---|
| Sealed E-WORKFLOW report | `b74b24667ba1ae453a4b45f804fcaa5aa4a3351684cce4855b39a6bbe245f4ca` |
| Sealed E-WORKFLOW receipt | `57eb3b32df72c95e719dfc7be67653ae301e10853544579d4902d5653d1e3d4e` |
| Pre-repair workflow | `7d75b9481957099f53e33fc52fa9158fee10f3128a84483216376b6b1452d5e9` |
| Repaired workflow | `c34209d93ce6a157f4d7a711046f84841ded0f69c30498185bac30914bdaf596` |
| Preserved before/after diff | `9ff21209e085d38f69b6f468be046a9c3a22ac4deed5d60b47d73fc31f6e5502` |

The native receipt validator passed for E-WORKFLOW/N3, all 15 sealed author raw logs matched their hashes, and both author source pins matched the preserved/current workflow files. No workflow source, Git, or shared state was changed by this review.
