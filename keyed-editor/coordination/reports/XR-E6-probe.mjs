import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const reportDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(dirname(dirname(reportDir)));
const fixture = await mkdtemp(join(tmpdir(), "xr-e6-runner-"));
const toolbin = join(fixture, "toolbin");
const fakeGOROOT = join(fixture, "fakegoroot");
const runnerPath = join(fixture, "run-keyed-editor.sh");
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

await mkdir(toolbin, { recursive: true });
await mkdir(join(fakeGOROOT, "lib/wasm"), { recursive: true });
await writeFile(join(fakeGOROOT, "lib/wasm/wasm_exec.js"), "// isolated fixture\n");

const runner = await readFile(join(root, "run-keyed-editor.sh"), "utf8");
const nodePath = "/tmp/gondola-node22/node_modules/node/bin";
assert.ok(runner.includes(nodePath), "runner keeps its optional local Node 22 path");
await writeFile(runnerPath, runner.replaceAll(nodePath, toolbin));
await chmod(runnerPath, 0o755);

await writeFile(join(fixture, "run-http-effects.sh"), `#!/usr/bin/env bash
set -euo pipefail
[[ ! -e "${fixture}/interaction/node_modules" ]]
printf 'entered inherited stage with node_modules absent\\n' >> "${fixture}/order.log"
mkdir -p "${fixture}/interaction/node_modules/.bin"
cat > "${fixture}/interaction/node_modules/.bin/esbuild" <<'ESBUILD'
#!/usr/bin/env bash
set -euo pipefail
for arg in "$@"; do
  case "$arg" in
    --outfile=*) output="\${arg#--outfile=}"; mkdir -p "$(dirname "$output")"; : > "$output" ;;
  esac
done
ESBUILD
chmod +x "${fixture}/interaction/node_modules/.bin/esbuild"
printf 'inherited stage provisioned esbuild\\n' >> "${fixture}/order.log"
`);
await chmod(join(fixture, "run-http-effects.sh"), 0o755);

await writeFile(join(toolbin, "go"), `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  version) echo 'go version go1.24.0 linux/amd64' ;;
  env) echo ${quote(fakeGOROOT)} ;;
  build)
    while (($#)); do
      if [[ "$1" == -o ]]; then shift; mkdir -p "$(dirname "$1")"; : > "$1"; break; fi
      shift
    done
    ;;
  test) ;;
  *) echo "unexpected go invocation: $*" >&2; exit 2 ;;
esac
`);
await chmod(join(toolbin, "go"), 0o755);

await writeFile(join(toolbin, "node"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> ${quote(join(fixture, "node-calls.log"))}
if [[ "\${1:-}" == -p ]]; then echo 22; fi
if [[ "\${1:-}" == */keyed-editor/check.mjs ]]; then printf '%s\\n' "\${@:2}" > ${quote(join(fixture, "checker-args.log"))}; fi
`);
await chmod(join(toolbin, "node"), 0o755);

await mkdir(join(fixture, "cmd/collection-wasm"), { recursive: true });
await writeFile(join(fixture, "cmd/collection-wasm/smoke.mjs"), "// stubbed by this shell-flow probe\n");
await mkdir(join(fixture, "keyed-editor"), { recursive: true });
const args = ["--seeds", "11,12", "--cases", "2", "--max-actions", "7"];
const result = spawnSync("bash", [runnerPath, ...args], {
  cwd: fixture,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${toolbin}:${process.env.PATH}`,
    GOROOT: fakeGOROOT,
    FIXTURE_ROOT: fixture,
  },
});
assert.equal(result.status, 0, `isolated runner flow should complete: ${result.stderr}`);

assert.equal(await readFile(join(fixture, "order.log"), "utf8"),
  "entered inherited stage with node_modules absent\ninherited stage provisioned esbuild\n");
assert.equal(await readFile(join(fixture, "checker-args.log"), "utf8"),
  "--seeds\n11,12\n--cases\n2\n--max-actions\n7\n");
assert.ok((await readFile(join(fixture, "node-calls.log"), "utf8"))
  .includes(`${fixture}/keyed-editor/check.mjs --seeds 11,12 --cases 2 --max-actions 7`));
process.stdout.write("PASS inherited provisioning precedes the esbuild guard; final checker receives all CLI args\n");
process.stdout.write(`Fixture: ${fixture}\n`);
