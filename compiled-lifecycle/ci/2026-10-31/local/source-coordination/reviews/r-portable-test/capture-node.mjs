import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const name = process.argv[2];
const args = process.argv.slice(3);
if (!name || args.length === 0) throw new Error("usage: capture-node.mjs <name> <node args...>");
const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", env: process.env });
if (result.error) throw result.error;
const dir = resolve(root, "compiled-lifecycle/coordination/reviews/r-portable-test/captures", name);
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "stdout.log"), result.stdout ?? "");
writeFileSync(resolve(dir, "stderr.log"), result.stderr ?? "");
writeFileSync(resolve(dir, "exit-code.txt"), `${result.status ?? 1}\n`);
writeFileSync(resolve(dir, "command.json"), `${JSON.stringify({
  executable: process.execPath,
  args,
  cwd: root,
  nodeVersion: process.version,
  explicitAppDir: process.env.GOBI_LIFECYCLE_APP_DIR ?? null,
  exitCode: result.status ?? 1,
}, null, 2)}\n`);
process.stdout.write(`${name}: child exit ${result.status ?? 1}\n`);
process.exitCode = 0;
