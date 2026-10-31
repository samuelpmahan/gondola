import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const [{ assertNative }, fixture, expectations, nativeBytes] = await Promise.all([
  import(pathToFileURL(resolve(root, "compiled-children/conformance/check.mjs")).href),
  json("fixtures/compiled/children/scenario.json"),
  json("compiled-children/oracle/expectations.json"),
  readFile(resolve(root, "fixtures/compiled/children/evidence/rawlogs/native-trace.json")),
]);
const native = JSON.parse(nativeBytes.toString("utf8"));
const pinnedSHA256 = "8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb";
if (hash(nativeBytes) !== pinnedSHA256) throw new Error("actual native capture no longer matches its pinned SHA-256");
assertNative(native, fixture, expectations, "review-native-positive-control");

function stepAtEvent(eventIndex) {
  const step = structuredClone(native).steps.find((row) => row.eventIndex === eventIndex);
  if (!step) throw new Error(`actual native capture lacks source event ${eventIndex}`);
  return step;
}

const cases = [
  {
    id: "count",
    field: "child counter count",
    eventIndex: 0,
    mutate(step) { step.state.Children.find((child) => child.Key === "oak").Counter.Count += 1; },
  },
  {
    id: "reusedGeneration",
    field: "reused child generation",
    eventIndex: 15,
    mutate(step) { step.state.Children.find((child) => child.Key === "oak").Generation = 2; },
  },
  {
    id: "requestSeq",
    field: "child request sequence",
    eventIndex: 4,
    mutate(step) { step.state.Children.find((child) => child.Key === "oak").RequestSeq = 2; },
  },
  {
    id: "clearCancellationOrder",
    field: "children.clear effect order",
    eventIndex: 24,
    mutate(step) { step.effects.reverse(); },
  },
  {
    id: "nodeKey",
    field: "complete Gobi child key after reorder",
    eventIndex: 8,
    mutate(step) { step.view.kids[1].kids[1].key = "child-ash"; },
  },
];

const results = [];
for (const mutation of cases) {
  const mutated = structuredClone(native);
  const step = mutated.steps.find((row) => row.eventIndex === mutation.eventIndex);
  if (!step) throw new Error(`${mutation.id}: expected actual native event ${mutation.eventIndex}`);
  mutation.mutate(step);
  try {
    assertNative(mutated, fixture, expectations, `review-mutated-${mutation.id}`);
    throw new Error(`${mutation.id}: checker unexpectedly accepted mutated actual native capture`);
  } catch (error) {
    if (error.message.includes("checker unexpectedly accepted")) throw error;
    results.push({
      id: mutation.id,
      field: mutation.field,
      sourceEventIndex: mutation.eventIndex,
      rejected: true,
      errorName: error.name,
      mismatchPath: error.path ?? null,
      error: error.message,
    });
  }
}

const output = {
  schema: "gobi.compiled-children-checker-mutation-review/v1",
  node: process.version,
  trace: {
    path: "fixtures/compiled/children/evidence/rawlogs/native-trace.json",
    bytes: nativeBytes.length,
    sha256: hash(nativeBytes),
  },
  oracle: {
    path: "compiled-children/oracle/expectations.json",
    sha256: hash(await readFile(resolve(root, "compiled-children/oracle/expectations.json"))),
  },
  positiveControl: "actual pinned native trace accepted against fixture and independent literal expectations",
  mutationCount: results.length,
  rejectedMutationCount: results.filter((item) => item.rejected).length,
  mutations: results,
  note: "Each negative capture begins as a structured clone of the actual pinned native trace and changes one specified field before assertNative; no Go, direct, browser, or seeded result is fabricated.",
};
const outputPath = resolve(root, "compiled-children/coordination/rawlogs/XR-CHECKER-TESTS-20261031-01/mutation-audit.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
