# E-DELIVERY — compiled module profile, author evidence

**Worker:** N6  
**Outcome:** `mixed_change`  
**Scope:** `compiled-modules/run.mjs`, `compiled-modules/demo/build.mjs`, `compiled-modules/README.md`, `compiled-modules/RESULTS.md`, `compiled-modules/.gitignore`, `run-compiled-modules.sh`, `.github/workflows/gobi-compiled-modules.yml`, and this packet.

## Delivery implementation

The runner is implemented as a fresh per-attempt profile. It validates the supplied source label and worktree boundary, runs focused Go and Node checks, captures a fresh native fixture trace, makes independent parent/child GoScript builds for React and DOM, invokes N4's native/direct/browser conformance runner, builds the HTTP demo from the four manifest-resolved outputs, exercises it in Chromium, and archives the attempt from a frozen explicit member list. Its final checks compare source and archive pins and run an independent archive consumer after the producer returns. Runtime receipts are unique per attempt and are separate from this worker packet.

The demo builder reads the exact `module-abi.json` sidecar bytes as well as the four descriptor-listed artifact files, constructs typed module profile records, and bundles the existing pair host and demo. The wrapper checks Go 1.24 and Node 22. The workflow runs this profile and preserves its unique attempt evidence; its separate job runs the existing Milestone 0 and counter interaction regressions. The runner does not use the unrelated backend qualification certificate schema.

## Author verification

Current source static checks passed under Node v22.23.4 and Bash:

- `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-modules/run.mjs` — exit 0.
- `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-modules/demo/build.mjs` — exit 0.
- `bash -n run-compiled-modules.sh` — exit 0.

A prepublication Chromium HTTP smoke passed against four earlier N2 build manifests: separately built React parent/child and DOM parent/child. Those outputs predate the latest N1 GoScript UTF-8 and N2 numeric-boundary repairs, so this smoke is limited to demo wiring and is not final module-profile acceptance. The test observed the DOM profile mounted, step-up plus child Add producing count 2, Add physically disabled while locked, direct Go Add accepted with no state change while locked, input reset returning the child input to step 1, and a React-to-DOM swap round trip retaining state. It recorded seven trace events and no page errors. The bundle was 6,323,680 bytes, SHA-256 `b672fe077a3b96f7bfb024dc0008b5d0781fc83e45ac71633bec4ee087d4e55d`. The manifests and complete output pins are in the N2 build index (SHA-256 `445e2207c1660a43cdcd91aebc1c26964a9fceba36ca238b9fd86de1d964d022`) and the author smoke metadata.

Two failed author attempts are preserved. The first bundle attempt exited 1 because `nodePaths` was undefined. The second bundle built but the HTTP mount exited 1 because the namespace encoder did not expose `gobiEncodeState` as an own data property. The build adapter was corrected to provide an own-data encoder, and the third HTTP smoke passed. Exact attempt records, build metadata, smoke script, and stdout/stderr are retained in `rawlogs/E-DELIVERY/author-demo-smoke/`.

The README write attempt for an additional Linux-specific phrase failed with the exact tool output `Script completed with exit code 1` / `Failed to write file /workspace/scratch/39a56936f173/gondola/compiled-modules/README.md`. This was a filesystem write error, not an automatic approval rejection. It was not retried because the existing README already states that other operating systems are outside the evidence scope. The attempted edit did not change the README.

## Acceptance boundary

The full runner has **not** been executed by N6. The final producer run remains gated on N1/N2's UTF-8 producer and numeric-boundary repairs and root's exact source freeze. This packet therefore makes no claim about a fresh native/direct/browser comparison, seeded profile, full regression suites, archive creation/consumer verification, source-to-Git matching, or completed source-bound acceptance. Root is responsible for that final run. The author source pins in this packet describe the current worktree snapshot, not a Git commit attestation.

The demo evidence is one parent plus one child with the declared primitive ABI and the tested React/DOM pair. It does not establish arbitrary module graphs, arbitrary Go programs, async effects, malicious-code isolation, cryptographic provenance, pixel equivalence, other browsers, or other operating systems. The README documents these limits and gives concrete steps to add another renderer and rerun the existing profile.

## Evidence files

- Source and prior-build pins: `module-coordination/rawlogs/E-DELIVERY/source-pins.json`
- Static command outputs and tool summary: `module-coordination/rawlogs/E-DELIVERY/static-checks-*` and `*-check.*.log`
- Prior-build HTTP attempts and captures: `module-coordination/rawlogs/E-DELIVERY/author-demo-smoke/`
- README write error: `module-coordination/rawlogs/E-DELIVERY/docs-patch-attempt.json`
- Raw-log index: `module-coordination/rawlogs/E-DELIVERY/index.json`
