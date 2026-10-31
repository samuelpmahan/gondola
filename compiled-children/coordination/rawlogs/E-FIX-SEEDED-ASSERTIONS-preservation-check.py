import hashlib
import json
from pathlib import Path

manifest = json.loads(Path("compiled-children/coordination/repairs/E-FIX-SEEDED-ASSERTIONS/originals/manifest.json").read_text())
rows = []
for item in manifest["files"]:
    preserved = Path(item["preserved"])
    current = Path(item["source"])
    content = preserved.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    assert len(content) == item["bytes"] and digest == item["sha256"], item["preserved"]
    if item["source"].endswith("seeded.test.mjs"):
        assert current.read_bytes() != content, "repaired seeded test unexpectedly equals original"
        result = "changed only at authorized source path"
    else:
        assert current.read_bytes() == content, f"protected prior file changed: {item['source']}"
        result = "unchanged from preserved original"
    rows.append({"source": item["source"], "preserved": item["preserved"], "sha256": digest, "current": result})
print(json.dumps({"status": "passed", "files": rows}, indent=2))
