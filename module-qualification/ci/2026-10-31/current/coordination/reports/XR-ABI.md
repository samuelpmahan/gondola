# XR-ABI — independent review of native module ABI admission

**Worker:** N2  
**Decision:** `accepted`

## Reviewed packet and scope

I reviewed the sealed E-ABI report, receipt, source inventory, source files, raw-log index, and actual four-profile capture. The author packet is unchanged from seal: report SHA-256 `d39800acaa6563f51d720706b60590b1354072fa7fea6c6d258e72b18ba5e006`, receipt SHA-256 `edc08f716c6bf4117a9102db224375c8cc4a3f2e5905b9c9c2f84b27917387fa`, and raw index SHA-256 `96a13b89c1df409393f5483d41ffd9d60590e601f170872ceb2f9d9a2b9420e4`. Its `seals/E-ABI/seal.json` binds those report and receipt hashes.

The receipt’s two owned source files and four dependencies all match their byte and SHA-256 pins. All 10 author raw-log index entries also match. The independent byte audit is [source-and-capture-audit.json](../rawlogs/XR-ABI/source-and-capture-audit.json), SHA-256 `a035777f7139ae5af7149ca5ed4726db1ebab04df1143a9d6e0c8a7c7dd27f6a`.

## Findings

The capture identifies source commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`; its runner metadata and source-closure record agree, and report a clean source snapshot. All 26 pinned files (the two capture metadata files plus six files for each of the four profiles) match their recorded byte counts and hashes. The four build manifests select exactly one matching package/component apiece; AppIR identities match those manifests.

The actual React and DOM parent descriptors expose conventional `Init`/`Update`/`View` plus `Output`/`Receive`; the child descriptors expose `Init`/`Update`/`View` plus `Input`/`Publication`. Each descriptor binds the same four generated artifacts (`app-ir.json`, `gobi-compiled.mjs`, `encoder.mjs`, `components.gen.mjs`) and the shared nominal `modulewire.Input` and `modulewire.Publication` types. The focused checker derives descriptors from the captured AppIR and exact artifact bytes, validates each sidecar against those bytes, and validates each backend pair with `moduleabi.ValidatePair`.

I independently reran the focused Go 1.24 tests against the pinned capture using explicit source files, then added a symlinked compiled-module negative witness. The command exited 0; the existing duplicate-AppIR, changed-module-bytes, unsafe-sidecar-path, unknown-sidecar-field controls passed, and the symlinked artifact was rejected. Exact command and logs are in [focused-review.command.json](../rawlogs/XR-ABI/focused-review.command.json); the final raw-log index SHA-256 is `dc5680eea992561b6a2bcdc1e173a37ada028724c61f772e1622cfbe2da92f27`.

No material false acceptance or integrity mismatch was found. The E-ABI first run’s test-assertion mismatch is accurately preserved and described as an assertion wording issue; the implementation already rejected the input.

## Limits

This review covers the fixed React/DOM parent-child ABI checker and its captured build bytes. It does not rebuild Go source, verify mounted runtime behavior or the full profile matrix, authenticate a publisher, or establish arbitrary module-graph compatibility. The path checks reject symlinked segments as tested, but do not claim protection against a concurrent writer racing between filesystem inspection and open.
