# XR-NUMERIC — independent review of the safe Add boundary repair

**Reviewer:** N6  
**Decision:** `accepted`  
**Author packet:** N2 `E-NUMERIC`  
**Review scope:** sealed numeric repair sources, source inventory and seal, exact build outputs and boundary probes, Go/native logs, and prior E-GO trace identity. No production source, author packet, Git state, or scheduler state was changed.

## Finding and decision

The repair closes the reviewed MAX_SAFE publication mismatch for the frozen step-1/2/3 counter fixture. The child checks the whole addition before calling `counter.Update`: step 1 requires a count below `9007199254740991`, while steps 2 and 3 require the count to be no greater than `MAX_SAFE_INTEGER - step`. The multi-step guard runs before any reducer call, so an over-bound step-2/3 Add remains unchanged instead of publishing a partially applied count. Valid increments still reuse `counter.Update` once per increment. Reset remains independent of the lock and is usable at the maximum count.

The six boundary cases are:

| Case | Result | Parent publication check |
|---|---|---|
| Step 1 starts at MAX_SAFE_INTEGER | Count unchanged | Current-revision publication accepted |
| Step 1 starts one below maximum | Reaches maximum | Accepted |
| Step 2 starts two below maximum | Reaches maximum | Accepted |
| Step 2 starts one below maximum | Entire Add rejected, unchanged | Accepted unchanged publication |
| Step 3 starts three below maximum | Reaches maximum | Accepted |
| Step 3 starts two below maximum | Entire Add rejected, unchanged | Accepted unchanged publication |

The sealed Go test asserts those state and parent-receive outcomes. Its test-first red is also preserved: before the source fix, step 1 at the maximum and the step-2/3 overflow cases reached `9007199254740992`. I independently reran `go test -count=1 ./fixtures/compiled/modulechild` with Go 1.24.0; it passed. The separate Go reset case starts at MAX_SAFE_INTEGER with the child locked, resets to zero, and confirms that the parent accepts the zero-count publication at the current revision.

I imported the exact hash-pinned emitted child modules and their corresponding parent modules, then reran the six-case boundary probe under Node v22.23.4. React passed 6/6 and DOM passed 6/6. Each case executes the compiled child `Update`, reads its generated `Publication`, and calls the compiled parent `Receive`, asserting count and revision parity. These are direct compiled-module probes, not browser mounts.

The normal native scenario output after the repair is byte-identical to sealed E-GO: 208,651 bytes, SHA-256 `169b1e20faa959d0c964dc943910e59a33be599287c8e6fbddfae77d39e37a7a`. It does not approach the numeric boundary, so this identity check shows the ordinary scenario was preserved; it does not exercise the boundary itself.

## Pin and custody audit

The E-NUMERIC report and receipt match their sealed copies. The four enumerated receipt arrays contain 69 pin records: 9 source pins, 14 generated-output pins, 36 evidence pins, and 10 reviewed-artifact pins. I verified all 69 recorded hashes, all three entries in the sealed source inventory, and each file in both compiler output inventories (70 React files and 70 DOM files). The 14 selected AppIR/module/encoder/components/moduleABI/manifest pins also match their output bytes. The independent audit and direct probe logs are retained in `module-coordination/rawlogs/XR-NUMERIC/`.

One later shared input has changed: E-NUMERIC pinned `compiled-frontend/build/pipeline.go` at 40,718 bytes / SHA-256 `78463101a450aec88cf2ecf8b7182fe2da432aab99885edd6304aeccab264c16`; the current file is 40,856 bytes / SHA-256 `5bc9207fbeb58f406bca9fc40ddf86269aab9667f8af798b3e40fd3a95889ba4`. This shared compiler input drift is already recorded as post-packet UTF-8 work in XR-ABI. I make no causal attribution here. The numeric-owned `fixtures/compiled/modulechild/app.go` and `app_test.go` still match their sealed E-NUMERIC pins, and all hash-pinned E-NUMERIC build outputs and evidence remain present and byte-correct. The review accepts the historical E-NUMERIC repair evidence without treating it as a fresh build from the current compiler source.

For clarity, the E-NUMERIC receipt does not declare an 83-record pin total: its four explicit arrays enumerate 69 records. This audit reports those category counts directly, plus the independently checked 140 actual build-output files and three sealed source-inventory entries, rather than asserting an undocumented total.

## Review limits

This decision accepts the bounded Go child Add/Reset repair and the hash-pinned emitted React/DOM boundary probes. It does not certify the later UTF-8 compiler changes, a fresh current-source full build, browser-mounted pair behavior, arbitrary counter step values, arbitrary Go modules, arbitrary numeric types, or other frontends. Root's final post-repair profile remains a separate acceptance gate.

## Pins and commands

- Author report SHA-256: `66d6452fee1406cf3fb43a846ef43178980c9ed1c21d618c90b2cdf852fefbe9`
- Author receipt SHA-256: `9aa1333372d0cfd191f4c080bbb60fc2521e8b630034c87cf7d05100d78e8644`
- Author seal and source inventory: `module-coordination/seals/E-NUMERIC/`
- Pin audit: `module-coordination/rawlogs/XR-NUMERIC/pin-audit.json`
- Fresh emitted boundary probes: `module-coordination/rawlogs/XR-NUMERIC/probe-index.json`
- Independent Go test: `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 ./fixtures/compiled/modulechild`
- Raw evidence index: `module-coordination/rawlogs/XR-NUMERIC/index.json`
