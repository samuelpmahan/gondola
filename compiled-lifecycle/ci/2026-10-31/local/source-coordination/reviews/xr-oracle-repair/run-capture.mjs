import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const base = resolve(root, "compiled-lifecycle/coordination/reviews/xr-oracle-repair");
const cases = {
  "pre-repair": ["--test", "compiled-lifecycle/coordination/reviews/xr-oracle-repair/pre-repair-mirror/compiled-lifecycle/browser/lifecycle-oracle.test.mjs"],
  "focused-final": ["--test", "compiled-lifecycle/browser/lifecycle-oracle.test.mjs"],
  "combined-final": ["--test", "compiled-lifecycle/conformance/check.test.mjs", "compiled-frontend/conformance/check.test.mjs"],
};

const name = process.argv[2];
const args = cases[name];
if (!args) throw new Error(`unknown capture case: ${name}`);
const executable = process.execPath;
const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", env: process.env });
if (result.error) throw result.error;

const outputDir = resolve(base, "captures", name);
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, "stdout.log"), result.stdout ?? "");
writeFileSync(resolve(outputDir, "stderr.log"), result.stderr ?? "");
writeFileSync(resolve(outputDir, "exit-code.txt"), `${result.status ?? 1}\n`);
writeFileSync(resolve(outputDir, "command.json"), `${JSON.stringify({
  executable,
  args,
  cwd: root,
  nodeVersion: process.version,
  exitCode: result.status ?? 1,
}, null, 2)}\n`);
process.stdout.write(`${name}: exit ${result.status ?? 1}; stdout ${Buffer.byteLength(result.stdout ?? "")} bytes; stderr ${Buffer.byteLength(result.stderr ?? "")} bytes\n`);
process.exitCode = 0;
