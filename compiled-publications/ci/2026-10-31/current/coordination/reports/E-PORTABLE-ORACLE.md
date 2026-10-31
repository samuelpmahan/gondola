# E-PORTABLE-ORACLE (N5): portable native-Go test invocation

**Outcome: `mixed_change`.** Replaced the hardcoded `/tmp/gondola-go/bin/go` executable in the fixed-oracle test with `process.env.GOBI_GO_BIN ?? "go"` and raised the captured-output limit to 64 MiB. The test still launches a fresh native Go CLI trace for each test that needs it; no native output file is used as an input.

The only modified author source is `compiled-publications/oracle/oracle.test.mjs`. Its prior sealed E-ORACLE copy remains unchanged: sealed hash `e7b820a8bc9ee28e8c5444d7948cce2e310328b98eeb823cc59121050a935536`; updated live test hash `42027774bbb189dbf64e8fd4749187255087d9b27850651e918d5ccc7e9a338f`. `oracle.mjs`, `expectations.json`, the prior E-ORACLE receipt, and their sealed copies still match byte-for-byte.

## Verification

Toolchains: Node `v22.23.4`; Go `go1.24.0 linux/amd64`.

| Command | Result |
|---|---|
| `GOBI_GO_BIN=/tmp/gondola-go/bin/go /tmp/gondola-node22/node_modules/node/bin/node --test compiled-publications/oracle/oracle.test.mjs` | Exit 0; all 6 tests passed using the explicit Go path. |
| `env -u GOBI_GO_BIN PATH="/tmp/gondola-go/bin:$PATH" /tmp/gondola-node22/node_modules/node/bin/node --test compiled-publications/oracle/oracle.test.mjs` | Exit 0; all 6 tests passed using the `go` PATH fallback. |
| `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-publications/oracle/oracle.test.mjs` | Exit 0. |
| `/tmp/gondola-go/bin/go version` | `go version go1.24.0 linux/amd64`. |
| `/tmp/gondola-node22/node_modules/node/bin/node --version` | `v22.23.4`. |

The unmodified task environment PATH did not contain `go`; the PATH fallback was verified after prepending the installed Go 1.24 directory. Logs for both test modes and the environment/syntax check are in `coordination/rawlogs/E-PORTABLE-ORACLE/`.

No oracle values, fixture, production Go/JS, module floor, compiler, runner, or sealed E-ORACLE bytes were changed. The full project runner was not run in this bounded portability repair.
