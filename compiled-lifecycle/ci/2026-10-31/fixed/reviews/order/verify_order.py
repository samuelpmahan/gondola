#!/usr/bin/env python3
"""Read-only independent audit of the pinned E-FIXED-ORDER artifact."""
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
CI = ROOT / "compiled-lifecycle/ci/2026-10-31"
MATRIX = CI / "fixed/extracted/compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix"
AUTHOR_REPORT = CI / "coordination/reports/E-FIXED-ORDER.md"
AUTHOR_RECEIPT = CI / "coordination/receipts/E-FIXED-ORDER.json"
AUTHOR_AUDIT = CI / "fixed/lanes/order/audit.json"
AUTHOR_SCRIPT = CI / "fixed/lanes/order/audit_order.py"
ZIP = Path("/tmp/gobi-compiled-lifecycle-41181505234.zip")

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def load(path):
    return json.loads(path.read_text())

def need(ok, message):
    if not ok:
        raise AssertionError(message)

class Buttons(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
    def handle_starttag(self, tag, attrs):
        if tag == "button":
            attrs = dict(attrs)
            self.items.append({"class": attrs.get("class", ""), "disabled": "disabled" in attrs})

need(digest(AUTHOR_REPORT) == "35138bb3d9aeb5d9ad8718246fe616b93ef5dfea800cfbd3aa4f4437cbe84dbc", "author report hash drift")
need(digest(AUTHOR_RECEIPT) == "aa3d237dc4620958477ea196b403be3f941ff0e5b6907cb54d493d086d6ac82e", "author receipt hash drift")
author = load(AUTHOR_RECEIPT)
author_audit = load(AUTHOR_AUDIT)
need(digest(AUTHOR_AUDIT) == author["review_sha256"], "author audit hash mismatch")
need(digest(AUTHOR_SCRIPT) == author["review_script_sha256"], "author audit script hash mismatch")
zip_sha = digest(ZIP)
need(ZIP.stat().st_size == 47072021 and zip_sha == "0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26", "original ZIP size/hash mismatch")
need(author["provider"]["zip_sha256"] == zip_sha, "author ZIP binding mismatch")

paths = {
    "native": MATRIX / "lifecycle.native.json",
    "direct": MATRIX / "lifecycle.direct.json",
    "browser": MATRIX / "lifecycle.browser.json",
    "browser_capture": MATRIX / "lifecycle.browser.capture.json",
    "check": MATRIX / "lifecycle.check.json",
    "run": MATRIX / "lifecycle.run.json",
    "manifest": MATRIX / "lifecycle.manifest.json",
}
raw_hashes = {name: digest(path) for name, path in paths.items()}
for name, h in raw_hashes.items():
    need(h == author_audit["evidence_references"][name]["sha256"], name + " artifact hash mismatch")
need(raw_hashes["browser"] == raw_hashes["browser_capture"], "browser capture hash mismatch")
native, direct, browser = (load(paths[x]) for x in ("native", "direct", "browser"))
check, run = load(paths["check"]), load(paths["run"])
need(check["status"] == "matched" and run["status"] == "matched", "run/check not matched")
need(len(run["summary"]["mutationControls"]) == 8 and all(x["detected"] for x in run["summary"]["mutationControls"]), "mutation controls incomplete")

steps = native["steps"]
expected_names = [
    "addParent", "addChild", "addGrandchild", "addSibling",
    "requestParent", "requestChild", "requestGrandchild", "requestSibling",
    None, "removeParent", "remountParent",
    "complete", "complete", "complete", "complete", "complete",
    "addParent", "addChild", "addGrandchild",
    "requestParent", "requestChild", "requestGrandchild",
    "complete", "complete", "complete", "complete",
]
need(len(steps) == 26 and [None if x["message"] is None else x["message"]["name"] for x in steps] == expected_names, "native event sequence differs")
need(steps[8]["state"] == steps[7]["state"] and steps[8]["view"] == steps[7]["view"], "native renderer swap changed state/View")

tokens = [
    "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
    "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7",
]
req_indexes = (4, 5, 6, 7, 19, 20, 21)
need([steps[i]["effects"][0] for i in req_indexes] == [
    {"kind": "fixture.request", "name": "lookup", "arg": t, "reply": "complete"} for t in tokens
], "request effect order/payload differs")
cancel_tokens = ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"]
need(steps[9]["effects"] == [
    {"kind": "lifecycle.cancel", "name": "cancel", "arg": t, "reply": ""} for t in cancel_tokens
], "cancellation order/payload differs")
removed, remounted = steps[9]["state"], steps[10]["state"]
need(all(not removed[n]["Alive"] and not removed[n]["Pending"] for n in ("Parent", "Child", "Grandchild")), "removed subtree still active")
need(removed["Sibling"]["Alive"] and removed["Sibling"]["Pending"] and removed["Sibling"]["Token"] == "sibling:g1:r4", "sibling did not survive pending")
need(all(remounted[n]["Alive"] and remounted[n]["Generation"] == 2 for n in ("Parent", "Child", "Grandchild")), "remount generation differs")
need(remounted["Sibling"] == removed["Sibling"], "sibling changed at remount")
for i in (11, 12, 13):
    need(steps[i]["state"] == remounted and steps[i]["view"] == steps[10]["view"] and steps[i]["effects"] == [], "stale Go message was not a no-op")
need(steps[14]["state"]["Sibling"]["Reply"] == "sibling:g1:r4" and not steps[14]["state"]["Sibling"]["Pending"], "valid sibling reply not accepted")
need(steps[15]["state"] == steps[14]["state"] and steps[15]["view"] == steps[14]["view"] and not steps[15]["effects"], "duplicate sibling reply not a no-op")
for i, n, t in ((22, "Grandchild", "grandchild:g2:r7"), (23, "Child", "child:g2:r6"), (24, "Parent", "parent:g2:r5")):
    need(steps[i]["state"][n]["Reply"] == t and not steps[i]["state"][n]["Pending"], "valid gen2 reply not accepted")
need(steps[25]["state"] == steps[24]["state"] and steps[25]["view"] == steps[24]["view"] and not steps[25]["effects"], "duplicate gen2 reply not a no-op")

core = ("index", "message", "dispatchId", "state", "requestedEffects", "completedEffects", "view")
dticks = direct["trace"]["ticks"]
need(len(dticks) == 26, "direct trace tick count differs")
projections = {}
action_boundary = {}
dom_counts, click_counts, detached_counts = {}, {}, {}
for name, p in browser["profiles"].items():
    bticks = p["trace"]["ticks"]
    need(len(bticks) == len(dticks), name + " trace length differs")
    projections[name] = all(all(a[k] == b[k] for k in core) for a, b in zip(dticks, bticks))
    need(projections[name], name + " core trace projection differs")
    action_boundary[name] = all(
        dticks[i]["action"] is None and bticks[i]["action"] == {"path": "", "event": "click", "value": ""}
        for i in (11, 12, 13, 15, 25)
    )
    need(action_boundary[name], name + " injected action metadata boundary differs")
    need(len(p["snapshots"]) == 27, name + " snapshot count differs")
    for snap in p["snapshots"]:
        physical = snap["physicalDOM"]
        need(physical == snap["expectedDOM"], name + " physical DOM differs from expected at snapshot " + str(snap["eventIndex"]))
        parser = Buttons()
        parser.feed(physical["html"])
        controls = physical["controls"]
        need(len(parser.items) == len(controls), name + " live button count differs")
        need(all(b["disabled"] == c["disabled"] for b, c in zip(parser.items, controls)), name + " live disabled property/HTML mismatch")
    need(len(p["actions"]) == 16, name + " physical action count differs")
    need(all(a["attempted"] and a["target"]["connected"] and not a["target"]["disabled"] for a in p["actions"]), name + " ordinary physical click target invalid")
    stale = p["stalePhysicalClicks"]
    need(len(stale) == 1 and len(stale[0]["attempts"]) == 6, name + " detached click count differs")
    need(stale[0]["before"] == stale[0]["after"], name + " detached clicks changed captured state/DOM/effects")
    need(all(x["targetBefore"]["connected"] is False and x["targetConnectedAfter"] is False for x in stale[0]["attempts"]), name + " detached click target connected")
    need(not p["pendingAtEnd"], name + " pending work at end")
    u = p["unmount"]
    need(u["physicalDOM"] == {"html": "", "controls": 0} and not u["pendingBefore"], name + " unmount not drained/empty")
    need(u["traceBefore"] == u["traceAfter"] and u["effectRecordsBefore"] == u["effectRecordsAfter"], name + " unmount changed trace/effects")
    need(len(p["probes"]) == 5 and all(x["result"]["accepted"] is False for x in p["probes"]), name + " accepted retired/duplicate probe")
    dom_counts[name] = 27
    click_counts[name] = len(p["actions"])
    detached_counts[name] = len(stale[0]["attempts"])

sw = browser["profiles"]["swap"]
need(len(sw["swaps"]) == 17 and len(sw["rendererSequence"]) == 18, "swap/renderer count differs")
fixed = [s for s in sw["swaps"] if s["reason"] == "fixture-renderer-swap-8"]
need(len(fixed) == 1, "fixed renderer swap missing")
fixed = fixed[0]
need(len(fixed["before"]["pending"]) == 4 and fixed["before"]["pending"] == fixed["after"]["pending"], "pending correlations not preserved across fixed swap")
need(fixed["before"]["effectRecords"] == fixed["after"]["effectRecords"] and fixed["before"]["trace"] == fixed["after"]["trace"], "fixed swap changed effects/trace")
need(fixed["before"]["snapshot"]["state"] == fixed["after"]["snapshot"]["state"] and fixed["before"]["snapshot"]["view"] == fixed["after"]["snapshot"]["view"], "fixed swap changed state/View")
eligible = [s["after"]["retiredCallbacks"] for s in sw["swaps"] if s["after"]["retiredCallbacks"]["eligible"]]
ineligible = [s["after"]["retiredCallbacks"] for s in sw["swaps"] if not s["after"]["retiredCallbacks"]["eligible"]]
need(len(eligible) == 16 and len(ineligible) == 1, "eligible swap count differs")
need(all(not r["dispatch"]["accepted"] and r["dispatch"]["stale"] and not r["stale"]["accepted"] and r["stale"]["stale"] for r in eligible), "eligible swap failed to fence both callbacks")
fences = sw["swaps"][-1]["after"]["diagnostics"]["fencedCallbacks"]
fenced_calls = 2 * len(eligible)
need(fenced_calls == 32, "per-swap callback fence outcomes differ")
need(sw["callbackCounts"] == {"dispatch": 32, "stale": 16}, "callback invocation counts differ")

need(author["schedule_boundary"]["stale_generation_one_messages_before_generation_two_requests"] is True, "schedule boundary not pinned")
need(author_audit["schedule_boundary"]["fresh_generation_two_requests_pending_during_stale_messages"] is False, "fixed schedule limit not pinned")

summary = (
    "Accepted the ordered lifecycle/effect and renderer-fence evidence from the exact successful primary artifact. "
    "The 26-event native/direct/browser projection preserves seven requests, G/C/P cancellation order, sibling pending work, "
    "stale and duplicate Go no-ops, 27 physical snapshots per profile, 18 inert detached clicks, 16 eligible swap fences "
    "(32 rejected callback invocations), and clean drained unmounts. Action metadata remains excluded from canonical parity; "
    "old Go replies precede generation-two requests in this script."
)
review = {
    "schema": "gobi.compiled-lifecycle-ci-independent-review/v1",
    "job_id": "XR-FIXED-ORDER",
    "worker": "N4",
    "decision": "accepted",
    "outcome": "confirmed_reuse",
    "summary": summary,
    "provider": {"artifact_id": 13035044166, "run_id": 41181505234, "zip_bytes": ZIP.stat().st_size, "zip_sha256": zip_sha,
                 "source_commit": "00da54ad0f5a4006b13a5cded18ce291845978bc", "source_tree": "51b64a89b5f7e0edd4792becbed9adad6a27a698"},
    "author_packet": {"report_sha256": digest(AUTHOR_REPORT), "receipt_sha256": digest(AUTHOR_RECEIPT),
                      "review_sha256": digest(AUTHOR_AUDIT), "review_script_sha256": digest(AUTHOR_SCRIPT)},
    "raw_evidence_sha256": raw_hashes,
    "conformance": {"events": 26, "ticks": 26, "requests": 7, "cancellations": 3,
                    "cancellation_order": cancel_tokens, "mutation_controls_detected": 8},
    "browser": {"profiles": list(browser["profiles"]), "core_projection_fields": list(core),
                "core_projection_matches": projections, "action_metadata_included": False,
                "action_metadata_boundary_verified": action_boundary, "physical_snapshots_per_profile": dom_counts,
                "physical_clicks_per_profile": click_counts, "detached_clicks_per_profile": detached_counts,
                "swap_count": 17, "eligible_swaps": 16, "ineligible_swaps": 1, "fenced_callback_invocations": fenced_calls,
                "final_diagnostic_fence_entries": len(fences),
                "unmount_clean_after_drain": True},
    "limits": [
        "Canonical direct/browser projection excludes injected Go-message action metadata; no full byte-identical trace claim.",
        "Old generation-one Go replies precede generation-two requests in this fixed script; active-pending old-reply behavior is separate evidence.",
        "The extraction-only unmanifested temporary file was excluded; the original provider ZIP and manifest-pinned matrix records were used."
    ]
}
out = HERE / "review.json"
out.write_text(json.dumps(review, indent=2, sort_keys=True) + "\n")
print(json.dumps({"decision": "accepted", "outcome": "confirmed_reuse", "review": str(out.relative_to(ROOT)),
                  "review_sha256": digest(out), "raw_hashes": raw_hashes,
                  "profiles": list(browser["profiles"]), "physical_snapshots": sum(dom_counts.values()),
                  "detached_clicks": sum(detached_counts.values()), "eligible_swaps": len(eligible),
                  "fenced_callback_invocations": fenced_calls, "final_diagnostic_fence_entries": len(fences)}, sort_keys=True))

