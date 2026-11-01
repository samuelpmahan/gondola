# Compiled keyed modules results

## E-DELIVERY author diagnostic

The N6 delivery profile ran against source commit `4395d41ade7e4196878b6885d4c46dd4d8ec85f1` with `--allow-dirty`. Four independent builds completed; focused Go and Node checks passed; the native/direct/browser matrix matched for the literal scenario and all three seeds; build and capture mutation controls were rejected; and the actual mounted demo smoke passed all six interaction steps.

The run exited 1 at the final source-stability gate. `compiled-keyed-modules/oracle/oracle.mjs` and `compiled-keyed-modules/oracle/oracle.test.mjs` changed while the profile was running. The runner preserved the failed attempt and its source pins; no successful archive receipt was created. The exact mismatch hashes and compressed attempt are recorded under `../keyed-module-coordination/rawlogs/E-DELIVERY/`.

This author diagnostic is not clean-source evidence. Root owns the integrated clean-source run and acceptance decision after the source packet is sealed.
