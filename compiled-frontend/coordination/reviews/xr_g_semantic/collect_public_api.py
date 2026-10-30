import hashlib
import json
import os
import subprocess
from pathlib import Path

here = Path(__file__).resolve().parent
module_root = here.parents[2]
env = {**os.environ, "GOTOOLCHAIN": "go1.27.3"}
go = "/tmp/gondola-go/bin/go"
node = "/tmp/gondola-node22/node_modules/node/bin/node"
commands = {
    "new_compiler": [go, "doc", "github.com/s4wave/goscript/compiler.NewCompiler"],
    "compile_packages": [go, "doc", "github.com/s4wave/goscript/compiler.Compiler.CompilePackages"],
    "compilation_result": [go, "doc", "github.com/s4wave/goscript/compiler.CompilationResult"],
    "semantic_model": [go, "doc", "github.com/s4wave/goscript/compiler.SemanticModel"],
    "semantic_model_build": [go, "doc", "github.com/s4wave/goscript/compiler.SemanticModelOwner.Build"],
    "package_graph": [go, "doc", "github.com/s4wave/goscript/compiler.PackageGraph"],
    "package_graph_node": [go, "doc", "github.com/s4wave/goscript/compiler.PackageGraphNode"],
    "semantic_model_owner": [go, "doc", "github.com/s4wave/goscript/compiler.SemanticModelOwner"],
    "module_pin": [go, "list", "-m", "-json", "github.com/s4wave/goscript"],
    "module_integrity": [go, "mod", "verify"],
    "go_version": [go, "version"],
    "node_version": [node, "--version"],
}
results = {}
for name, command in commands.items():
    completed = subprocess.run(command, cwd=module_root, env=env, text=True, capture_output=True)
    results[name] = {
        "command": command,
        "exit_code": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }
    if completed.returncode != 0:
        raise SystemExit(f"{name} failed with exit {completed.returncode}: {completed.stderr}")

manifest = json.loads((module_root / "toolchain/probe_counter/results/module-origin.json").read_text())
go_module = json.loads(results["module_pin"]["stdout"])
module_dir = Path(go_module["Dir"])
api_sources = {}
for relative in [
    "compiler/compiler.go",
    "compiler/result.go",
    "compiler/semantic-model-types.go",
    "compiler/package-graph.go",
]:
    data = (module_dir / relative).read_bytes()
    api_sources[relative] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
mod = (module_root / "go.mod").read_text()
sum_lines = [line for line in (module_root / "go.sum").read_text().splitlines() if line.startswith("github.com/s4wave/goscript v0.6.2 ")]
result = {
    "module_root": str(module_root),
    "module_origin_record": manifest,
    "module_api_sources": api_sources,
    "go_mod_pin_lines": [line for line in mod.splitlines() if "github.com/s4wave/goscript" in line],
    "go_sum_pin_lines": sum_lines,
    "commands": results,
}
output = module_root / "coordination/reviews/xr_g_semantic/public-api-evidence.json"
output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"evidence": str(output), "module_pin": manifest, "go_doc_commands": len(commands)}, indent=2))
