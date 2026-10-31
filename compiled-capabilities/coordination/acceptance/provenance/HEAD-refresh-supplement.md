# E-PREP-PROVENANCE additive HEAD-refresh supplement

The original closed E-PREP-PROVENANCE report and receipt were restored byte-for-byte and left unchanged after native finish. Their SHA-256 values remain:

- Report: `4faf7d74621659d562930bd83854e319fd4fe1e740217f891ec97d3ceac21ef2`
- Receipt: `07605b2872369ba866a57ae54730f007383f3771a5e281295944056dfe73ce96`

## Why the refresh was needed

The source commit became available while I was finalizing the packet. The original missing-input test used the frozen base commit as `--source-commit`; the auditor correctly rejected it after `HEAD` advanced. I changed the test to resolve the current `HEAD` and its tree at runtime, and made the test receipt a stable synthetic preflight fixture. This keeps the missing-evidence test independent of the canonical E-BUILD receipt, which the full runner may replace.

The auditor also received two small corrections after the closed hashes: a source-pin success message now says “local Git blobs” if no binding was provided, and a non-frozen `--base-commit` reports `status: failed`. The source-pin verifier also checks that the generated-map exception is absent from the published tree.

## Source hashes

| File | Closed version SHA-256 | Refreshed version SHA-256 |
|---|---|---|
| `audit.mjs` | `1a8bc1b215c52c1922d18f4a1940600a77e63d886a8e7b8d166ab266e1e83671` | `c121b32bfb6874f7e5480096e1ea309b4c8eead04408556b8465f912cfd4dd9e` |
| `audit.test.mjs` | `c532ec1e33f31ffcfa544127774716e58abf774dbfad6be7d70c535c3f7f3419` | `9b09726dca8f29f3a73f9a135efc138007396d79dbb18d98dff77ee5375b6a36` |

The synthetic receipt fixture SHA-256 is `1928fbe874a8a23372d9ea5a200be03de2277c8afccc8d71cab079473fa1f4ce`.

## Refreshed commands and results

Environment: Node v22.23.4. Tested current local HEAD `232406843678f46c569e1c54b34b268c84e7764e`, tree `4cf0a6bf06f5aac29788ddd77fc61ed79a34e3a1`, parent `00da54ad0f5a4006b13a5cded18ce291845978bc`.

- `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-capabilities/coordination/acceptance/provenance/audit.mjs` — exit 0.
- `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-capabilities/coordination/acceptance/provenance/audit.test.mjs` — exit 0.
- `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-capabilities/coordination/acceptance/provenance/audit.test.mjs` — exit 0; 3 passed, 0 failed.
- `/tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/coordination/acceptance/provenance/audit.mjs --repo-root "$PWD" --receipt compiled-capabilities/coordination/acceptance/provenance/fixtures/missing-full-run.json --source-commit 232406843678f46c569e1c54b34b268c84e7764e --expected-tree 4cf0a6bf06f5aac29788ddd77fc61ed79a34e3a1` — expected exit 2; `status: incomplete`, `finalAcceptance: false`; M0 verification passed for 23 tracked files and the signed generated map.

The refreshed command output is stored in `logs/`. Their current SHA-256 values are:

- `logs/audit-syntax.log`: `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8`
- `logs/test-syntax.log`: `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8`
- `logs/node-test.log`: `3e15a0b62fdb2d0e1f67c9b3ee098b316e240bc7c1d1ddea898e27530d7333d3`
- `logs/missing-input-exercise.json`: `27c373367ed3b58ebeec9e2747a834a066aaf9a2f3c4c60b749a7e6e87925f71`
- `logs/missing-input-exercise.stderr.log`: `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8`

The log files at these same paths were regenerated for the HEAD refresh, so the original receipt's log hashes describe their earlier contents. No acceptance, publication, archive, or build result is claimed here; the canonical E-BUILD receipt still lacks full-run source pins, and no remote binding was supplied. This supplement and the refreshed source are ready for the independent reviewer.
