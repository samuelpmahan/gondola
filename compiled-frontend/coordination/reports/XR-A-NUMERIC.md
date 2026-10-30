# XR-A-NUMERIC

**Decision: amend the A-NUMERIC report's cleanup statement; the recorded probe results and provenance are otherwise confirmed for their named scope.** This is an audit-of-audit based on stored artifacts, not an independent acceptance of the production analyzer or a general numeric-soundness claim.

## Confirmed evidence

The A-NUMERIC receipt's final command and working directory match the stored `-mode=post` run. The run result JSON is valid, has mode `post`, and has SHA-256 `68914c08fcb4b02f063ffc717a539eae9728e2d00131ac4b0b97bf9e5d7d73f6`. Its 22 cases classify as follows:

- 12 unsafe numeric expression/constant cases rejected, each with an `analyze.numeric-profile` diagnostic covering the named target span.
- 2 package-source cases rejected with target spans: `source.package-global` for a mutable package global and `source.init-function` for an `init` function.
- 6 required bounded controls accepted.
- 2 optional safe cases conservatively rejected: `safe_compound_add_control` and `cross_function_safe_numeric_parameter`.

The JSON has 15 analyzer `analyze.numeric-profile` diagnostics and two loader diagnostics. Those are diagnostic counts, not the 14 rejected case count: the mutable-global case also produces an arithmetic diagnostic, so one case has more than one diagnostic. Every one of the 14 required reject cases has its named target span matched.

The same raw output records four positive fixtures—counter, form, list, and effect—with four apps and zero diagnostics. It also records both native `EncodeValue` and generated JavaScript agreeing at the Number boundaries: signed `int` accepts ±9007199254740991 and rejects the next value in either direction; `uint` accepts 9007199254740991 and rejects 9007199254740992. BigInt-backed `int64` and `uint64` accept their full-width maxima exactly.

The historical `pre-codec-repair.json` is mode `pre`, SHA-256 `2c66f363b2a5c8c670fb071153ebc3858c6cf320b626c726c71ebca414edc227`. It directly shows native Number-backed `int` accepting both ±9007199254740992 and native `uint` accepting 9007199254740992, while the generated JavaScript encoder rejects those values. The post-repair output shows parity. The separate earlier `post-analyzer-pre-codec-repair.json` is also present and hashes to `958fe1aeff8eb3f0290f6d12b026034c943ad6676fef145c89b451e49941e7fc`.

The pre-repair harness compile failure is accurately labeled as a transient attempt during an analyzer/contract symbol rename. The preserved stderr says three `JSRepresentation*` identifiers were undefined. It is not a false-accept trace. The report correctly attributes the only retained pre-fix source-level RED summary to N2's test run and says no separate stdout/stderr was retained. I found no claim that N5 independently captured the analyzer's pre-fix false accepts.

## Required amendment

The A-NUMERIC report says that no `fixture-scratch-*` directories remain, and the receipt records `temporary_source_fixtures_remaining: 0`. At review time, `coordination/reviews/numeric/fixture-scratch-73224265/` exists with all 22 generated `app.go` probe inputs. The final JSON's diagnostic paths instead name `fixture-scratch-1169737128/`, so this extant directory is not the scratch root recorded by that final result. Its origin is not established by the reviewed artifacts, so this review does not attribute it to a particular command.

Please amend the report/receipt wording to distinguish cleanup of the final run's own temporary directory from the current presence of a different scratch directory, or remove the stale directory under its owner's cleanup authority and recheck. This does not alter the raw result counts or encoder observations, but the current unqualified cleanup statement is not supported by the workspace state.

## Command and hash closure

N5's final command, recorded working directory `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend`:

```text
GOTOOLCHAIN=go1.27.3 PATH=/tmp/gondola-go/bin:$PATH /tmp/gondola-go/bin/go run ./coordination/reviews/numeric/run_probes.go -mode=post > coordination/reviews/numeric/final-full-check.json 2> coordination/reviews/numeric/final-full-check.stderr.log
```

The receipt records exit 0. The review independently rehashed the listed files and matched every hash:

| Artifact | SHA-256 |
|---|---|
| `analyze/analyze.go` | `28270a69953b8a65d797b0187ca64cd50f48693a5cf283d9cd5edf16841f19c5` |
| `analyze/project.go` | `32a2c6cee4d3a84a83d76733343f49c061910e3b6329d7fd153a1979a400868a` |
| `analyze/numeric_security_test.go` | `656f6c4d6f47941f05e307214b238d0a5c0fb2dd4899b1cc8013bc528532f609` |
| `compilercontract/value.go` | `e6f26347e56d8bd97f4802dff206489ed3901082525a2b4c7497fe0811c71a1f` |
| `coordination/reviews/numeric/run_probes.go` | `e57902ff2fb1c1b6fb69e442cc9b35d2fff17f11517027201410bf5f49853a9c` |
| `coordination/reviews/numeric/final-full-check.json` | `68914c08fcb4b02f063ffc717a539eae9728e2d00131ac4b0b97bf9e5d7d73f6` |
| `coordination/reviews/numeric/pre-codec-repair.json` | `2c66f363b2a5c8c670fb071153ebc3858c6cf320b626c726c71ebca414edc227` |
| `coordination/reviews/numeric/post-analyzer-pre-codec-repair.json` | `958fe1aeff8eb3f0290f6d12b026034c943ad6676fef145c89b451e49941e7fc` |
| `coordination/reviews/numeric/pre-repair.stderr.log` | `f05ec2cadc16d571223c5c84e8d679616f2b3520107d11f61cad718ad12d0d16` |
| N5 `coordination/reports/A-NUMERIC.md` | `e903a35148ed9146fb30d1a1250606ed21b4055e367852ef82e0742f9a2fac33` |
| N5 `coordination/receipts/A-NUMERIC.json` | `010183f48a852bcbdd7c394bab5e74d183829a2197cb50c247151074c0485551` |

The N5 receipt also records the earlier transient compile log and its hash. Its text names the same three undefined symbols as the inspected log. The finished XR-A-ABI receipt is historical context only; this review does not modify it. Its earlier numeric warning is consistent with the separate pre-codec reproduction above.

## Limits

This review confirms stored artifacts, command attribution, target-span matching, and recorded counts. It did not rerun Go tests or the harness. These finite cases do not establish general Go arithmetic or control-flow soundness, arbitrary helper/dataflow safety, imported dependency initializer behavior, or frontend/build/browser conformance. The two conservative safe-case rejections are part of the stated bounded profile.
