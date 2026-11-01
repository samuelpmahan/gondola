# XR-CUSTODY: independent recovery review

**Worker:** N3  
**Decision:** accepted  
**Scope:** E-CUSTODY recovery evidence only

The recovered checksum list matches the original E-OFFLINE target exactly: 1133 bytes, SHA-256 `a201c2d9a38409755c0144a3af1045c17131b9cd500fb10519cab1983928b929`. A byte comparison against the canonical `rawlogs/E-OFFLINE/sha256sums.txt` succeeded. The same digest and size appear in the original sealed rawlogs index.

The provenance distinction is supported by the captured bytes. The candidate based on the current E-OFFLINE report digest has SHA-256 `660fc1ddc7be122b78c62128f50a4938060cded68690858766248d8bf745725f`; comparing it with the recovered candidate shows only the final report-hash line changed. The recovered candidate uses the earlier recorded report digest `11d72fa4780a80886477febc04e3373c0ffd5f2f845d60d893263890d6619cfe`. This is a historical metadata pin, not a claim about the later canonical report. The seven non-report entries validate against their original files; the current-report candidate validates all eight entries against the current files.

I independently checked all 39 entries in `seals/E-OFFLINE/rawlogs-index.json`; every original rawlog pin passed. The restored commands, byte counts, and checksum list therefore remain consistent with the original seal. The postseal report and recovery checkpoint explain the historical report reference and remain intact.

**Conclusion:** accept the recovery as exact metadata recovery. The historical report pin is not an execution mismatch. This review did not rerun the CLI or alter source/product files; it records only digest and rawlog-index checks. Detailed commands and captured outputs are in `rawlogs/XR-CUSTODY/`.
