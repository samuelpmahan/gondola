# E-ORACLE (N5): independent backend qualification oracle

**Outcome: `mixed_change`.** Added the independent 13-case qualification plan and oracle policy tests, then exercised the Go certificate CLI against N4's actual mounted Node 22 capture. The case expectations are not copied from a mutant run and this packet does not claim that the full qualification delivery or PR17 CI passed.

## Independent case plan

[`plan.json`](../../oracle/plan.json) has schema `gobi.backend-qualification-oracle-plan/v1` and SHA-256 `182fee4d72c2a6492c648591d3fe984fe01cf0d5f5555fd5efa910be2beaf156`. It pins the existing publications scenario and independent literal oracle by hash, and fixes the 13 cases: healthy React, DOM, and swap; then each of five renderer/event fault families on React and DOM.

The healthy cases use all 50 source events, 45 Go updates, and 46 trace checkpoints. Initial-render faults activate once before any source event and compare with the literal initial projection. Drop/duplicate click faults activate once on event 0 at path `1/0/1`, comparing against the literal first-action projection. The independent disabled-control witness always reads baseline path `0/1`.

| Fault family | Required channels | Allowed channels | Rule |
|---|---|---|---|
| Text corruption | `dom` | `dom` | all |
| Key order | `dom` | `dom` | all |
| Enabled control | `disabled` | `disabled`, `dom` | all |
| Drop click | `dispatch-count`, `trace-count`, `state` | those plus `dom` | any |
| Duplicate click | `dispatch-count` | `dispatch-count`, `trace-count`, `state`, `dom` | all |

Every fault case must activate exactly once; page and infrastructure errors disqualify it; generic exceptions alone do not count as detection. Extra changed channels are accepted only where the family allows them.

## Verification

The actual mounted positive input is N4's Node 22 run at `/tmp/gobi-backend-qualification-E-HARNESS-node22/qualification.raw.json` (SHA-256 `4222a32d73fde4e9fa31e534ebad7ab61fae8337f6cff7e0b2c9b05486586bcf`). It contains all 13 case evidence files and reports three healthy 50/46 traces, one activation per fault, and no page or infrastructure errors. N5 did not produce or alter the browser capture.

`node --test backend-qualification/oracle/oracle.test.mjs` passed 15/15 checks with that actual report supplied through `GOBI_QUALIFICATION_RAW_REPORT`. The Go CLI accepted the unmodified mounted report, then rejected five copied negative controls: missing case, duplicate case, removed activation record, generic-error-only evidence, and empty semantic-channel evidence. The controls were made only in temporary copies; mutated evidence hashes were recomputed so rejection tests reached classification validation.

`GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test -count=1 ./backendqualification ./cmd/backend-qualification` passed after N1 and N2 corrected their owned unit tests. The initial red run is preserved at `rawlogs/E-ORACLE/go-package-tests.log`; it found N1's synthetic text-corruption fixture reported an unauthorized `trace-count` channel and N2's `--help` test observed usage on stderr. The corrected rerun is preserved separately at `rawlogs/E-ORACLE/go-package-tests-final.log`. No E-ORACLE test or source change was made outside `backend-qualification/oracle/**`.

Node was `v22.23.4`; Go was `go1.24.0 linux/amd64`. Raw command output, versions, capture provenance, and hashes are recorded under [`rawlogs/E-ORACLE`](../rawlogs/E-ORACLE).

## Boundaries

This verifies the independent plan and Go certificate classifications against one real N4 mounted capture. It is not a fresh N6 end-to-end run, a full inherited regression run, or a PR17 CI result. PR17 base `5662efcd7feb7920e4690d38cc76a297fed69d5a` remains the qualification base. Root separately identified an E-BUILD provenance issue in the recorded base-commit reference; that is outside this oracle packet and requires its own scoped repair. No production behavior, Go application, build, harness, scheduler, or Git state was changed by N5.
