import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const runPath = resolve(root, "compiled-methods/evidence/repairs/r-harness/methods.run.json");
const checkPath = resolve(root, "compiled-methods/evidence/repairs/r-harness/methods.check.json");
const protectedPinPath = resolve(root, "compiled-methods/evidence/repairs/r-harness/preserved-before.sha256");
const run = JSON.parse(await readFile(runPath, "utf8"));
const check = JSON.parse(await readFile(checkPath, "utf8"));
const protectedBefore = (await readFile(protectedPinPath, "utf8")).trim().split("\n").map((line) => {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error(`invalid preserved hash line ${JSON.stringify(line)}`);
  return { sha256: match[1], path: match[2] };
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifyPins(pins, makeAbsolute = (path) => resolve(root, path)) {
  const checked = [];
  for (const pin of pins) {
    const bytes = await readFile(makeAbsolute(pin.path));
    checked.push({
      path: pin.path,
      expectedSha256: pin.sha256,
      actualSha256: sha256(bytes),
      expectedBytes: Number.isSafeInteger(pin.bytes) ? pin.bytes : null,
      actualBytes: bytes.length,
    });
    assert.equal(checked.at(-1).actualSha256, pin.sha256, `hash mismatch for ${pin.path}`);
    if (Number.isSafeInteger(pin.bytes)) {
      assert.equal(bytes.length, pin.bytes, `byte-count mismatch for ${pin.path}`);
    }
  }
  return checked;
}

assert.equal(run.status, "matched");
assert.equal(check.status, "matched");
assert.equal(run.sourceStable, true);
assert.equal(run.sourceStableThroughCheck, true);
assert.equal(run.outputsStableThroughCheck, true);
assert.deepEqual(run.sourcePinsBefore, run.sourcePinsAfter);
assert.deepEqual(run.sourcePinsAfter, run.sourcePinsFinal);
assert.deepEqual(run.outputPinsBeforeCheck, run.outputPinsAfterCheck);

const wrongMessage = check.mutationControls?.outcomes?.find((outcome) => outcome.name === "wrong-message-value");
assert.ok(wrongMessage?.rejected);
assert.match(wrongMessage.reason, /\.message\.name: value differs; expected "childAdd", got "parentAdd"/);
assert.doesNotMatch(wrongMessage.reason, /object field set differs/);

const [source, build, evidence, preserved] = await Promise.all([
  verifyPins(run.sourcePinsFinal),
  verifyPins(run.outputPinsAfterCheck, (path) => path),
  verifyPins(run.evidencePins, (path) => path),
  verifyPins(protectedBefore, (path) => resolve(root, path)),
]);

const audit = {
  schema: "gobi.r-harness-pin-audit/v1",
  status: "verified",
  sourcePinCount: source.length,
  buildAndNativePinCount: build.length,
  runEvidencePinCount: evidence.length,
  preservedPriorArtifactCount: preserved.length,
  sourceStable: run.sourceStable,
  sourceStableThroughCheck: run.sourceStableThroughCheck,
  outputsStableThroughCheck: run.outputsStableThroughCheck,
  wrongMessageSemanticReason: wrongMessage.reason,
  checks: { source, build, evidence, preserved },
};
const outputPath = resolve(root, "compiled-methods/evidence/repairs/r-harness/pin-audit.json");
await writeFile(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ...audit, checks: undefined }, null, 2)}\n`);
