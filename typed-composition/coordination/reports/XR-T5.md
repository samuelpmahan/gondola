# XR-T5 — independent review of the typed-composition oracle and browser fixture

## Decision

**Amend.** The clean fixed preflight has complete, internally consistent evidence for its stated fixed scripts, but the seeded checker does not fail closed on disabled-input witnesses or several important observation channels. The disabled branch also proves direct Go rejection, not suppression of a browser-delivered native event.

## Reviewed

Read typed-composition/DESIGN.md, coordination/WIRE.md, coordination/reviews/XR-T5.diff, coordination/reports/T5.md, the clean fixed report at build/t5-final-fixed-report.json, and current fixture.mjs, check.mjs, and check.test.mjs. I did not run the default seeded proof or repeat the fixed browser/native replay.

## Confirmed behavior and evidence

- Native, independent-model, and browser traces compare full operation frames: exact tree, live-session snapshots (including state, rendered tree, bindings, and ordered messages), and drained changes. The browser actor also captures manager and host snapshots, actual DOM/control properties, audits, effects, lifecycle, and dirty IDs. The checker compares the candidate and reference projections against native frames.
- Enabled dispatch steps resolve the current snapshot path/key to a mounted DOM element. Inputs assign the requested value to the actual single-line input, dispatch a bubbling InputEvent, and capture its effective value and the manager's Step.Value. Clicks use element.click().
- The focus replacement path samples live keyed focus and selection synchronously after replace() returns and again after settling. The fixed artifact contains the expected backward, noncollapsed selection witness.
- The disposal/recreation probe retains the old transport callback, disposes the old Go tree, mounts fresh IDs, then invokes the old callback. It checks zero actual Go Complete calls and unchanged fresh manager/DOM state and dirty IDs.
- The fixed report hash matches T5's recorded SHA-256 b670659675a44a9551309288bf3d5081207f3edaecd852b9352132e53941cc8c. Its three fixed-script shards have matching SHA-256 entries, closed native input envelopes, and one complete native tree/session/changes frame per action. The report pins 49 source/build entries. This is fixed-only evidence and does not claim the default seeded proof.

## Findings requiring amendment

1. **Read-only input witnesses are not recorded, and the disabled path is not a native-event test.** In fixture.mjs, the disabled-element branch sets disabledStepProbe and directly calls manager.dispatch, then returns before setting inputWitnessObservation or sampling the physical value. check.mjs nevertheless requires an inputWitnessObservation for every requested/effective witness. A seeded multiline edit while read-only therefore becomes a missing witness on both actors, matching the separate F-RUN diagnostic. Also, direct manager.dispatch proves Go rejects the Step; it does not prove that a real click/input event on a disabled native control invokes no handler. Add a blocked-input observation that checks physical value and Go state remain unchanged, and separately exercise a native disabled .click() with zero handler calls. Keep the direct Go guard probe explicitly labeled as such.

2. **The required focus witness is optional to the validator.** validateScenario validates candidate.focusReplacement only when it is truthy. In the clean fixed scenario, removing that witness at the input/replacement action (index 12) still yields zero validator issues. The artifact contains a good witness, but an absent witness channel would not fail the proof.

3. **Transport logs are compared only for candidate/reference parity.** The checker does not require managerEffects or transportCalls to exist and does not match actual start/cancel invocations against the effect commands. In an offline mutation, deleting both channels from both actors, or reversing both actors' event arrays, still yields zero issues. The current artifact captures the start event, but a shared host bug that omits or reorders the same transport operation on both sides can pass. Require these channels and validate the actual ordered calls against the manager-provided effects and disposal bundles.

4. **Error results are normalized to an error bit.** compareResult discards error text by mapping every {error:string} to {outcome:\"error\"}. Changing the native wrong-parent SetChildInputs error message in the fixed shard still yields zero validator issues. The replay wire preserves exact error frames, and the author report describes full operation-result comparison; compare error results exactly, or document and separately validate the intentionally weaker contract.

The bounded offline probe is preserved at coordination/reviews/xr_t5_fail_closed_probe.mjs. It confirmed the baseline fixed shard has zero issues and reproduced the missing-focus, missing-transport, same-wrong-order-transport, and altered-error-text blind spots with zero issues each. It reads only preserved artifacts and does not launch the browser or native replay.

## Verification boundary

This is source review plus bounded mutation of preserved fixed evidence. The default seeded F-RUN remains separate and was not rerun or claimed here. No production source was changed.
