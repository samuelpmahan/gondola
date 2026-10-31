import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNativeCapture, ORACLE_SCENARIO } from "../oracle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => readFileSync(resolve(root, path));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const freshPath = "compiled-children/coordination/rawlogs/E-FIX-ORACLE-CUSTODY-native-fresh.json";
const peerPath = "compiled-children/coordination/rawlogs/N2-XR-ORACLE-native-fresh.json";
const savedPath = "compiled-children/oracle/evidence/native.json";
const freshBytes = read(freshPath);
const peerBytes = read(peerPath);
const savedBytes = read(savedPath);
if (!freshBytes.equals(peerBytes) || !freshBytes.equals(savedBytes)) {
  throw new Error("fresh native trace is not byte-identical to both saved independent captures");
}
const capture = JSON.parse(freshBytes.toString("utf8"));
assertNativeCapture(capture, "$.freshNative");
if (capture.events.length !== ORACLE_SCENARIO.events.length || capture.steps.length !== 38) {
  throw new Error(`unexpected trace dimensions: events=${capture.events.length}, steps=${capture.steps.length}`);
}
process.stdout.write(`${JSON.stringify({
  status: "passed",
  freshTraceSha256: hash(freshBytes),
  freshTraceBytes: freshBytes.length,
  byteIdenticalToIndependentXRTrace: true,
  byteIdenticalToOracleSavedTrace: true,
  events: capture.events.length,
  steps: capture.steps.length,
  independentStateViewAssertions: "passed",
}, null, 2)}\n`);
