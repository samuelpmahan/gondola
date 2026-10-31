import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const generatorPath = resolve(root, "compiled-children/conformance/seeded.mjs");
const testPath = resolve(root, "compiled-children/conformance/seeded.test.mjs");
const { DEFAULT_SEEDS, generateSeededChildrenScenario } = await import(pathToFileURL(generatorPath).href);
const sourceText = await readFile(testPath, "utf8");
const browserReference = /\b(?:runChildrenBrowserConformance|browserCapture|browserResult|positiveBrowser)\b/.test(sourceText);
const seeds = [];
for (const seed of DEFAULT_SEEDS) {
  const first = generateSeededChildrenScenario(seed);
  const second = generateSeededChildrenScenario(seed);
  const deterministic = JSON.stringify(first) === JSON.stringify(second);
  const { scenario, metadata } = first;
  seeds.push({
    seed,
    deterministic,
    eventCount: scenario.events.length,
    eventBound: scenario.events.length <= 64,
    maximumChildrenMetadata: metadata.bounds.maximumChildren,
    maximumChildrenBound: metadata.bounds.maximumChildren <= 6,
    keyOrder: metadata.keyOrder,
    keyOrderUnique: new Set(metadata.keyOrder).size === metadata.keyOrder.length,
    physicalStartKey: metadata.physicalStartKey,
    firstInput: scenario.events[0],
    topLevelResultKeys: Object.keys(first).sort(),
    generatedStateOrBrowserCapture: ["state", "browser", "trace", "snapshots"].some((key) => Object.hasOwn(first, key)),
  });
}
const output = {
  schema: "gobi.compiled-children-seeded-input-review/v1",
  node: process.version,
  sourcePins: {
    generator: { path: "compiled-children/conformance/seeded.mjs", bytes: (await readFile(generatorPath)).length, sha256: hash(await readFile(generatorPath)) },
    test: { path: "compiled-children/conformance/seeded.test.mjs", bytes: (await readFile(testPath)).length, sha256: hash(await readFile(testPath)) },
  },
  testSourceImports: sourceText.match(/^import .*$/gm) ?? [],
  testHasBrowserCaptureReference: browserReference,
  defaultSeeds: [...DEFAULT_SEEDS],
  seededInputs: seeds,
  uint32Boundaries: [0, 0xffff_ffff],
  note: "Audit observes only generated schedules and metadata. It does not evaluate Go state, direct output, or browser results.",
};
if (seeds.some((item) => !item.deterministic || !item.eventBound || !item.maximumChildrenBound || !item.keyOrderUnique || item.generatedStateOrBrowserCapture)) {
  throw new Error("seeded input audit detected a determinism, declared bound, or input-only violation");
}
const outPath = resolve(root, "compiled-children/coordination/rawlogs/XR-CHECKER-TESTS-20261031-01/seed-audit.json");
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
