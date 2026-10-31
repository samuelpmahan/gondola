import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const phase = process.argv[2];
if (!new Set(["before", "after"]).has(phase)) throw new Error("usage: node custody-boundary.mjs before|after");
const paths = [
  "compiled-children/conformance/check.test.mjs",
  "compiled-children/conformance/seeded.test.mjs",
  "compiled-children/conformance/check.mjs",
  "compiled-children/conformance/seeded.mjs",
  "fixtures/compiled/children/scenario.json",
  "fixtures/compiled/children/evidence/rawlogs/native-trace.json",
  "compiled-children/oracle/expectations.json",
  "compiled-children/coordination/reports/E-CHECKER-TESTS.md",
  "compiled-children/coordination/receipts/E-CHECKER-TESTS.json",
  "compiled-children/coordination/rawlogs/E-CHECKER-TESTS-node-test.log",
  "compiled-children/coordination/rawlogs/E-CHECKER-TESTS-initial-seeded-assertion-failure.log",
  "compiled-children/coordination/rawlogs/E-CHECKER-TESTS-node-version.log",
  "compiled-children/coordination/rawlogs/E-CHECKER-TESTS-go-version.log",
  "compiled-children/coordination/rawlogs/E-CHECKER-TESTS-oracle-audit-custody.txt",
  "compiled-children/coordination/rawlogs/E-CHECKER-TESTS-audit-current-custody-copy.mjs",
  "compiled-children/oracle/audit-native-protocol.mjs",
  "compiled-children/coordination/reports/E-ORACLE.md",
  "compiled-children/coordination/receipts/E-ORACLE.json",
  "compiled-children/coordination/reports/E-DELIVERY.md",
  "compiled-children/coordination/receipts/E-DELIVERY.json",
  "compiled-children/run.mjs",
  "compiled-children/README.md",
  "compiled-children/RESULTS.md",
  "run-compiled-children.sh",
  ".github/workflows/gobi-compiled-children.yml",
  "compiled-children/demo/app.mjs",
  "compiled-children/demo/build.mjs",
  "compiled-children/demo/smoke.mjs",
  "compiled-children/demo/verify-archive.mjs",
  "compiled-children/demo/index.html",
  "compiled-children/demo/demo.css",
];
const rows = [];
for (const path of paths) {
  const bytes = await readFile(resolve(root, path));
  rows.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
const outputPath = resolve(root, `compiled-children/coordination/rawlogs/XR-CHECKER-TESTS-20261031-01/custody-${phase}.json`);
if (phase === "before") {
  await writeFile(outputPath, `${JSON.stringify({ schema: "gobi.compiled-children-review-custody/v1", phase, rows }, null, 2)}\n`, { flag: "wx" });
} else {
  const priorPath = resolve(root, "compiled-children/coordination/rawlogs/XR-CHECKER-TESTS-20261031-01/custody-before.json");
  const before = JSON.parse(await readFile(priorPath, "utf8"));
  const beforeByPath = new Map(before.rows.map((row) => [row.path, row]));
  const changes = rows.flatMap((row) => {
    const old = beforeByPath.get(row.path);
    return !old || old.bytes !== row.bytes || old.sha256 !== row.sha256 ? [{ before: old ?? null, after: row }] : [];
  });
  const after = { schema: "gobi.compiled-children-review-custody/v1", phase, unchanged: changes.length === 0, changes, rows };
  await writeFile(outputPath, `${JSON.stringify(after, null, 2)}\n`, { flag: "wx" });
  if (!after.unchanged) throw new Error(`review custody changed for ${changes.map((item) => item.after.path).join(", ")}`);
}
process.stdout.write(`${JSON.stringify({ phase, paths: rows.length, output: outputPath, unchanged: phase === "before" ? null : true })}\n`);
