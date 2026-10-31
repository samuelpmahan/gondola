# failed-source978: failed full run

Source `97864ee2ae7c2e28f8594f6705acc224dc3a0594`. **Overall failed; not final acceptance.** FAILED: inherited startup rejected5/5 tests due exactcount3. All newappsemantics/archivepassed

The original container is preserved as 16,625,595 bytes, SHA-256 `a11817d20da1a167a016dba08cedd4ea2baf2aa75232d8fe0110e9193fde5c9f`. Its archive integrity checks do not override the failed full-run status. See E-DELIVERY.json and full-console.log for exact commands, versions, seeds, stage outcomes and mismatches.

From this directory run `python3 archive/restore.py`; it verifies every chunk plus the whole container. Extract into a fresh directory with `tar -xzf archive/attempt-20261031T143022891Z-7.tar.gz -C <restore_root>`. The archive's paths are rooted at logs/, react/, dom/, oracle/, harness/, demo/, provenance/ and any inherited/ inputs present, not an extra attempt-directory wrapper. A prebuilt demo is available only if that attempt reached its demo stage; its HTTP root is `<restore_root>/demo/site`.
