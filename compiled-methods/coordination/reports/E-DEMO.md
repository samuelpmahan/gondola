# E-DEMO (compiled Go value methods) — canceled attempt

**Outcome: insufficient_evidence.** This attempt was aborted during the inherited full runner after the pre-run source pins changed. It is not a successful full regression run.

- Attempt: `compiled-methods/artifacts/attempts/attempt-20261031T033026986Z`
- Invocation: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOFLAGS=-buildvcs=false CHROMIUM_PATH=/tmp/chromium bash run-compiled-methods.sh`
- Started: `2026-10-31T03:30:26.986Z`; canceled: `2026-10-31T03:37:48Z`
- Source pins: 136 before, 136 observed after; match: `false`
- Inherited command: `bash run-compiled-backends.sh`, interrupted with SIGINT (exit 130).
- Method-specific tests, builds, matrix, and HTTP smoke did not start.

## Source changes observed

- `compiled-methods/conformance/check.mjs`: before `e34d9d7f9d4140fa2209c8e8a3c536580cd3eb73725469e8b06efd2f3d100cc9`, observed after `d4ed6440b9b769118a4b082a54feb4a6f98f2aba9a9dc8ac99e5b64e53f496f9`
- `compiled-methods/conformance/check.test.mjs`: before `f1d09dc4a22d48321c33c26178da4939fbc445401e2e22e71c563647cc54eeb9`, observed after `b2001bd38155778e9dbad7dce380c93759161bf4540584e258b29da5395fb63b`
- `compiled-methods/run.mjs`: before `110a0f70c36ea7ab15317efefb7d83364e71ac45052e2204f02de38650a29ae3`, observed after `e4705aac3df9a0b42a1fc1c35679d22191e6c22ac5e53d1b93148ff31c364b64`

## Preserved evidence

The initial running receipt, original source pins, observed post-cancel pins, partial command output, and snapshots of the inherited backend receipt/report are retained under `compiled-methods/artifacts/attempts/attempt-20261031T033026986Z`. A compact copy is in `compiled-methods/evidence/demo/attempt-01-canceled/`. The inherited backend receipt was restored to the worktree base after its interrupted snapshot was copied.
