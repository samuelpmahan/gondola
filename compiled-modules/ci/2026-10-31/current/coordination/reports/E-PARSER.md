# E-PARSER — accept pretty-printed native JSON

**Worker:** N4  
**Outcome:** `mixed_change`

## Change

`compiled-modules/run.mjs` now first parses the complete trimmed stdout as JSON. If that fails, it retains the existing fallback that scans lines from the end for a parseable JSON result. This allows the native Go CLI's indented multi-line trace while preserving the single-line BuildResult and logged-summary behavior. No CLI output, count, or schema was changed.

## Verification

The preserved source2173 producer attempt failed at `fresh-native-trace` with `fresh native trace produced no parseable JSON result`. Its raw Go stdout is 209,146 bytes of pretty-printed `gobi.compiled-modules-native/v1` JSON (8,661 lines, 24 events, 16 steps). The regression harness evaluates the parser function directly from the current runner source and parses that captured native output successfully.

The same harness ran the real GoScript Build CLI for the parent React package. Its stdout was a single-line 16,495-byte `gobi.build-result/v1` result; the current runner parser accepted it (`ok: true`, 67 outputs). A logged-line prefix followed by a single-line conformance summary still succeeds through the retained fallback. Node 22 syntax validation exited 0.

The source diff from the sealed E-COVERAGE runner is one added whole-stdout `JSON.parse` attempt before the existing fallback. The failed producer log, actual native stdout, build output, parser regression script, and exact source diff are retained and hash indexed. The complete producer/profile was not rerun here; root owns that run after publishing the stable source hash.

## Scope

Only `compiled-modules/run.mjs` was changed. No Go, compiler, fixture, schema, profile count, Git, or scheduler state was changed by this task.
