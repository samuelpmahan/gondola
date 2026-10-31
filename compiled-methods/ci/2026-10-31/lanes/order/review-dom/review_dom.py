#!/usr/bin/env python3
"""Independent read-only review of the current primary DOM evidence packet."""

from __future__ import annotations

import hashlib
import json
import struct
import subprocess
import zipfile
from pathlib import Path
from typing import Any


SOURCE = "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
TREE = "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
RUN = 41169518187
JOB = 124444234335
ARTIFACT = 13030848292
FIXTURE_NAME = "compiled-value-method-composition-child-readonly-snapshot"
APP_ID = "github.com/samuelpmahan/gondola/fixtures/compiled/methods"
COUNTER_ID = "github.com/samuelpmahan/gondola/counter"
ATTEMPT_ID = "attempt-20261031T044100445Z"
EXPECTED_STATES = [
    (0, 0, False, 0), (0, 1, False, 0), (0, 2, False, 0),
    (0, 2, False, 2), (0, 3, False, 2), (2, 3, False, 2),
    (2, 0, False, 2), (2, 0, False, 2), (2, 1, False, 2),
    (2, 1, True, 2), (2, 1, True, 2), (2, 1, True, 2),
    (3, 1, True, 2), (3, 1, True, 1), (1, 1, True, 1),
    (1, 1, False, 1), (1, 2, False, 1), (0, 2, False, 1),
    (0, 2, False, 1),
]
ACTIONS = [
    ("1/1", "childAdd"), ("1/1", "childAdd"), ("4", "captureChild"),
    ("1/1", "childAdd"), ("5", "publishSaved"), ("1/2", "childReset"),
    ("1/2", None), ("1/1", "childAdd"), ("2", "toggleReadOnly"),
    ("1/1", None), ("1/2", None), ("0/1", "parentAdd"),
    ("4", "captureChild"), ("5", "publishSaved"), ("2", "toggleReadOnly"),
    ("1/1", "childAdd"), ("0/2", "parentReset"), ("0/2", None),
]
DISABLED_INDEXES = [6, 9, 10, 17]


class Review:
    def __init__(self) -> None:
        self.checks: list[dict[str, Any]] = []

    def check(self, name: str, ok: bool, detail: Any = None) -> None:
        row = {"name": name, "passed": bool(ok)}
        if detail is not None:
            row["detail"] = detail
        self.checks.append(row)

    @property
    def failed(self) -> list[dict[str, Any]]:
        return [c for c in self.checks if not c["passed"]]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    return sha(path.read_bytes())


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fields(value: dict[str, Any]) -> dict[str, Any]:
    return {entry["name"]: entry["value"] for entry in value.get("fields", [])}


def wire_number(value: dict[str, Any]) -> float:
    return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]


def wire_state(value: dict[str, Any]) -> tuple[Any, ...]:
    top = fields(value)
    parent = fields(top["Parent"])
    child = fields(top["Child"])
    return (wire_number(parent["Count"]), wire_number(child["Count"]),
            top["ReadOnly"]["bool"], wire_number(top["SavedChild"]))


def float_value(value: float) -> dict[str, Any]:
    return {"typeId": "float64", "kind": "float64",
            "float64Bits": struct.pack(">d", float(value)).hex()}


def go_state(state: tuple[Any, ...]) -> dict[str, Any]:
    parent, child, locked, saved = state
    return {
        "typeId": f"{APP_ID}.State", "kind": "struct", "fields": [
            {"name": "Parent", "value": {"typeId": f"{COUNTER_ID}.State", "kind": "struct",
                                              "fields": [{"name": "Count", "value": float_value(parent)}]}},
            {"name": "Child", "value": {"typeId": f"{COUNTER_ID}.State", "kind": "struct",
                                             "fields": [{"name": "Count", "value": float_value(child)}]}},
            {"name": "ReadOnly", "value": {"typeId": "bool", "kind": "bool", "bool": locked}},
            {"name": "SavedChild", "value": float_value(saved)},
        ]
    }


def txt(text: Any) -> dict[str, Any]:
    return {"kind": 2, "tag": "", "key": "", "attrs": None, "on": None,
            "kids": None, "text": str(text)}


def class_attr(value: str) -> dict[str, Any]:
    return {"name": "class", "value": value, "flag": False, "style": None}


def disabled_attr() -> dict[str, Any]:
    return {"name": "disabled", "value": "", "flag": True, "style": None}


def click(message: str) -> list[dict[str, str]]:
    return [{"event": "click", "message": message, "arg": ""}]


def el(tag: str, key: str, attrs: Any, handlers: Any, kids: list[dict[str, Any]]) -> dict[str, Any]:
    return {"kind": 1, "tag": tag, "key": key, "attrs": attrs, "on": handlers,
            "kids": kids, "text": ""}


def button(key: str, label: str, message: str, disabled: bool = False) -> dict[str, Any]:
    return el("button", key, [disabled_attr()] if disabled else None, click(message), [txt(label)])


def view_tree(state: tuple[Any, ...]) -> dict[str, Any]:
    parent, child, locked, saved = state
    return el("div", "methods", [class_attr("method-composition")], None, [
        el("div", "parent", [class_attr("parent-counter")], None, [
            el("p", "", None, None, [txt("Parent: "), txt(parent)]),
            button("parent-add", "Parent +", "parentAdd"),
            button("parent-reset", "Parent Reset", "parentReset", parent == 0),
        ]),
        el("div", "child", [class_attr("child-counter")], None, [
            el("p", "", None, None, [txt("Child: "), txt(child)]),
            button("child-add", "Child +", "childAdd", locked),
            button("child-reset", "Child Reset", "childReset", locked or child == 0),
        ]),
        button("readonly-toggle", "Unlock child" if locked else "Lock child", "toggleReadOnly"),
        el("p", "", None, None, [txt("Saved child: "), txt(saved)]),
        button("capture-child", "Capture child", "captureChild"),
        button("publish-saved", "Publish saved to parent", "publishSaved"),
    ])


def html_text(text: Any) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_html(node: dict[str, Any]) -> str:
    if node["kind"] == 2:
        return html_text(node["text"])
    attrs = "".join(f' {a["name"]}=""' if a["flag"] else
                    f' {a["name"]}="{html_text(a["value"]).replace(chr(34), "&quot;")}"'
                    for a in (node["attrs"] or []))
    return f'<{node["tag"]}{attrs}>' + "".join(render_html(k) for k in (node["kids"] or [])) + f'</{node["tag"]}>'


def controls(node: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    def visit(current: dict[str, Any], path: str) -> None:
        if current["kind"] != 1:
            return
        if current["tag"] == "button":
            result.append({"path": path, "key": current["key"], "tag": "button", "type": "submit",
                           "value": "", "checked": False,
                           "disabled": any(a["name"] == "disabled" for a in (current["attrs"] or []))})
        for i, kid in enumerate(current["kids"] or []):
            visit(kid, f"{path}/{i}" if path else str(i))
    visit(node, "")
    return result


def snapshot(state: tuple[Any, ...]) -> dict[str, Any]:
    tree = view_tree(state)
    return {"normalization": "outerHTML-v1", "html": render_html(tree), "controls": controls(tree)}


def check_trace(review: Review, name: str, trace: dict[str, Any], include_dom: bool) -> None:
    review.check(f"{name}.trace_header", trace.get("schema") == "gobi.trace/v1"
                 and trace.get("appId") == APP_ID and len(trace.get("ticks", [])) == 19)
    ticks = trace.get("ticks", [])
    if len(ticks) != 19:
        return
    dispatch_index = 0
    for tick_i, (tick, state) in enumerate(zip(ticks, EXPECTED_STATES)):
        review.check(f"{name}.tick_{tick_i}.index", tick.get("index") == tick_i)
        review.check(f"{name}.tick_{tick_i}.literal_state", tick.get("state") == go_state(state),
                     {"actualState": wire_state(tick["state"]), "expectedState": state})
        review.check(f"{name}.tick_{tick_i}.literal_view", tick.get("view", {}).get("tree") == view_tree(state))
        review.check(f"{name}.tick_{tick_i}.bindings_empty", tick.get("view", {}).get("bindings") == [])
        review.check(f"{name}.tick_{tick_i}.effects_empty", tick.get("requestedEffects") == []
                     and tick.get("completedEffects") == [])
        msg_name = None if tick_i == 0 else ACTIONS[tick_i - 1][1]
        msg = tick.get("message")
        if msg_name is None:
            msg_ok = msg is None
            dispatch_id = None
        else:
            dispatch_index += 1
            msg_ok = msg == {"name": msg_name, "arg": ""}
            dispatch_id = f"dispatch-{dispatch_index:04d}"
        review.check(f"{name}.tick_{tick_i}.message_and_id",
                     msg_ok and tick.get("dispatchId") == dispatch_id,
                     {"message": msg, "dispatchId": tick.get("dispatchId")})
        if include_dom:
            review.check(f"{name}.tick_{tick_i}.trace_dom", tick.get("dom") == snapshot(state))


def review_actions(review: Review, name: str, profile: dict[str, Any]) -> None:
    actions = profile.get("actions") or []
    review.check(f"{name}.action_count", len(actions) == 18)
    dispatch = 0
    for i, ((path, message), rec) in enumerate(zip(ACTIONS, actions)):
        disabled = message is None
        expected_action = {"path": path, "event": "click", "value": ""}
        expected_message = None if disabled else {"name": message, "arg": ""}
        target = rec.get("target") or {}
        physical_click = rec.get("physicalClick") or {}
        expected_id = None if disabled else f"dispatch-{dispatch + 1:04d}"
        state = EXPECTED_STATES[i + 1]
        review.check(f"{name}.action_{i}.intent_and_expected_message",
                     rec.get("actionIndex") == i and rec.get("action") == expected_action
                     and rec.get("expectedMessage") == expected_message)
        review.check(f"{name}.action_{i}.physical_target",
                     target.get("connected") is True and target.get("disabled") is disabled
                     and target.get("value") == "" and physical_click.get("method") == "HTMLElement.click"
                     and physical_click.get("attempted") is True
                     and (not disabled or (physical_click.get("disabled") is True
                                           and physical_click.get("traceTicksUnchanged") is True)))
        tick = rec.get("tick") or {}
        if disabled:
            observed = rec.get("observed")
            suppress = rec.get("suppressedDispatch") or {}
            event_ok = (observed is None and suppress.get("accepted") is True
                        and suppress.get("dispatchId") is None and suppress.get("error") is None
                        and tick.get("message") is None and tick.get("dispatchId") is None)
        else:
            dispatch += 1
            observed = rec.get("observed") or {}
            observed_message = observed.get("message") or {}
            event_ok = (observed.get("action") == expected_action
                        and observed_message == {"Name": message, "Arg": ""}
                        and observed.get("backend") == ("react" if name == "swap" and i % 2 == 0
                                                         else "dom" if name == "swap"
                                                         else name)
                        and rec.get("suppressedDispatch") is None
                        and tick.get("message") == expected_message
                        and tick.get("dispatchId") == expected_id)
        review.check(f"{name}.action_{i}.event_result", event_ok)
        review.check(f"{name}.action_{i}.post_state",
                     rec.get("tickIndex") == i + 1 and tick.get("state") == {
                         "parent": state[0], "child": state[1], "readOnly": state[2], "savedChild": state[3]})


def main() -> int:
    repo = Path.cwd()
    ci = repo / "compiled-methods/ci/2026-10-31"
    attempt_rel = Path("compiled-methods/artifacts/attempts") / ATTEMPT_ID
    attempt = ci / "extracted" / attempt_rel
    report_path = ci / "coordination/reports/E-CI-DOM.md"
    receipt_path = ci / "coordination/receipts/E-CI-DOM.json"
    metadata_path = ci / "primary-artifact-metadata.json"
    retention_path = ci / "artifact-retention.json"
    publication_path = ci / "publication-current.json"
    archive_path = ci / "original.zip"
    browser_path = attempt / "matrix/methods.browser.capture.json"
    native_path = attempt / "matrix/methods.native.json"
    direct_path = attempt / "matrix/methods.direct.json"

    review = Review()
    publication = load(publication_path)
    metadata = load(metadata_path)
    retention = load(retention_path)
    receipt = load(receipt_path)
    report_text = report_path.read_text(encoding="utf-8")
    own_primary = load(ci / "lanes/order/primary-provenance-audit.json")
    dom_result_path = ci / "lanes/dom/final/dom-oracle-primary.json"
    dom_result = load(dom_result_path)
    dom_audit_path = ci / "lanes/dom/final/primary-dom-audit.json"
    dom_audit = load(dom_audit_path)

    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
    review.check("provenance.current_head_tree", head == SOURCE and tree == TREE,
                 {"head": head, "tree": tree})
    review.check("provenance.publication", publication.get("sourceCommit") == SOURCE
                 and publication.get("sourceTree") == TREE and publication.get("primaryPush") == RUN)
    review.check("provenance.provider_metadata", metadata.get("id") == ARTIFACT
                 and metadata.get("size_in_bytes") == 11460089
                 and metadata.get("digest") == f"sha256:{retention['providerZipSha256']}"
                 and metadata.get("workflow_run", {}).get("id") == RUN
                 and metadata.get("workflow_run", {}).get("head_sha") == SOURCE)
    review.check("provenance.retention", retention.get("source") == SOURCE
                 and retention.get("sourceTree") == TREE and retention.get("run") == RUN
                 and retention.get("job") == JOB and retention.get("artifactId") == ARTIFACT
                 and retention.get("workflowOutcome") == "success")
    review.check("provenance.n6_independent_archive_audit", own_primary.get("status") == "passed"
                 and own_primary.get("artifact", {}).get("memberCount") == 968
                 and own_primary.get("artifact", {}).get("retentionMemberHashesVerified") == 968
                 and own_primary.get("artifact", {}).get("extractedMemberHashesVerified") == 968
                 and own_primary.get("source", {}).get("commit") == SOURCE
                 and own_primary.get("workflow", {}).get("runId") == RUN)
    review.check("provenance.dom_report_receipt", receipt.get("outcome") == "confirmed_reuse"
                 and receipt.get("primary_artifact", {}).get("run_id") == RUN
                 and receipt.get("primary_artifact", {}).get("job_id") == JOB
                 and receipt.get("primary_artifact", {}).get("artifact_id") == ARTIFACT
                 and sha_file(report_path) == receipt.get("report", {}).get("sha256"))
    review.check("provenance.dom_audit_digests", sha_file(ci / "lanes/dom/dom-oracle.mjs")
                 == receipt.get("independent_oracle", {}).get("sha256")
                 and sha_file(dom_result_path) == receipt.get("independent_oracle", {}).get("result_sha256")
                 and sha_file(ci / "lanes/dom/audit-primary.py") == receipt.get("primary_audit", {}).get("script_sha256")
                 and sha_file(dom_audit_path) == receipt.get("primary_audit", {}).get("result_sha256"))

    browser = load(browser_path)
    native = load(native_path)
    direct = load(direct_path)
    attempt_execution = load(attempt / "execution.json")
    run_manifest = load(attempt / "matrix/methods.run.json")
    review.check("raw.browser_identity", browser.get("schema") == "gobi.methods-browser-conformance/v1"
                 and browser.get("fixture") == FIXTURE_NAME and browser.get("appId") == APP_ID
                 and browser.get("packagePath") == APP_ID)
    review.check("raw.execution_match", attempt_execution.get("status") == "passed"
                 and attempt_execution.get("mode") == "full"
                 and attempt_execution.get("sourcePinsMatch") is True
                 and len(attempt_execution.get("sourceBefore", [])) == 137
                 and attempt_execution.get("sourceBefore") == attempt_execution.get("sourceAfter")
                 and attempt_execution.get("methodMatrix", {}).get("status") == "matched")
    review.check("raw.method_run_match", run_manifest.get("status") == "matched"
                 and run_manifest.get("sourceStable") is True
                 and run_manifest.get("sourceStableThroughCheck") is True
                 and run_manifest.get("outputsStableThroughCheck") is True)

    zip_hash = sha_file(archive_path)
    selected_member_paths = {
        "browser": attempt_rel.as_posix() + "/matrix/methods.browser.capture.json",
        "native": attempt_rel.as_posix() + "/matrix/methods.native.json",
        "direct": attempt_rel.as_posix() + "/matrix/methods.direct.json",
    }
    archive_member_pins = {}
    retained = {member["path"]: member for member in retention.get("members", [])}
    with zipfile.ZipFile(archive_path) as archive:
        review.check("provenance.zip_crc", archive.testzip() is None)
        review.check("provenance.zip_member_count", len(archive.infolist()) == 968)
        for label, member_path in selected_member_paths.items():
            data = archive.read(member_path)
            digest = sha(data)
            member_meta = retained.get(member_path, {})
            local = ci / "extracted" / member_path
            ok = (len(data) == member_meta.get("bytes") and digest == member_meta.get("sha256")
                  and local.is_file() and local.read_bytes() == data)
            review.check(f"provenance.{label}_archive_member", ok,
                         {"bytes": len(data), "sha256": digest})
            archive_member_pins[label] = {"path": member_path, "bytes": len(data), "sha256": digest}
    review.check("provenance.provider_zip_hash", zip_hash == retention.get("providerZipSha256")
                 and archive_path.stat().st_size == retention.get("providerZipBytes"))

    states = [dict(parent=p, child=c, readOnly=locked, savedChild=s) for p, c, locked, s in EXPECTED_STATES]
    for label, trace in (("native", native), ("direct", direct)):
        check_trace(review, label, trace, False)
    profiles = browser.get("profiles") or {}
    review.check("raw.profile_set", set(profiles) == {"react", "dom", "swap"}, sorted(profiles))
    profile_count = {}
    for name in ("react", "dom", "swap"):
        profile = profiles.get(name)
        if not profile:
            review.check(f"{name}.present", False)
            continue
        check_trace(review, name, profile.get("trace") or {}, True)
        for field in ("domOracle", "physicalDOMSnapshots"):
            records = profile.get(field) or []
            review.check(f"{name}.{field}.count", len(records) == 19)
            for tick_i, (record, state) in enumerate(zip(records, EXPECTED_STATES)):
                review.check(f"{name}.{field}.{tick_i}", record.get("tickIndex") == tick_i
                             and record.get("state") == states[tick_i]
                             and record.get("snapshot") == snapshot(state))
        review_actions(review, name, profile)
        review.check(f"{name}.page_errors_empty", profile.get("pageErrors") == [])
        profile_count[name] = {"actions": len(profile.get("actions", [])),
                               "oracleSnapshots": len(profile.get("domOracle", [])),
                               "physicalSnapshots": len(profile.get("physicalDOMSnapshots", [])),
                               "swaps": len(profile.get("swaps", []))}

    review.check("raw.swap_schedule", browser.get("swapTransitions") == [
        {"afterActionIndex": i, "to": "dom" if i % 2 == 0 else "react"} for i in range(18)])
    swaps = (profiles.get("swap") or {}).get("swaps") or []
    review.check("raw.swap_count", len(swaps) == 18)
    for i, swap_record in enumerate(swaps):
        post_state = EXPECTED_STATES[i + 1]
        expected_post = states[i + 1]
        for lane in ("oracle", "physical"):
            snap = (swap_record.get("newSnapshot") or {}).get(lane) or {}
            review.check(f"swap.{i}.{lane}", snap.get("tickIndex") == i + 1
                         and snap.get("state") == expected_post
                         and snap.get("snapshot") == snapshot(post_state))
    review.check("raw.all_trace_hashes_equal", len(set((browser.get("traceSha256") or {}).values())) == 1
                 and set((browser.get("traceSha256") or {}).keys()) == {"react", "dom", "swap"})

    expected = {
        "source": SOURCE, "sourceTree": TREE, "workflowRun": RUN, "jobId": JOB,
        "artifactId": ARTIFACT, "archiveSha256": zip_hash,
        "inputHashes": {"browser": sha_file(browser_path), "native": sha_file(native_path), "direct": sha_file(direct_path)},
        "domOracleSourceSha256": sha_file(ci / "lanes/dom/dom-oracle.mjs"),
        "domOracleResultSha256": sha_file(dom_result_path),
        "domPrimaryAuditSha256": sha_file(dom_audit_path),
        "domReportSha256": sha_file(report_path),
        "domReceiptSha256": sha_file(receipt_path),
        "fixtureSha256": sha_file(repo / "compiled-methods/conformance/fixtures/methods.json"),
        "fixtureDocSha256": sha_file(repo / "compiled-methods/FIXTURE.md"),
        "profileCounts": profile_count,
        "traceHashes": browser.get("traceSha256"),
        "disabledIndexes": DISABLED_INDEXES,
        "checksPassed": len(review.checks) - len(review.failed),
        "checksFailed": len(review.failed),
        "decision": "accepted" if not review.failed else "amend",
        "failedChecks": review.failed,
        "limitations": ["No callback dispatch or renderer lifetime acceptance claim; those belong to N6.",
                        "Current push primary only; no separate PR acceptance claim.",
                        "No manager/session/cancellation generalization."],
    }
    out = ci / "lanes/order/review-dom/review-dom-audit.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(expected, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({k: expected[k] for k in ("decision", "checksPassed", "checksFailed", "profileCounts",
                                                "disabledIndexes", "failedChecks", "traceHashes")}, indent=2))
    return 0 if not review.failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
