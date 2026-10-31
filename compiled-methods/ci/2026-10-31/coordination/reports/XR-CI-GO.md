# XR-CI-GO — independent review of the primary Go lane

**Decision: `amend`.** The successful primary artifact, Go/native/direct audit, and rerun evidence are sound for the bounded lane. One sentence in the E-CI-GO report overstates what the fixture specifies about views; narrow that claim before closing the receipt.

## Review target and verified evidence

I reviewed E-CI-GO report SHA-256 `5ec5ac56d4ceaeb6733e53850308ac5dde8a454dd6582a3536dc559c2f4cd256`, receipt SHA-256 `5f518e33bfc3e93b0a697c4b3d0e222385c49155e628efd552e97086ce85e37c`, audit script SHA-256 `259b173aefb9a8e0459644e7614ce4a97e27435a9636c24c1f7445e309b82346`, and audit result SHA-256 `7094b22776f354047af95fc54c8189a6af83210f02c308e295031a2c57320fc2`.

The audited target is source `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`. The primary artifact metadata and retention manifest match successful push run `41169518187`, job `124444234335`, artifact `13030848292`. The 11,460,089-byte provider ZIP has SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`; ZIP CRC passed, and I independently checked all 968 ZIP members and extracted files against the retained byte/hash inventory.

The full methods execution record reports 17 commands with exit code 0, no failures, and stable source pins. I independently verified the recorded command stdout/stderr hashes, 188 source pins, and 149 output pins. The native and direct traces are equal at 19 ticks and match all 18 fixture expectations for typed state, messages, dispatch IDs, and effects. AppIR has the 15 expected symbols and matching typed signatures/call edges. The retained value-semantic checks show 14 preserved-input updates, two `PublishSaved` witnesses, and two read-only guard probes.

I reran the actual retained native binary and emitted GoScript module against the fixture. Both exited 0 and reproduced the stored traces. The native output hash matches the original audit (`2e9e620a788fbc6e1973e62b2d9775fdf1c03f8ab72a28f5c61aea8f16dfc4f2`); the direct output hash also matches (`0a8da95c47e6fb45ac9e2a83397ddeea54ae9a8f23cdd0f6a68bee9b60f52c08`). The direct replay emitted the recorded Node `EnvHttpProxyAgent` experimental warning on stderr and still exited 0. The native replay used a byte-identical temporary executable copy with mode `0755`; the archived artifact was not changed.

## Required amendment

The E-CI-GO report says the native/direct traces “match all 18 fixture expectations for typed state, messages, dispatch IDs, effects, and views.” The frozen fixture's 18 expectations have no `view` field, so they cannot establish an expected view tree. The audit script checks that corresponding native and direct view values are equal, but it has already asserted the entire native and direct traces are equal; that equality is not a fixture-defined view expectation.

Suggested wording: “The native and direct-module traces are equal at 19 ticks and match all 18 fixture expectations for typed state, messages, dispatch IDs, and effects. Their View records are equal across both traces; expected View-tree contents are independently checked in E-CI-DOM.” E-CI-DOM independently compares the actual browser trace/view snapshots to its hand-authored Go tree expectations, so this is a bounded report wording correction, not a failed conformance result.

## Reproducibility and scope

The independent review script is `lanes/dom/review-go/review_current_go.py`; it validates the artifact provenance and records, checks the author packet hashes, independently checks the trace and pin evidence, and reruns both artifacts. It was run with Python 3.12.14 and Node `v22.23.4`. The exact direct replay entry point and replay outputs are retained under `lanes/dom/review-go/`.

This decision accepts the substantive primary push Go/native/direct evidence, not the separate PR run or global workflow readiness. No source, artifact, or Git state was changed. After the view-claim wording is corrected and the canonical report/receipt hashes are refreshed, the Go lane can be accepted without repeating these replays.
