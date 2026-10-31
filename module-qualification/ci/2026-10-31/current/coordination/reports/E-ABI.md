# E-ABI — native admission of the four module builds

**Worker:** N3  
**Outcome:** `mixed_change`

## Implementation

Added `modulequalification.CheckABIs(root string) error` in `modulequalification/abi.go`. It admits exactly four build outputs: React parent/child and DOM parent/child. For every profile it:

1. Strict-decodes the build manifest and selects exactly one app with the expected backend and package/component identity.
2. Checks conventional `Init`, `Update`, and `View` manifest bindings and validates the sidecar and artifact paths stay under the build output. Every referenced component must be a regular file; symlink segments are rejected. Metadata files are capped at 16 MiB and generated artifacts at 64 MiB.
3. Strict-decodes the actual AppIR and module ABI sidecar. `moduleabi.DecodeDescriptorJSON` validates the sidecar’s closed shape and digest.
4. Reads the exact four artifact bytes named by the manifest, calls `moduleabi.ValidateArtifactBytes`, and derives a fresh descriptor with `moduleabi.Describe`. The derived descriptor must equal the sidecar.
5. Calls `moduleabi.ValidatePair` for the React pair and for the DOM pair, enforcing the frozen role signatures and nominal shared wire types.

`DecodeStrict` is the shared strict JSON helper owned by E-ARCHIVE. The implementation adds no module ABI or compiler changes and no JSON or Go dependencies.

## Verification

Go `1.24.0 linux/amd64` ran the focused ABI tests against `/tmp/gobi-published-restore-check`, the actual published 7bd0 capture root. The command passed and covered the four actual manifests and their 24 referenced build files (manifest, AppIR, module, encoder, components, and sidecar per profile).

The positive test admits the complete React/DOM parent-child set. Negative controls copy only the four build trees and verify rejection of a duplicate AppIR key, an unknown sidecar field, an unsafe `moduleABI` traversal, and modified compiled module bytes. All failures include the profile context. The first test run had one test-assertion mismatch: it expected the narrower error phrase `unknown field`, while strict decoding returned `unknown or incorrectly-cased JSON field`; the implementation correctly rejected the sidecar. The assertion was widened and the same focused command passed. The initial red record is preserved in `rawlogs/E-ABI/first-assertion-red.json` and `.stdout.log`.

Exact command, tool version, and output hashes are in `rawlogs/E-ABI/focused-abi-tests.command.json`. `rawlogs/E-ABI/actual-build-pins.json` pins all 24 build inputs and the capture’s source identity. The raw-log index covers 10 evidence files; SHA-256 `96a13b89c1df409393f5483d41ffd9d60590e601f170872ceb2f9d9a2b9420e4`.

The native receipt validator accepted the E-ABI job/worker/outcome fields, and native coordination state was unchanged across the read-only validation; the exact command and state hashes are in `rawlogs/E-ABI/native-receipt-validation.command.json`.

## Scope and limits

This verifier is limited to the known one-parent/one-child fixture and its React and DOM builds. It checks strict metadata, exact bytes, descriptor derivation, and pair compatibility; it does not rebuild the Go source or establish a signature, publisher authenticity, arbitrary module-graph compatibility, or malicious-code isolation. The broader CLI, archive, and captured interaction checks are owned by other lanes.

This lane changed only `modulequalification/abi.go` and `modulequalification/abi_test.go` in production source. It did not change Git metadata or native scheduler state.
