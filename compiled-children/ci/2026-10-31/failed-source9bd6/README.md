# Failed source9bd6 full run

Source: `9bd6c88a577f519d80b7be860f698363adcd1c05`. Command/environment: see `E-DELIVERY.json` and `root-launches.json`. Full outcome: **FAILED**. The inherited capability chain, 44/44 new unit tests, two fresh GoScript builds, nine oracle tests, fixed and bounded seeded native/direct/browser checks, all twelve mutation controls, and 32 HTTP demo checks passed with no semantic mismatches. The producer then returned tar exit 1: `tar: harness: file changed as we read it`.

The original failed producer container is preserved byte for byte in `archive/`. Its size is 52,324,311 bytes and SHA-256 is `57b2b63e5549e6e2a944c1f9658f165606847e701f809782c8d64f1759bcef4d`. Run `python3 archive/restore.py` from this directory to reconstruct it. A later standalone diagnostic consumer verified all 426 archived files against the original 86,400-byte manifest (SHA-256 `6a5822c0cfbd90f8327b7bc274cebd15509e13e3e29affa344d9210a2fd0b0c4`). This establishes container integrity only; it does not override the failed producer or establish full acceptance.

The inventory includes three observed temporary files. Their original bytes remain preserved. All 426 loose files still matched the inventory after the failure. The identity/cause of the directory metadata writer is unknown. No connection to the older PR15 local-container corruption is established.
