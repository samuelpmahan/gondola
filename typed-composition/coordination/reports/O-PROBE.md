# O-PROBE — independent offline oracle mutation probe

## Result

**Outcome: supported.** The repaired checker accepted a complete positive 14-action scenario with zero issues and rejected every required mutation. The error-text-only mutation remained accepted, as specified by ORACLE-REPAIR. This probe did not run the default replay or the inherited runner and does not claim overall milestone acceptance.

## Frozen inputs

The executed checker was check.mjs, and the positive self-contained JSON was materialized from testdata/check-positive-scenario.mjs. O-PROBE does not execute fixture.mjs or check.test.mjs; their hashes below are contextual source captures only. The scenario was saved at coordination/reviews/O-PROBE-positive.json.

| Source | Role | SHA-256 |
| --- | --- | --- |
| check.mjs | Executed validator | fea6e333b301a010fab306475b2d9b5eae8c2b918b8defa4045c8384b8f1d422 |
| testdata/check-positive-scenario.mjs | Executed to materialize input JSON | 9012ba366e959cecd8791c25c1f35267f9dd822394427cb219af8b094b163174 |
| fixture.mjs | Context only; not executed by offline probe | 21604cc888b704b2d36b2683d27e301b5b0bfe9994577872af63cf73e7134c60 |
| check.test.mjs | Context only; not executed by offline probe | ea153f9dc5b2b6a9a70a9ffec13786434c6e48490e95c9b9349ed8c293a6dc76 |

The positive scenario hash is b29e07a478aac020504b22ce9e6b1b4aedfbbacaf592b1051be3e01f5344861c. It includes the first enabled input and renderer replacement, a blocked-disabled LF witness with separate direct guard evidence, two pending starts and a two-cancel disposal, and a wrong-parent rejection.

The first probe draft searched for a top-level transport event ID, while the fixture event stores it under payload.ID. That probe attempt stopped before running mutations; the review probe was corrected and syntax-checked. The fixture hash in results records the contextual snapshot at probe time. N5 later made a producer-only hostGeneration metadata correction; it does not alter the executed checker, helper, or positive JSON, so the offline mutation results remain bound to their unchanged hashes. The final integrated browser/native replay will bind the converged fixture.

## Probe command and result

Materialized and checked the scenario with:

    node --input-type=module -e 'import {positiveScenarioJSON} from "./typed-composition/testdata/check-positive-scenario.mjs"; process.stdout.write(positiveScenarioJSON())' > typed-composition/coordination/reviews/O-PROBE-positive.json
    node typed-composition/coordination/reviews/O-PROBE.mjs typed-composition/coordination/reviews/O-PROBE-positive.json > typed-composition/coordination/reviews/O-PROBE-results.json

The baseline passed with 0 issues across 14 actions. Mutation results:

| Mutation | Action index | Result |
| --- | ---: | --- |
| Remove required candidate focus witness at first enabled input | 4 | Rejected: focus.replacement.missing |
| Remove managerEffects and transportCalls from both actors | 6 | Rejected: missing channels and inconsistent clock/effect evidence |
| Reverse both actors' cancellation event arrays | 13 | Rejected: event sequence and cancel order |
| Omit a manager-command transport execution on both actors | 6 | Rejected: clock delta and command-count mismatch |
| Change rejected candidate operation to success | 12 | Rejected: native/candidate outcome mismatch |
| Change blocked-input afterValue and set nativeDispatches to 1 | 11 | Rejected: blocked physical value and dispatch-count mismatch |
| Change only the human-readable error text | 12 | Accepted by scope; 0 issues |

The full machine-readable result, selected action details, mismatch fields, baseline hash, and source pins are preserved in coordination/reviews/O-PROBE-results.json (SHA-256 a411edc520839f90618a9b8a65e6d4fc4b9ca47867f76b8cf30c2563881e6895). The probe itself is coordination/reviews/O-PROBE.mjs (SHA-256 76d1107b5a91a73e4a564045741b6ff3eee6dec23551eb8c5f3210be456b3c8c).

The earlier XR-T5 probe was left unchanged; its SHA-256 remains b4a17c132722b0d09a52b087f2a47e0b4896e5ff4dd87e5032244d12f695844b.

## Scope

This is bounded offline checker evidence against the recorded checker/helper hashes and a synthetic positive scenario. The earlier F-RUN's 12 blocked-LF witness findings remain preserved in F-RUN.md and its raw artifacts; this probe exercises the repaired blocked-observation channel without rerunning that replay. The independent browser probe is recorded separately as O-BROWSER. The default seeded replay and inherited runner remain root-owned gates.
