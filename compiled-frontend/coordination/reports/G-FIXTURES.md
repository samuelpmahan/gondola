# G-FIXTURES

Implemented three Go fixtures and a direct-Go native replay command. The original `counter` package remains unchanged. Each replay loads the generated per-package AppIR from N1's four-entry atomic build, calls the actual package `Init`, `Update`, and `View` functions, records a type-aware `gobi.trace/v1`, and validates the trace and deterministic host script with `compilercontract`.

Focused tests passed on Go 1.24.0:

```sh
/tmp/gondola-go/bin/go test -count=1 ./cmd/compiled-native ./fixtures/compiled/form ./fixtures/compiled/list ./fixtures/compiled/effect
```

Result: 4 packages passed, 0 failed. The native command also passed for all four generated AppIRs. Commands were of the form:

```sh
/tmp/gondola-go/bin/go run ./cmd/compiled-native --app-ir /tmp/gondola-compiled-atomic/apps/<app-dir>/app-ir.json --script compiled-frontend/fixtures/<app>.json
```

Each stdout trace is preserved at `/tmp/gondola-compiled-native/<app>.trace.json`; all four stderr files are empty. SHA-256 hashes are recorded in the receipt.

| App | Native ticks | Attempts | Actual Updates | Requests / completions | Native evidence |
|---|---:|---:|---:|---:|---|
| Existing counter | 5 | 4 | 3 | 0 / 0 | add, add, reset, disabled reset |
| Form | 10 | 9 | 8 | 0 / 0 | text, checked true/false, literal `On.Arg`, safe-integer boundary, save/reset, disabled reset |
| Keyed list | 11 | 10 | 8 | 0 / 0 | stable IDs, edit/check/reorder/remove, detached no-op, nil Rows to non-nil empty Rows |
| Effect | 5 | 3 | 3 | 1 / 1 | disabled request, pending-state commit, one correlated reply, negative-zero bits |

The form action intent `must not replace literal` remains separate from its resolved message argument `target.value`. Its shared script reaches Saves `9007199254740990`, then `9007199254740991`, and verifies another save does not overflow. The list script carries a browser focus/selection witness for N6; this native lane only records its declared metadata and does not claim physical focus preservation. Effect kind is limited to the contract's `fixture.request`.

N2 confirmed its focused analyzer pass accepts the current four fixture packages with zero diagnostics. The native traces establish direct-Go behavior against the generated AppIR types. They do not establish emitted-JavaScript parity or mounted-browser behavior; those remain with N6 and the integration lane.
