#!/usr/bin/env python3
"""Read-only streaming verification of CI2 publication and retained artifact delivery."""
import hashlib
import json
import tarfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

HERE = Path(__file__).resolve().parent
CI_ROOT = HERE.parents[1]
PROVIDER = CI_ROOT / "provider"
source = json.loads((HERE / "source-refresh.json").read_text())
completed = json.loads((PROVIDER / "repaired-completed.json").read_text())
archive_meta = json.loads((PROVIDER / "repaired-archive.json").read_text())
manifest_path = PROVIDER / "repaired-extracted" / "extraction-manifest.json"
manifest_bytes = manifest_path.read_bytes()
manifest = json.loads(manifest_bytes)
execution_path = PROVIDER / "repaired-extracted" / "compiled-frontend" / "artifacts" / "execution.json"
execution_bytes = execution_path.read_bytes()
execution = json.loads(execution_bytes)

run = completed["run"]
artifact = completed["artifacts"]["artifacts"][0]
source_head = source["head"]
pr = source["pr"]
pr_base = source["pr_base"]
merge = source["synthetic_merge"]
provider_run_id = int(archive_meta["runId"])
provider_artifact_id = int(archive_meta["artifactId"])

errors = []
def check(name, condition, observed=None):
    if not condition:
        errors.append({"check": name, "observed": observed})

check("pr-head-matches-run-head", pr["head"]["sha"] == run["head_sha"] == source_head["sha"], [pr["head"]["sha"], run["head_sha"], source_head["sha"]])
check("source-tree-matches-refreshed-git-data", source_head["tree_sha"] == "ca99e9432dca87a6bf6718c20186b1223b870126", source_head["tree_sha"])
check("source-parent-is-408e330", source_head["parents"] == ["408e330517b1dd5e5f865e2ff1914465f98bcf66"], source_head["parents"])
check("pr-base-matches-42df", pr["base"]["sha"] == pr_base["sha"] == "42df6883337605d901a23e9fed874768c7ce1824", [pr["base"]["sha"], pr_base["sha"]])
check("synthetic-merge-tree-matches-source", merge["tree_sha"] == source_head["tree_sha"], [merge["tree_sha"], source_head["tree_sha"]])
check("synthetic-merge-parents-are-base-and-head", merge["parents"] == [pr_base["sha"], source_head["sha"]], merge["parents"])
check("pr-is-unmerged", pr["merged"] is False and pr["state"] == "open", {"state": pr["state"], "merged": pr["merged"]})
check("run-is-successful-pull-request-attempt", run["id"] == 41144116537 and run["status"] == "completed" and run["conclusion"] == "success" and run["event"] == "pull_request" and run["run_attempt"] == 1, {k: run.get(k) for k in ("id", "status", "conclusion", "event", "run_attempt")})
check("artifact-api-row-binds-run-and-head", artifact["id"] == 13020568606 and artifact["workflow_run"]["id"] == run["id"] and artifact["workflow_run"]["head_sha"] == run["head_sha"], {"artifact": artifact["id"], "workflow_run": artifact["workflow_run"]})
check("archive-metadata-binds-run-artifact-head", provider_run_id == run["id"] and provider_artifact_id == artifact["id"] and archive_meta["sourceHead"] == run["head_sha"], {"run": provider_run_id, "artifact": provider_artifact_id, "head": archive_meta["sourceHead"]})
check("artifact-is-not-expired", artifact["expired"] is False, artifact.get("expired"))
expires_at = datetime.fromisoformat(artifact["expires_at"].replace("Z", "+00:00"))
observed_at = datetime.fromisoformat(source["observed_at_utc"].replace(" UTC", "+00:00").replace(" ", "T"))
check("artifact-expiry-is-after-source-refresh", expires_at > observed_at, {"expires_at": artifact["expires_at"], "observed_at": source["observed_at_utc"]})

run_zip = PROVIDER / "downloads" / "run-41144116537.zip"
zip_hash = hashlib.sha256()
zip_bytes = 0
with run_zip.open("rb") as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b""):
        zip_hash.update(chunk)
        zip_bytes += len(chunk)
expected_zip_sha = archive_meta["originalZipSha256"]
check("workflow-zip-size-matches-artifact-api", zip_bytes == artifact["size_in_bytes"], {"observed": zip_bytes, "expected": artifact["size_in_bytes"]})
check("workflow-zip-digest-matches-artifact-and-manifest", zip_hash.hexdigest() == expected_zip_sha == artifact["digest"].removeprefix("sha256:") == manifest["archiveSha256"], [zip_hash.hexdigest(), expected_zip_sha, artifact["digest"], manifest["archiveSha256"]])

check("execution-receipt-passed", execution["status"] == "passed" and execution.get("error") is None, {"status": execution["status"], "error": execution.get("error")})
check("execution-commands-all-exit-zero", bool(execution["commands"]) and all(c["exitCode"] == 0 for c in execution["commands"]), [{"name": c["name"], "exitCode": c["exitCode"]} for c in execution["commands"] if c["exitCode"] != 0])
check("source-pins-stable", len(execution["sourceBefore"]) == len(execution["sourceAfter"]) == 116 and execution["sourceBefore"] == execution["sourceAfter"], [len(execution["sourceBefore"]), len(execution["sourceAfter"])])
profiles = execution["apps"]
check("five-matched-profiles-43-ticks", len(profiles) == 5 and all(p["status"] == "matched" for p in profiles) and sum(p["ticks"] for p in profiles) == 43 and execution.get("mismatches") == 0, [{"fixture": p["fixture"], "status": p["status"], "ticks": p["ticks"]} for p in profiles])
node_log_path = PROVIDER / "repaired-extracted" / "compiled-frontend" / "artifacts" / "logs" / "node-tests.stdout.log"
node_log = node_log_path.read_text()
node_tests_ok = "# tests 81" in node_log and "# pass 81" in node_log and "# fail 0" in node_log
check("node-tests-log-is-81-of-81", node_tests_ok, {"path": str(node_log_path.relative_to(CI_ROOT)), "has_81_tests": "# tests 81" in node_log, "has_81_passes": "# pass 81" in node_log, "has_zero_failures": "# fail 0" in node_log})

archive_path = PROVIDER / archive_meta["archive"]
archive_hash = hashlib.sha256()
archive_size = 0
with archive_path.open("rb") as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b""):
        archive_hash.update(chunk)
        archive_size += len(chunk)
check("retained-delivery-archive-size", archive_size == archive_meta["bytes"], {"observed": archive_size, "expected": archive_meta["bytes"]})
check("retained-delivery-archive-sha256", archive_hash.hexdigest() == archive_meta["sha256"], {"observed": archive_hash.hexdigest(), "expected": archive_meta["sha256"]})

expected_files = {e["path"]: e for e in manifest["compilerFiles"] + manifest["inheritedReports"]}
check("manifest-selection-counts", len(manifest["compilerFiles"]) == 309 and len(manifest["inheritedReports"]) == 4 and archive_meta["files"] == 314, {"compiler": len(manifest["compilerFiles"]), "inherited": len(manifest["inheritedReports"]), "archiveFiles": archive_meta["files"]})
verified = {}
extras = []
manifest_member = None
actual_files = 0
with tarfile.open(archive_path, mode="r|xz") as tf:
    for member in tf:
        if member.isdir():
            continue
        if not member.isfile():
            extras.append({"path": member.name, "reason": "non-file member"})
            continue
        actual_files += 1
        name = PurePosixPath(member.name).as_posix()
        for prefix in ("provider/repaired-extracted/", "repaired-extracted/"):
            if name.startswith(prefix):
                name = name[len(prefix):]
        stream = tf.extractfile(member)
        if stream is None:
            extras.append({"path": member.name, "reason": "unreadable member"})
            continue
        h = hashlib.sha256()
        size = 0
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
            size += len(chunk)
        digest = h.hexdigest()
        if name in expected_files:
            expected = expected_files[name]
            verified[name] = {"bytes": size, "sha256": digest}
            if size != expected["bytes"] or digest != expected["sha256"]:
                extras.append({"path": name, "expected_bytes": expected["bytes"], "actual_bytes": size, "expected_sha256": expected["sha256"], "actual_sha256": digest})
        elif name in ("extraction-manifest.json", "manifest/extraction-manifest.json"):
            manifest_member = {"path": member.name, "bytes": size, "sha256": digest, "matches_local": size == len(manifest_bytes) and digest == hashlib.sha256(manifest_bytes).hexdigest()}
            if not manifest_member["matches_local"]:
                extras.append({"path": member.name, "reason": "manifest differs from immutable extraction manifest"})
        else:
            extras.append({"path": member.name, "reason": "unexpected member"})

missing = sorted(set(expected_files) - set(verified))
check("retained-tar-member-count", actual_files == archive_meta["files"] == 314, {"observed": actual_files, "expected": archive_meta["files"]})
check("all-309-compiler-and-4-inherited-files-verified", len(verified) == 313 and not missing and not extras, {"verified": len(verified), "missing": missing, "extras": extras[:10]})
check("retained-manifest-member-matches", bool(manifest_member and manifest_member["matches_local"]), manifest_member)

result = {
    "schema": "gobi.ci2-publication-delivery-check/v1",
    "checked_at_utc": datetime.now(timezone.utc).isoformat(),
    "run_id": run["id"],
    "job_id": 124365059288,
    "head_sha": run["head_sha"],
    "artifact_id": artifact["id"],
    "artifact_digest": artifact["digest"],
    "artifact_expiry": artifact["expires_at"],
    "artifact_expired": artifact["expired"],
    "workflow_zip": {"path": str(run_zip.relative_to(CI_ROOT)), "bytes": zip_bytes, "sha256": zip_hash.hexdigest()},
    "retained_archive": {"path": str(archive_path.relative_to(CI_ROOT)), "bytes": archive_size, "sha256": archive_hash.hexdigest(), "members": actual_files, "verified_manifest_rows": len(verified), "manifest_member": manifest_member},
    "compiler_files": len(manifest["compilerFiles"]),
    "inherited_reports": len(manifest["inheritedReports"]),
    "execution": {"path": str(execution_path.relative_to(CI_ROOT)), "status": execution["status"], "commands": len(execution["commands"]), "source_before_after_pins": len(execution["sourceBefore"]), "source_stable": execution["sourceBefore"] == execution["sourceAfter"], "profiles": [{"fixture": p["fixture"], "status": p["status"], "ticks": p["ticks"]} for p in profiles], "total_ticks": sum(p["ticks"] for p in profiles), "mismatches": execution.get("mismatches")},
    "checks": [{"name": name, "passed": name not in {e["check"] for e in errors}} for name in [
        "pr-head-matches-run-head","source-tree-matches-refreshed-git-data","source-parent-is-408e330","pr-base-matches-42df","synthetic-merge-tree-matches-source","synthetic-merge-parents-are-base-and-head","pr-is-unmerged","run-is-successful-pull-request-attempt","artifact-api-row-binds-run-and-head","archive-metadata-binds-run-artifact-head","artifact-is-not-expired","artifact-expiry-is-after-source-refresh","workflow-zip-size-matches-artifact-api","workflow-zip-digest-matches-artifact-and-manifest","execution-receipt-passed","execution-commands-all-exit-zero","source-pins-stable","five-matched-profiles-43-ticks","node-tests-log-is-81-of-81","retained-delivery-archive-size","retained-delivery-archive-sha256","manifest-selection-counts","retained-tar-member-count","all-309-compiler-and-4-inherited-files-verified","retained-manifest-member-matches"
    ]],
    "errors": errors
}
print(json.dumps(result, indent=2))
if errors:
    raise SystemExit(1)
