import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const name = process.argv[2];
const [executable, ...args] = process.argv.slice(3);
if (!name || !executable) throw new Error("usage: capture-command.mjs <name> <executable> <args...>");
const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
if (result.error) throw result.error;
const dir = resolve(root, "compiled-lifecycle/coordination/live-reply/captures", name);
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "stdout.log"), result.stdout ?? "");
writeFileSync(resolve(dir, "stderr.log"), result.stderr ?? "");
writeFileSync(resolve(dir, "exit-code.txt"), `${result.status ?? 1}\n`);
writeFileSync(resolve(dir, "command.json"), `${JSON.stringify({
  executable,
  args,
  cwd: root,
  nodeVersion: process.version,
  appDir: process.env.GOBI_LIFECYCLE_APP_DIR ?? null,
  exitCode: result.status ?? 1,
}, null, 2)}\n`);
process.stdout.write(`${name}: child exit ${result.status ?? 1}; stdout ${Buffer.byteLength(result.stdout ?? "")} bytes; stderr ${Buffer.byteLength(result.stderr ?? "")} bytes\n`);
process.exitCode = 0;
