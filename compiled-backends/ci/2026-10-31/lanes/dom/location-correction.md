# E-CI-DOM location correction

The E-CI-DOM report and receipt were initially created in the base coordination directories. Native acceptance requires the dated packet locations, so both files were moved byte-for-byte to:

- `compiled-backends/ci/2026-10-31/coordination/reports/E-CI-DOM.md`
- `compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-DOM.json`

No report or receipt content changed during the move. Their SHA-256 values remain `a141f71c0b289d7b16c027ae331a1c89de39e8c0a5d8e3a3cd20875794848e59` and `ff9b86058e17a425196d26c21593801d737549029fa954a9477080c066429af8`, respectively. Existing base coordination packets were left untouched.
