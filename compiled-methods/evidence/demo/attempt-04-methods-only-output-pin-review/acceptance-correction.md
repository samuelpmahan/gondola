# Acceptance correction — attempt 20261031T042524779Z

The harness/browser matrix, both backend builds, and the HTTP demo smoke completed. However, the outer runner’s finalizer recorded `outputPinsAfter` by hashing `builds/react` and `builds/dom`, while `outputPinsBefore` hashed `builds/{backend}/output`. Thus the final receipt contained 69 parent-directory entries after versus 67 compiler outputs before. Root withheld final acceptance pending the N5 fix and a fresh methods-only rerun.

The original runner receipt/report and all raw logs/traces/screenshot remain preserved as executed. Do not treat this run’s `status: passed` field as full output-pin acceptance.
