import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const [outputArg, previousResultArg, failureResultArg] = process.argv.slice(2);
if (!outputArg || !previousResultArg || !failureResultArg) {
  process.stderr.write("usage: verify-preservation.mjs <output-dir> <successful-result.json> <failed-result.json>\n");
  process.exit(2);
}

const outputDir = resolve(outputArg);
const previousResult = JSON.parse(await readFile(resolve(previousResultArg), "utf8"));
const failedResult = JSON.parse(await readFile(resolve(failureResultArg), "utf8"));
assert.equal(previousResult.schema, "gobi.build-result/v1");
assert.equal(previousResult.ok, true);
assert.equal(failedResult.schema, "gobi.build-result/v1");
assert.equal(failedResult.ok, false);
assert.equal(failedResult.preservedPreviousOutput, true);
assert.equal(failedResult.outputs.length, 0);

for (const item of previousResult.outputs) {
  const bytes = await readFile(join(outputDir, item.path));
  assert.equal(bytes.byteLength, item.bytes, `${item.path}: previous output byte count changed`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256, `${item.path}: previous output hash changed`);
}

console.log(JSON.stringify({
  schema: "gobi.build-preservation-check/v1",
  previousOutputFilesVerified: previousResult.outputs.length,
  failedAttemptOK: failedResult.ok,
  preservedPreviousOutput: failedResult.preservedPreviousOutput,
}));
