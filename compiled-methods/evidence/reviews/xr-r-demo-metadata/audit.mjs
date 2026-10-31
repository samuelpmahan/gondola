import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("../../../../", import.meta.url).pathname);
const repair = "compiled-methods/evidence/repairs/r-demo-metadata";
const canonicalReceiptPath = "compiled-methods/coordination/receipts/E-DEMO.json";
const canonicalReportPath = "compiled-methods/coordination/reports/E-DEMO.md";
const priorXRReceiptPath = "compiled-methods/coordination/receipts/XR--DEMO.json";
const priorXRReportPath = "compiled-methods/coordination/reports/XR--DEMO.md";
const rawRunnerReportPath = "compiled-methods/evidence/demo/attempt-05-methods-only-final/execution/runner-report.md";
const rawRunnerReceiptPath = "compiled-methods/evidence/demo/attempt-05-methods-only-final/execution/runner-receipt.json";
const runnerSourcePath = "compiled-methods/run.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readAt = (path) => readFile(join(root, path));
const hashAt = async (path) => hash(await readAt(path));
const jsonAt = async (path) => JSON.parse(await readAt(path));

const before = `${repair}/before`;
const after = `${repair}/after`;
const oldReceiptPath = `${before}/E-DEMO.receipt.json`;
const newReceiptPath = `${after}/E-DEMO.receipt.json`;
const oldReportPath = `${before}/E-DEMO.report.md`;
const newReportPath = `${after}/E-DEMO.report.md`;
const oldXRReceiptPath = `${before}/XR--DEMO.receipt.json`;
const oldXRReportPath = `${before}/XR--DEMO.report.md`;

const oldReceiptBytes = await readAt(oldReceiptPath);
const newReceiptBytes = await readAt(newReceiptPath);
const currentReceiptBytes = await readAt(canonicalReceiptPath);
const oldReportBytes = await readAt(oldReportPath);
const newReportBytes = await readAt(newReportPath);
const currentReportBytes = await readAt(canonicalReportPath);
const oldReceipt = JSON.parse(oldReceiptBytes);
const newReceipt = JSON.parse(newReceiptBytes);
const currentReceipt = JSON.parse(currentReceiptBytes);
const rawRunnerReceipt = await jsonAt(rawRunnerReceiptPath);

assert.equal(hash(oldReceiptBytes), "07225fe6565aba94f9f17510a2daabc1f0062dd5b44f9e045335dc49533be4e3");
assert.equal(hash(oldReportBytes), "c4670cb17d12daa24ea057358f658414de518dcb3d6bc0b7ff1bda1f9b6a1e68");
assert.equal(hash(await readAt(oldXRReceiptPath)), "abda903f4e82ce783f25d0943588eaea67ba7df123b09fad28da0ee18d2067b1");
assert.equal(hash(await readAt(oldXRReportPath)), "2840688ef486a85171c25ca00098ca4d066a11c4c4634dfede622cf536a2d206");
assert.deepEqual(oldReportBytes, newReportBytes);
assert.deepEqual(oldReportBytes, currentReportBytes);
assert.deepEqual(await readAt(oldXRReceiptPath), await readAt(priorXRReceiptPath));
assert.deepEqual(await readAt(oldXRReportPath), await readAt(priorXRReportPath));

assert.equal(oldReceipt.report.path, canonicalReportPath);
assert.equal(oldReceipt.report.sha256, "dc8b06663b11faff05ea9b6bba8bcd47832c0df6a80ffa0cca698ab20f78f36c");
assert.equal(newReceipt.report.path, canonicalReportPath);
assert.equal(newReceipt.report.sha256, "c4670cb17d12daa24ea057358f658414de518dcb3d6bc0b7ff1bda1f9b6a1e68");
assert.deepEqual(newReceiptBytes, currentReceiptBytes);
const oldNormalized = structuredClone(oldReceipt);
oldNormalized.report.sha256 = newReceipt.report.sha256;
assert.deepEqual(oldNormalized, newReceipt, "only report.sha256 may change in the E-DEMO receipt");
assert.deepEqual(newReceipt, currentReceipt);

const rawRunnerReportHash = await hashAt(rawRunnerReportPath);
assert.equal(rawRunnerReportHash, "dc8b06663b11faff05ea9b6bba8bcd47832c0df6a80ffa0cca698ab20f78f36c");
assert.equal(rawRunnerReceipt.report.sha256, rawRunnerReportHash);
assert.equal(newReceipt.finalEvidencePacket.rawRunnerReportSha256, rawRunnerReportHash);
assert.equal(await hashAt(runnerSourcePath), "eb1aa250c0c9cfbb7f3d73abf7692f8e50a57314836f8e5d0ac7d53a77a3cb68");

const manifest = await jsonAt(`${repair}/before/manifest.json`);
for (const entry of Object.values(manifest.before)) {
  const path = `${repair}/before/${entry.path.split("/").at(-1)}`;
  assert.equal(await hashAt(path), entry.sha256, `preservation manifest mismatch: ${path}`);
}
const inventoryLines = (await readAt(`${repair}/inventory.sha256`)).toString("utf8").trim().split("\n");
const inventory = inventoryLines.map((line) => {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  assert.ok(match, `malformed repair inventory line: ${line}`);
  return { sha256: match[1], path: match[2] };
});
for (const item of inventory) assert.equal(await hashAt(item.path), item.sha256, `repair inventory mismatch: ${item.path}`);
const actualFiles = [];
async function walk(directory, prefix = "") {
  const entries = await readdir(join(root, directory, prefix), { withFileTypes: true });
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(directory, path);
    else if (entry.isFile()) actualFiles.push(`${directory}/${path}`);
  }
}
await walk(repair);
assert.deepEqual(inventory.map(({ path }) => path).sort(), actualFiles.filter((path) => path !== `${repair}/inventory.sha256`).sort());

const metadataReportPath = "compiled-methods/coordination/reports/R-DEMO-METADATA.md";
const metadataReceiptPath = "compiled-methods/coordination/receipts/R-DEMO-METADATA.json";
const metadataReportHash = await hashAt(metadataReportPath);
const metadataReceipt = await jsonAt(metadataReceiptPath);
assert.equal(metadataReceipt.report_sha256, metadataReportHash);
assert.equal((await jsonAt(`${after}/R-DEMO-METADATA.receipt.json`)).report_sha256, metadataReportHash);

const audit = {
  schema: "gobi.xr-r-demo-metadata-audit/v1",
  status: "verified",
  canonicalReport: {
    path: canonicalReportPath,
    sha256: await hashAt(canonicalReportPath),
    unchangedFromBeforeSnapshot: true,
  },
  canonicalReceipt: {
    path: canonicalReceiptPath,
    sha256: await hashAt(canonicalReceiptPath),
    beforeSha256: hash(oldReceiptBytes),
    afterSha256: hash(newReceiptBytes),
    exactlyOneFieldChanged: "report.sha256",
    beforeValue: oldReceipt.report.sha256,
    afterValue: newReceipt.report.sha256,
    currentEqualsAfterSnapshot: true,
  },
  priorXRDemoReview: {
    reportSha256: await hashAt(priorXRReportPath),
    receiptSha256: await hashAt(priorXRReceiptPath),
    bothUnchangedFromPreservedSnapshots: true,
  },
  rawRunnerEvidence: {
    reportPath: rawRunnerReportPath,
    reportSha256: rawRunnerReportHash,
    receiptReportSha256: rawRunnerReceipt.report.sha256,
    rawReportPinStillValid: true,
  },
  runnerSource: {
    path: runnerSourcePath,
    sha256: await hashAt(runnerSourcePath),
    unchanged: true,
  },
  preservation: {
    inventoryMemberCount: inventory.length,
    allInventoryHashesMatch: true,
    inventoryCoversEveryRepairFileExceptManifest: true,
    beforeManifestMembersVerified: Object.keys(manifest.before).length,
  },
  noFunctionalRerunRequired: true,
};
await writeFile(join(root, "compiled-methods/evidence/reviews/xr-r-demo-metadata/audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
