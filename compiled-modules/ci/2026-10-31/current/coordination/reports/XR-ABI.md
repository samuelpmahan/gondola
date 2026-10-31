# XR-ABI — independent review of E-ABI

**Worker:** N3  
**Decision:** `amend`

## Packet integrity and scope

The immutable E-ABI report and receipt match their seal. All five N5-owned source files match the sealed source inventory (5/5), including `moduleabi/descriptor.go`, its tests, and the JS validator/test fixtures. The current contract hash is `ba6dbd37c15c83068216702f5c864af5e423d0871490a890a65052bd66710020`; I also checked the current RULINGS and ACCEPTANCE documents. N2's `compiled-frontend/build/pipeline.go` has changed since the E-ABI source pin during the separate UTF-8 work; this is recorded as post-packet input drift, not attributed to N5. The actual React/DOM artifacts used here remain the earlier pinned stable-build snapshot.

## Review results

The ordinary build path calls `moduleabi.Describe` with compiler-derived AppIR and the four generated artifact bytes. `Describe` checks the serialized `app-ir.json` against that AppIR, derives the role signatures and ordered reachable type closure, requires the exact four-file inventory, and computes per-file plus aggregate digests. Pair validation enforces the exact parent/child bridge role sets and nominal `modulewire.Input` and `Publication` type IDs with matching ordered fields. The JS validator independently snapshots its inputs before WebCrypto awaits, validates the raw `module-abi.json` sidecar against the object, checks duplicate members/UTF-8, compares AppIR bytes and source-derived role/type/capability closure, verifies all exact artifact bytes, and returns frozen snapshots. Canonical digest parity held for the recorded actual artifact paths.

The focused Go ABI suite and Node validator suite passed on Go 1.24.0 and Node v22.23.4. Re-running the exact actual-pair checks also passed: Go derived and decoded both pairs, checked their artifact bytes and pair roles; JS WebCrypto admitted both pairs and returned frozen snapshots. The 20 actual files (four module outputs × five files including sidecars) match the historical E-ABI pins. These are the earlier React/DOM build artifacts; compiler source has since changed for the separate UTF-8 boundary repair, so this review does not claim refreshed producer evidence.

The preserved BOM lineage is consistent: the old JS preflight witness logged `BOM_SIDECAR_ACCEPTED`; the current strict `ignoreBOM: true` validator logs `BOM_SIDECAR_REJECTED`, and the sealed Node test also rejects a BOM sidecar. The unsafe `Artifact.Bytes = 9007199254740992` witness was accepted before the Go fix and rejected afterward (`invalid artifact record`); current Go tests rehash this unsafe size and require rejection. Its original pre-fix `descriptor.go` hash was not captured, as the preserved witness note states; I do not attribute a source hash to that earlier run.

## Must-fix finding: Go and JavaScript canonical JSON disagree on allowed artifact paths

A focused counterexample shows a cross-language admission failure. I reused the actual React parent AppIR and four actual artifact byte arrays, changing only the legal output directory from `apps/moduleparent-462c3bad7b95/` to `apps/module&parent-462c3bad7b95/`. Go `Describe` accepted this path and emitted artifact digest `5b06301c98ba13f13fe2d32505877634d5da523b407304c1265a3487d8767112`. The JS validator rejected that Go-produced descriptor with `artifact inventory digest mismatch`.

Both path validators permit the ampersand in an `apps/<appDir>` segment. Go's `encoding/json.Marshal` escapes `&` as `\u0026` in the Go canonical digest, while the JS canonicalizer uses `JSON.stringify`, which leaves `&` literal. The exact source script, Go-produced sidecar, rerun outputs, and current source hashes are preserved under `rawlogs/XR-ABI/`. The normal pinned React/DOM directories are ASCII and pass, but the shared ABI accepts this counterexample, so the canonical digest algorithm or permitted path grammar needs a coordinated fix and regression test.

## Review boundary

This review did not edit production sources, run a full build/browser pipeline, or change Git/native scheduler state. SHA-256 establishes byte identity and descriptor consistency; it does not establish publisher authenticity or malicious-code isolation. `ValidateArtifactBytes` independently checks that supplied bytes match the descriptor inventory; semantic AppIR binding is demonstrated by `Describe` in the build path and by the JS validator's AppIR comparison, not by that byte-only method alone.
