# failed-source935: failed full run

Source `935cb00ce92d4a28f346ac431db302c9f580ea44`. **Overall failed; not final acceptance.** FAILED: ignored native oracle capture absent; archive integrity passed

The original container is preserved as 27,678,233 bytes, SHA-256 `11c5f737f57cb46ce700a3b90bff9f2757d18126d967c19fc33ea1a337391a53`. Its archive integrity checks do not override the failed full-run status. See E-DELIVERY.json and full-console.log for exact commands, versions, seeds, stage outcomes and mismatches.

From this directory run `python3 archive/restore.py`; it verifies every chunk plus the whole container. Extract into a fresh directory with `tar -xzf archive/attempt-20261031T134933282Z-9.tar.gz -C <restore_root>`. The archive's paths are rooted at logs/, react/, dom/, oracle/, harness/, demo/, provenance/ and any inherited/ inputs present, not an extra attempt-directory wrapper. A prebuilt demo is available only if that attempt reached its demo stage; its HTTP root is `<restore_root>/demo/site`.
