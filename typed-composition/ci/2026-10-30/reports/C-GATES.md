# C-GATES — fresh CI gate audit

**Outcome: confirmed reuse.** Primary run `41123116952`, job `124294552127`, and all ten PR workflows completed successfully. The primary log is bound by SHA-256 `41688d55e3ce524ed3b9697d4937108f51f25e89ec45c85b4d16dbbeb44a766a`; the uploaded ZIP digest is `113bd9d8e7e7b862c6ec08f72af4d07cb6c3b0cb0d6a9d4534e58dc6e76a264e`; extracted report SHA-256 is `338f88bcfc9dd62c1ae7909ad8f51eb677abf3350dab96a31397cea66c91591a`.

The primary checkout fetched PR 10 merge ref `db880b9ae3065805123b24a43f9514c91b823e0f` (head `42df6883337605d901a23e9fed874768c7ce1824` into base `d6d425765ee9d48eae22342a3cb75fab2e2871ba`). Runtime was Go `1.24.13`, Node `22.23.4`, npm `10.9.9`, Chromium `156.0.8078.4`, React/ReactDOM `19.3.1`.

CI invoked `bash run-typed-composition.sh`, which runs inherited `run-session-tree.sh`, Go tests and race tests, `go vet`, WASM/replay builds, bridge smokes, `node --test typed-composition/*.test.mjs`, browser smoke and the default checker. The typed Node suite passed `47/47`; the composition WASM smoke reported 16 methods, 18 malformed schemas and 6 unsafe IDs rejected, zero accessor reads, reentry blocked, and recovery after errors. Browser smoke passed, including the held loopback HTTP release. The extracted report is `matched`: 63 scripts, 2,463 actions/native frames, 4,926 actor-native comparisons, zero mismatches; all five negative controls passed.

The CI metadata and artifact-ready record bind the report, log and archive to the published tree. This confirms the recorded Linux CI run and toolchain only; it does not establish behavior on other runtimes. No tests or builds were rerun locally.
