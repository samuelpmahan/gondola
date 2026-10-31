# HTTP demo probe

- Attempt: `compiled-methods/evidence/demo/http-probe/attempt-20261031T034015684Z`
- Status: `passed`
- Outcome: `mixed_change`
- Compiler input: `compiled-methods/artifacts/compiler-gate/react/output/apps/methods-0cac42b0a982/gobi-compiled.mjs`
- Smoke status: `passed`
- Screenshot: `compiled-methods/evidence/demo/http-probe/attempt-20261031T034015684Z/screenshot.png`

## Checks

- captured source pins and compiler-gate React module/AppIR/encoder pins before running the HTTP probe
- real local HTTP route passed the nested methods smoke on React with managed Playwright and remained source/output stable

## Failures

- None.

This is a local HTTP demo probe against the compiler-gate React output. It does not represent the inherited full regression run or a fresh compiler build.
