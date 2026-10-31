# XR-R-CI2-PROVENANCE — independent review of the provenance correction

**Decision: `accepted`**, for N2’s bounded `R-CI2-PROVENANCE` correction.

The corrected provenance is accurate. Read-only Git metadata for head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281` gives tree `ca99e9432dca87a6bf6718c20186b1223b870126` and direct parent `408e330517b1dd5e5f865e2ff1914465f98bcf66`. The retained completed-run metadata identifies PR #11’s base as `42df6883337605d901a23e9fed874768c7ce1824`. Thus the corrected labels distinguish the head’s parent from the PR base.

The preservation and hash chain check out. N5’s preserved producer report and receipt match the R packet’s recorded original hashes (`5b1118…dce7` and `b56f57…89b1`); N2’s preserved original raw evidence matches `e637db…dfa7`. The corrected report, receipt, and raw evidence match the hashes recorded by R (`c29bb7…d752`, `fd05c3…ab08`, and `816c79…8430`). The corrected receipt pins its current report and raw evidence, and R’s audit hash matches the audit file.

I compared the before/after content. The report has one changed line: the provenance sentence now names both direct parent and PR base. After removing only the parent/base fields and repinned hashes, the receipt’s remaining fields are equal. Reversing the two corrected provenance fields in raw evidence recreates the original JSON object exactly; all fields outside `workflowProvenance`, including trace payloads and totals, are unchanged. N5’s saved cross-check independently records the same head, tree, parent, and base.

This accepts only the provenance correction and its preservation chain. It does not rerun CI or the trace checker, and it does not broaden the original trace evidence. No application/compiler source, build, test, browser run, artifact download, workflow poll, network lookup, or Git mutation was performed during this review. Detailed evidence is in [`review.json`](../../audits/XR-R-CI2-PROVENANCE/review.json).
