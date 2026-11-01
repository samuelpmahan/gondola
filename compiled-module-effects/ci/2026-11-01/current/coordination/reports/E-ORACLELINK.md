# E-ORACLELINK — reply ledger linkage repair

**Worker:** N5  
**Job:** `E-ORACLELINK`  
**Outcome:** `mixed_change`  
**Repository base:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Repair

The sealed E-ORACLE checker compared a reply correlation only when the reply row happened to contain one. It also did not tie the reply ledger's `stateEventIndex` to the event that caused the Go state transition. N4's saved mutation probes therefore showed that an accepted reply with its correlation deleted, or with `stateEventIndex` changed to `999`, could pass.

The checker now requires every reply row for a known request to carry exactly `{dispatchId, effectIndex}` and to equal that request's original correlation. Renderer epoch remains an independent field. It links accepted replies to the matching capture event's `hostEventIndex` and `result.eventIndex`; duplicate replies to the request event; and canceled replies to the corresponding Go cancel event. It also verifies request and cancel effect rows against their source host event and rejects extra reply rows.

Focused unit cases cover missing correlation on accepted, duplicate, and canceled replies, plus incorrect state-event links for each disposition. The existing eight capture controls remain; eight controls were added for missing, extra, and mismatched reply correlation and for incorrect accepted, duplicate, and canceled reply state links.

## Verification

The final acceptance used pinned Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`. Healthy checks over the saved, source-pinned E-HARNESS attempt-03 captures passed before mutation controls ran.

| Scenario | Source events | Native states | Go effects | Transport events | Lifecycle rows | Profiles matched |
|---|---:|---:|---:|---:|---:|---:|
| Literal | 31 | 32 | 10 | 20 | 5 | 5/5 |
| Seed 20261104 | 49 | 50 | 16 | 32 | 5 | 5/5 |
| Seed 20261105 | 50 | 51 | 17 | 34 | 5 | 5/5 |
| Seed 20261106 | 48 | 49 | 15 | 30 | 5 | 5/5 |

All 20 healthy profile checks matched. The aggregate native arrays contain 178 events, 182 states, 58 effects, 116 transport rows, and 20 lifecycle rows. Across the five profiles, the captures contain 890 event rows and 910 snapshots.

All 16 distinct capture mutation controls were rejected for every scenario: 64 scenario applications, 64 detections, and zero accepted mutations. The controls modify in-memory clones of saved capture evidence. They do not inject faults into a mounted renderer or claim a faulty host implementation was captured. No build-admission mutation controls were rerun for this follow-up.

The Node unit suite passed 4/4, and the oracle syntax check passed. Node 22 emitted an experimental `EnvHttpProxyAgent` notice to stderr; it did not affect the checks. An initial exploratory pass under system Node `v24.22.1` is preserved separately as `*.node24.*`; the final acceptance is the pinned Node 22 run.

## Commands and pins

Exact acceptance command:

```text
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH bash ../module-effects-coordination/rawlogs/E-ORACLELINK/pinned-node22-validation.command.txt
```

The wrapper records the pinned Node version and runs the saved-capture healthy matrix, unit tests, 16 mutation controls, and syntax check in that order. `pin-inputs.command.txt` records source, dependency, build-index, and capture hashes. Input captures are referenced by path and SHA-256 in `capture-input-pins.json`; the multi-megabyte capture files were not duplicated.

Key source pins:

- `oracle.mjs`: 93,905 bytes, SHA-256 `c24b3a7828eb22df65b39bd8090bfc5d96a79dd8cd55fd9db5471d1b74bf0d64`.
- `oracle.test.mjs`: 7,704 bytes, SHA-256 `962798dfc1c40e85e24e8b3f44ebe8688004b5df29dda860cdb3d29ba1cac745`.
- Scenario test dependency: SHA-256 `de9784963969a7563450d6cb0883d77c1184b0ad9344188abd724d72d68df4ea`.
- Saved E-HARNESS capture summary: SHA-256 `ef336f8b37a8d19980ec6cd230efcfb186890d41cabb9fb3f65a6656a8bbffb4`.
- Build index provenance: SHA-256 `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444`.

The previous sealed E-ORACLE source hashes are recorded in `source-pins.json`; its report and receipt were not changed. The E-ORACLELINK rawlogs index lists 24 evidence files, excludes itself, and has SHA-256 `bbd846e2f3256993f39fce58922db4d750891fe2d534aa0a96c67eb7b98f3409`.

## Limits

This is a recheck of the saved N4 browser/direct and N1 native arrays, not a new browser capture. It does not re-run the Go compiler or build-admission probes, and it makes no claim of mounted fault injection. N5 made no Git or scheduler mutation and changed no runtime, harness, scenario, or consumer files.
