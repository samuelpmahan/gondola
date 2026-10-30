import json
from pathlib import Path

root = Path("/workspace/scratch/39a56936f173/gondola-compiled")
out = Path("/tmp/gondola-xr-g-semantic-n5-20261030-2215/output")
base = {
    "schema": "gobi.build-request/v1",
    "sourceRoot": str(root),
    "entryPackages": [
        "github.com/samuelpmahan/gondola/counter",
        "github.com/samuelpmahan/gondola/fixtures/compiled/form",
        "github.com/samuelpmahan/gondola/fixtures/compiled/list",
        "github.com/samuelpmahan/gondola/fixtures/compiled/effect",
    ],
    "backend": "react",
    "outputDir": str(out),
}
destination = Path(__file__).parent
(destination / "valid-request.json").write_text(json.dumps(base, separators=(",", ":")) + "\n")
failure = {**base, "entryPackages": ["github.com/samuelpmahan/gondola/fixtures/compiled/does-not-exist"]}
(destination / "failure-request.json").write_text(json.dumps(failure, separators=(",", ":")) + "\n")
duplicate = (
    '{"schema":"gobi.build-request/v1","sourceRoot":' + json.dumps(str(root))
    + ',"entryPackages":["github.com/samuelpmahan/gondola/counter"],"backend":"react","backend":"react","outputDir":'
    + json.dumps(str(out)) + "}\n"
)
(destination / "duplicate-field-request.json").write_text(duplicate)
missing = {key: value for key, value in base.items() if key != "backend"}
(destination / "missing-field-request.json").write_text(json.dumps(missing, separators=(",", ":")) + "\n")
print(json.dumps({"sourceRoot": str(root), "outputDir": str(out), "requests": [
    "valid-request.json", "failure-request.json", "duplicate-field-request.json", "missing-field-request.json",
]}, indent=2))
