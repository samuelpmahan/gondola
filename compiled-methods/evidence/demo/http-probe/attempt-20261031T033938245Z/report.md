# HTTP demo probe

- Attempt: `compiled-methods/evidence/demo/http-probe/attempt-20261031T033938245Z`
- Status: `failed`
- Outcome: `insufficient_evidence`
- Compiler input: `compiled-methods/artifacts/compiler-gate/react/output/apps/methods-0cac42b0a982/gobi-compiled.mjs`
- Smoke status: `not run`
- Screenshot: `not captured`

## Checks

- captured source pins and compiler-gate React module/AppIR/encoder pins before running the HTTP probe

## Failures

- http-demo-smoke: (node:41) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
- probe: http-demo-smoke failed with exit 1

This is a local HTTP demo probe against the compiler-gate React output. It does not represent the inherited full regression run or a fresh compiler build.
