# HTTP demo probe — failed preflight

This attempt stopped before invoking the build or browser. The probe source list incorrectly looked for `compiled-methods/run-compiled-methods.sh`; the wrapper is at repository root. No compiler output was modified and no browser smoke ran. The path is corrected in the next attempt.

- Status: `failed`
- Attempt: `compiled-methods/evidence/demo/http-probe/attempt-20261031T033912688Z`
- Exact error: `ENOENT: no such file or directory, open compiled-methods/run-compiled-methods.sh`
- Commands launched: none
