import hashlib
import json
from pathlib import Path

root = Path.cwd()
receipt_path = root / "compiled-children/coordination/receipts/E-DELIVERY.json"
report_path = root / "compiled-children/coordination/reports/E-DELIVERY.md"
r = json.loads(receipt_path.read_text())
issues = []
def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def verify_file(path, expected_bytes=None, expected_sha=None, label=None):
    p = root / path
    if not p.is_file():
        issues.append(f"missing {label or path}")
        return None
    b = p.read_bytes()
    actual_sha = hashlib.sha256(b).hexdigest()
    if expected_bytes is not None and len(b) != expected_bytes:
        issues.append(f"{label or path} bytes expected {expected_bytes}, got {len(b)}")
    if expected_sha is not None and actual_sha != expected_sha:
        issues.append(f"{label or path} SHA expected {expected_sha}, got {actual_sha}")
    return b

for path, expected in r.get("sourceSha256", {}).items():
    verify_file(path, expected_sha=expected, label=f"source pin {path}")
report = r.get("report", {})
verify_file(report.get("path", ""), report.get("bytes"), report.get("sha256"), "E-DELIVERY report")
for path, expected in r.get("dependencyLocks", {}).get("sha256", {}).items():
    verify_file(path, expected_sha=expected, label=f"lock hash {path}")

build = r["authorValidation"]["compiledBuild"]
base = Path(build["path"])
result = json.loads(verify_file(build["buildResult"]["path"], build["buildResult"]["bytes"], build["buildResult"]["sha256"], "GoScript BuildResult"))
manifest = json.loads(verify_file(build["manifest"]["path"], build["manifest"]["bytes"], build["manifest"]["sha256"], "React build manifest"))
if result.get("schema") != "gobi.build-result/v1" or result.get("ok") is not True or len(result.get("outputs", [])) != build["outputFilesVerified"]:
    issues.append("BuildResult schema/status/output count differs from receipt")
if len(manifest.get("apps", [])) != 1 or manifest["apps"][0].get("packagePath") != "github.com/samuelpmahan/gondola/fixtures/compiled/children" or manifest["apps"][0].get("backend") != "react":
    issues.append("manifest does not bind exactly one React keyed-children app")
seen = set()
for item in result.get("outputs", []):
    rel = item.get("path")
    if not isinstance(rel, str) or rel in seen or rel.startswith("/") or ".." in Path(rel).parts:
        issues.append(f"invalid/duplicate BuildResult output path: {rel!r}")
        continue
    seen.add(rel)
    verify_file(str(base / rel), item.get("bytes"), item.get("sha256"), f"BuildResult output {rel}")
if len(seen) != 67:
    issues.append(f"verified output inventory expected 67, got {len(seen)}")
physical = sorted(str(p.relative_to(root / base)).replace("\\", "/") for p in (root / base).rglob("*") if p.is_file())
if physical != sorted(seen):
    issues.append(f"physical output inventory differs from BuildResult: {len(physical)} physical vs {len(seen)} pinned")

for path, expected in build.get("sourcePins", {}).items():
    verify_file(path, expected_sha=expected, label=f"compiled fixture source pin {path}")

smoke = r["authorValidation"]["httpSmoke"]
smoke_obj = json.loads(verify_file(smoke["smokeJson"]["path"], smoke["smokeJson"]["bytes"], smoke["smokeJson"]["sha256"], "31-check smoke JSON"))
if smoke_obj.get("status") != "passed" or len(smoke_obj.get("checks", [])) != smoke.get("passed") or smoke.get("passed") != 31 or smoke.get("failed") != 0:
    issues.append("author smoke status or count differs from receipt")
if [c.get("id") for c in smoke_obj.get("checks", [])] != smoke.get("checkIds") or any(c.get("passed") is not True for c in smoke_obj.get("checks", [])):
    issues.append("author smoke checks differ from receipt IDs or include a failure")
if smoke_obj.get("webAssemblyRequests") != 0 or smoke_obj.get("webAssemblyApiCalls") != 0 or smoke_obj.get("browserErrors") or smoke_obj.get("consoleErrors") or smoke_obj.get("failedRequests"):
    issues.append("author smoke has nonzero WebAssembly observations or browser/request errors")
if smoke_obj.get("browser") != smoke.get("browser") or smoke_obj.get("port") != smoke.get("port"):
    issues.append("smoke browser version or ephemeral port differs from receipt")
if sorted((item.get("path"), item.get("status")) for item in smoke_obj.get("http", [])) != sorted((item.get("path"), item.get("status")) for item in smoke.get("http", [])):
    issues.append("smoke HTTP response ledger differs from receipt")
for path in [r["authorValidation"]["demoBuild"]["record"]["path"], smoke["screenshot"]["path"]]:
    pin = r["authorValidation"]["demoBuild"]["record"] if path == r["authorValidation"]["demoBuild"]["record"]["path"] else smoke["screenshot"]
    data = verify_file(path, pin["bytes"], pin["sha256"], path)
    if data and path.endswith("demo-build.json"):
        record = json.loads(data)
        bundle_path = str(Path(path).parent / record["output"]["path"])
        bundle = r["authorValidation"]["demoBuild"]
        verify_file(bundle_path, bundle["bundleBytes"], bundle["bundleSha256"], "demo bundle")
        manifest_actual = verify_file(str(base / record["manifest"]["path"]), record["manifest"]["bytes"], record["manifest"]["sha256"], "demo build manifest")
        for key in ("appIR", "module", "encoder"):
            pin = record[key]
            verify_file(str(base / pin["path"]), pin["bytes"], pin["sha256"], f"demo build {key}")
        if record.get("packagePath") != "github.com/samuelpmahan/gondola/fixtures/compiled/children" or record.get("backend") != "react":
            issues.append("demo build record package/backend differs from React children app")
        for source_path, expected in record.get("sourcePins", {}).items():
            verify_file(source_path, expected_sha=expected, label=f"demo source pin {source_path}")

failed = r["authorValidation"]["failedAttempt"]
failed_obj = json.loads(verify_file(failed["path"], failed["bytes"], failed["sha256"], "preserved initial failed smoke"))
if failed_obj.get("status") != "failed" or not any(c.get("id") == failed["check"] and c.get("passed") is False for c in failed_obj.get("checks", [])):
    issues.append("initial failed smoke is not preserved with its reported failed check")

probe = r["authorValidation"]["archiveConsumerProbe"]
for key in ("archive", "manifest", "verification"):
    item = probe[key]
    verify_file(item["path"], item["bytes"], item["sha256"], f"archive consumer probe {key}")
if probe.get("memberCount") != 1:
    issues.append("archive consumer probe member count is not one")
verification = json.loads((root / probe["verification"]["path"]).read_text())
if verification.get("status") != "passed" or verification.get("members") != probe.get("memberCount") or verification.get("archive", {}).get("sha256") != probe.get("archive", {}).get("sha256") or verification.get("manifest", {}).get("sha256") != probe.get("manifest", {}).get("sha256"):
    issues.append("archive consumer probe verification record differs from receipt pins")

print(f"author E-DELIVERY report/receipt: {report['bytes']} bytes; report hash matches receipt")
print(f"peer GoScript BuildResult: {len(result.get('outputs', []))} output hashes checked; React manifest identity checked")
print(f"author HTTP smoke: {smoke.get('passed')}/{len(smoke_obj.get('checks', []))}; IDs and structured observations match receipt")
print(f"preserved initial failed smoke: {failed_obj.get('status')} at check {failed.get('check')}; archive consumer probe: {probe.get('status')}")
print(f"source pins checked: {len(r.get('sourceSha256', {}))}; lock hashes checked: {len(r.get('dependencyLocks', {}).get('sha256', {}))}")
if issues:
    print("ISSUES:")
    for item in issues: print(f"- {item}")
    raise SystemExit(1)
print("author evidence integrity: PASS")
