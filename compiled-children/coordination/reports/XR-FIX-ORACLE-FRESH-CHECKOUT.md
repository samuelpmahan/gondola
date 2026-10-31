# XR-FIX-ORACLE-FRESH-CHECKOUT (N3)

**Decision: `accepted`.** The repair removes the oracle's dependency on ignored checkout state and retains the fresh native trace in the attempt receipt and archive inventory.

## Review findings

- The preserved original test read `compiled-children/oracle/evidence/native.json`. The repaired test no longer reads that path: at module startup it directly runs the native Go CLI with `spawnSync`, explicit argv, the repository root as cwd, and `GOTOOLCHAIN=local` / `GOFLAGS=-buildvcs=false`. It checks the newly returned trace against the literal oracle and writes the exact stdout bytes only when the runner supplies a capture path.
- The runner chooses `attempt/oracle/native.json`, passes that path and its selected Go executable to the test, requires the file after the test, records its byte count/hash and Go command details, and lists `native.json` among `archivedInputs`. The attempt walk includes the file in the archive member inventory. The oracle source directory is part of the runner's source-pin walk and source pin boundaries.
- The changed test and runner match N5's pins. The previously reviewed shared archive helper and its test still match their accepted pins. The preserved original copies, originals manifest, three unchanged oracle/data pins, and all seven author rawlog pins match. The literal oracle module, expectations, and scenario are unchanged; the two edited paths are exactly the oracle test and runner.
- Independent Node 22 / Go 1.24 runs passed **9/9** both with the ignored capture absent and with a newly selected runner-style capture destination. The ignored evidence file remained absent. The fresh capture is 653,879 bytes, SHA-256 `8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb`, schema `gobi.compiled-children-native/v1`, 42 events and 38 update steps. This matches the author packet's trace pin.
- I confirmed the recorded auxiliary probe failure expected 39 update steps while observing 38; the corrected check reports 42 events / 38 updates. The earlier receipt-path probe stopped before checking bytes, and its corrected validator matched the recorded paths and hashes. Neither was an oracle implementation failure.

## Verification boundary

The two focused oracle tests and both syntax checks passed. I did not launch the full delivery runner or create a complete archive; archive retention is confirmed by code inspection and a focused runner-path capture test. The fresh full-chain run remains root's integration acceptance step.

Raw outputs, captured native trace, source/original/rawlog pin comparisons, and code-binding checks are recorded under `coordination/rawlogs/XR-FIX-ORACLE-FRESH-CHECKOUT-*`. No Git or native state write was performed.
