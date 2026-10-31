# R-OBSERVATION evidence index

The production change follows the R-RUNTIME source freeze and closes the renderer Promise-return gaps identified by XR-R-CONTRACT. The preserved original observation is [the XR-R-CONTRACT probe](../../reviews/xr-r-contract/postcommit-observation-promise-probe.mjs) and [its captured result](../../reviews/xr-r-contract/postcommit-observation-promise-probe.json); their original SHA-256 values are `cc6d2fa59a2dfef2dd25e3f6bab561bd20764bd4989d5e131e21d5a98d04ccf9` and `a1aa98f2b808887d695b2cca107a2f4887dc44baaced37b957e8d80c9aa48555`.

The pre-repair R-RUNTIME files were runtime `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105` and tests `3ddaaded2db26d7b2acf9bcbd8e85584f1f4b57e1e89b325a602aff5dab39fcc`. Final frozen files are runtime `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4` and tests `39790809f3392bb47b3f48d17bfdc40b6fe8628961513f0b1ddf3e69a014e907`.

## Executions

| Check | Command | Result | Evidence |
|---|---|---:|---|
| Runtime tests | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/runtime/runtime.test.mjs` | Exit 0; 27 passed, 0 failed | [`runtime-node22.log`](runtime-node22.log), SHA-256 `0e62b5e5bf903bb54f83ec6c8ca11d7fd64fdbaa7a415b7caf583188246dd788` |
| Runtime syntax | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/frontend/runtime/runtime.mjs` | Exit 0 | [`runtime-syntax.log`](runtime-syntax.log), SHA-256 `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8` |
| Test syntax | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/frontend/runtime/runtime.test.mjs` | Exit 0 | [`test-syntax.log`](test-syntax.log), SHA-256 `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8` |

Runtime version: [`node-version.txt`](node-version.txt), `v22.23.4`. The full suite emitted the existing experimental `UNDICI-EHPA` warning. The two newly added tests assert absence of `unhandledRejection` after a next-turn wait for rejected `viewRecord()`, `domSnapshot()`, and active `unmount()` Promise returns. No full application/DOM matrix result is claimed by this lane.
