# XR-RELOCATE — independent review of the loader relocation repair

**Reviewer:** N4  
**Job:** XR-RELOCATE  
**Decision:** **ACCEPTED**  
**Qualification:** focused relocation repair accepted; a new clean source-bound build and N5 consumer acceptance remain pending.

## Review result

The sealed E-RELOCATE packet matches its seal, and all ten author-indexed rawlog files rehash successfully. The six current loader/admission/test closure files match the sealed source inventory. The repaired loader and new relocation test are pinned at `bd747b532d86a14bcc6bcad76df62820d717a54e52ec6cd97b0f1106c667277a` and `2120940c6696a8a3b77074456a65fbf6fe3403bd3f99e2f332a5ddac664af620`, respectively.

The code keeps recorded compiler metadata canonical and internally anchored: `repositoryRoot`, `compilerWorkingDirectory`, `outputRoot`, `goScriptTempRoot`, and `helperCommentBase` must be canonical absolute paths; the compiler working directory and helper comment base must resolve under the recorded repository root. This permits relocation while preserving the original command context. Source pin reads and the keyed fixture source read use the loader's physical `ROOT`; emitted GoScript sources, compiler outputs, descriptors, and other build artifacts are read from the supplied build-index directory. The repaired path does not fall back to the old checkout. The existing generated-comment normalization, source hashes, BuildResult/raw artifact, ABI, effect descriptor, command evidence, and native boundary gates remain present.

## Independent verification

Node `v22.23.4` ran the focused path-normalization and relocation tests: **5 passed, 0 failed, 0 skipped**. This includes the copied-source load with original-checkout reads blocked, source/context/artifact tamper rejection, and browser-bundle smoke. The loaded F6 matrix contains four actual builds (React/DOM × parent/child), two backend profiles, eight module/encoder role objects, two closed effect descriptors, four effect observations per backend, and ten native boundary cases per backend. The phrase “eight role objects” describes module/encoder objects; it is not a count of full scenario captures.

As an additional reviewer probe, I ran all **eight actual direct scenario profiles** (four scenarios × React/DOM) through the relocated loader. Their **356 events** independently passed `assertNativeModuleEffectsCapture`; each entire capture matched the frozen validated direct capture after removing only `modulePins`, which identify the different F6 artifacts. Each generated capture's module pins matched the loaded candidate build. The loader made **zero** original-checkout read attempts. The original F6 archive, manifest, and archived build index still match their recorded hashes; the temporary test index differs only in the loader self-pin.

The frozen E-HISTORY attempt `attempt-20261101T035413961Z-2-55fe7cd9` independently records four matched native scenarios and 20 matched profile captures, including browser profiles. I did not rerun browser profiles against the relocated candidate artifacts. The previous combined five-profile reviewer probe mixed direct captures from the F6-derived candidate with browser captures tied to a different build identity; the oracle rejected the differing `modulePins` before parity comparison. That was an invalid cross-artifact join, not a loader mismatch, and is preserved in the rawlogs.

## Acceptance boundary

This review accepts the focused loader relocation repair and its copied-source/tamper checks. It does not claim the F6 archive or its index is source-bound to the repaired loader: their old loader pin remains unchanged, while only a temporary copied index was updated for testing. A fresh clean build from the repaired source, followed by the new archive's full profile/browser consumer gate, remains required. No compiler rebuild, Go command, production edit, Git mutation, scheduler mutation, or archive/index mutation was made by this review.

## Evidence

The author packet verification, source pins, exact commands, focused test output, eight-profile direct replay, frozen baseline summary, and the explicitly classified cross-artifact probe are indexed in `rawlogs/XR-RELOCATE/index.json` (17 files; SHA-256 `2dbc562abf3f91c9ffa75016338332c91efa91a8007b7f18e7ca03f89c64b184).
