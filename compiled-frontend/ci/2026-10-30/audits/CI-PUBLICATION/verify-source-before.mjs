import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const executionPath = path.join(
  root,
  "compiled-frontend/ci/2026-10-30/provider/extracted/compiled-frontend/artifacts/execution.json",
);
const execution = JSON.parse(readFileSync(executionPath, "utf8"));
const pins = execution.sourceBefore;
const mismatches = [];

for (const pin of pins) {
  const file = path.resolve(root, pin.path);
  if (file !== root && !file.startsWith(root + path.sep)) {
    mismatches.push({ path: pin.path, error: "outside-root" });
    continue;
  }
  try {
    const actual = createHash("sha256")
      .update(readFileSync(file))
      .digest("hex");
    if (actual !== pin.sha256) {
      mismatches.push({ path: pin.path, expected: pin.sha256, actual });
    }
  } catch (error) {
    mismatches.push({ path: pin.path, error: error.code || String(error) });
  }
}

const result = {
  sourcePinCount: pins.length,
  mismatches: mismatches.length,
  firstMismatches: mismatches.slice(0, 10),
  note: "Compares archived execution.json sourceBefore SHA-256 pins with current checkout bytes.",
};
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (mismatches.length !== 0) process.exitCode = 1;
