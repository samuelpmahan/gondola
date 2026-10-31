# E-GO-CHANNELS: reject malformed raw channel lists

**Worker:** N2  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Repair

Changed only `backendqualification/certify.go` and `backendqualification/qualification_test.go`. `certifyCase` now passes the raw report row's `observedChannels` to `validateChannelList` before channel-policy evaluation (`certify.go:350`). That validator rejects unknown and duplicate names first, then compares the canonical ordering of known names with the evidence-derived channel set. Raw order remains flexible and the registry's five-channel and per-fault policies are unchanged.

The new regression tests modify only raw report rows, leaving their evidence files and hashes untouched. They cover unknown and duplicate names on fault rows, unknown and duplicate names on a healthy row, and a valid fault row whose four channels are reordered. Invalid rows now fail with specific unknown/duplicate errors; reordered valid rows still certify and produce canonical output.

The sealed XR-GO review's actual-capture probe had shown that `fault-react-text-corruption` with raw `observedChannels` `["dom", "gpu-pixels"]` and with `["dom", "dom"]` both exited zero despite unchanged evidence hashes. The preserved red regression run independently reproduced acceptance for unknown fault, duplicate fault, and unknown healthy rows. The duplicate known channel on a healthy row was already rejected by the old set comparison, but only as a channel-set mismatch; the new test requires the raw duplicate to be identified before that comparison.

## Verification

- Go 1.24 targeted regressions and combined Go package tests passed, including `backendqualification` and `cmd/backend-qualification`.
- The real N4 report still certifies: Go CLI output is `qualified: true`, 13/13 passed, and its certificate SHA-256 is unchanged at `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174`.
- New actual-report controls copied the 13 referenced evidence files unchanged, modified only the raw row, and confirmed both `["dom", "gpu-pixels"]` and `["dom", "dom"]` fail closed with exit 1 and no certificate output.
- N5's Node 22 CLI black-box suite passed 15/15 with the repaired certifier.

The original E-GO report/receipt remain byte-identical to their seal copies. The XR-GO AMEND report/receipt and its raw reproduction logs remain unchanged. No registry, CLI, oracle, application, browser, Git, or scheduler files were changed.

The task-provided `/tmp/gondola-go/bin/go1.24` path did not exist here; that exact failed attempt is retained. All successful Go commands used `/tmp/gondola-go/bin/go`, which reports `go1.24.0`. The Node CLI suite used Node `v22.23.4`.

This packet addresses the raw observed-channel parsing finding. It does not close the separate XR-GO note about supplemental callback metadata, and it does not claim a full qualification pipeline or hosted-CI run. Source and evidence hashes are pinned in `coordination/receipts/E-GO-CHANNELS.json`.
