import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--") || values.has(name) || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`invalid or duplicate argument near ${name}`);
    }
    values.set(name, argv[++index]);
  }
  for (const name of ["--raw-report", "--certificate", "--output"]) {
    if (!values.has(name)) throw new Error(`missing ${name} <value>`);
  }
  return {
    rawPath: resolve(values.get("--raw-report")),
    certificatePath: resolve(values.get("--certificate")),
    outputPath: resolve(values.get("--output")),
  };
}

function parseJSON(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error?.message ?? error}`); }
}

const options = parseArguments(process.argv.slice(2));
const rawBytes = await readFile(options.rawPath);
const certificateBytes = await readFile(options.certificatePath);
const raw = parseJSON(rawBytes, "raw qualification report");
const certificate = parseJSON(certificateBytes, "Go certificate");
if (raw.schema !== "gobi.backend-qualification-run/v1" || certificate.schema !== "gobi.backend-qualification-certificate/v1") {
  throw new Error("raw report or Go certificate schema does not match the qualification contract");
}
if (!raw.sourceCommit || raw.sourceCommit !== certificate.sourceCommit) throw new Error("raw report and Go certificate source commits differ");
if (!Array.isArray(raw.results) || !Array.isArray(certificate.results) || raw.results.length !== 13 || certificate.results.length !== 13) {
  throw new Error("raw report and Go certificate must each contain all thirteen cases");
}
const rawById = new Map();
for (const item of raw.results) {
  if (!item || typeof item.id !== "string" || rawById.has(item.id)) throw new Error("raw report case IDs must be unique strings");
  rawById.set(item.id, item);
}
const certificateIds = new Set();
const cases = [];
for (const result of certificate.results) {
  if (!result || typeof result.id !== "string" || certificateIds.has(result.id)) throw new Error("Go certificate case IDs must be unique strings");
  certificateIds.add(result.id);
  const rawResult = rawById.get(result.id);
  if (!rawResult) throw new Error(`certificate references unknown raw case ${result.id}`);
  if (result.backend !== rawResult.backend || result.fault !== rawResult.fault) throw new Error(`certificate identity differs for case ${result.id}`);
  if (typeof result.passed !== "boolean" || !Array.isArray(result.expectedChannels) || !Array.isArray(rawResult.observedChannels)) {
    throw new Error(`case ${result.id} is missing typed verdict or channel data`);
  }
  if ((rawResult.infrastructureErrors?.length ?? 0) !== 0 || (rawResult.pageErrors?.length ?? 0) !== 0) {
    throw new Error(`case ${result.id} has infrastructure or page errors`);
  }
  if (typeof rawResult.evidencePath !== "string" || !rawResult.evidencePath || !/^[0-9a-f]{64}$/.test(rawResult.evidenceSHA256 ?? "")) {
    throw new Error(`case ${result.id} has no pinned live evidence file`);
  }
  const evidencePath = resolve(dirname(options.rawPath), rawResult.evidencePath);
  if (!evidencePath.startsWith(dirname(options.rawPath) + sep)) throw new Error(`evidence path escapes raw report directory for ${result.id}`);
  const evidenceBytes = await readFile(evidencePath);
  const evidenceHash = hash(evidenceBytes);
  if (evidenceHash !== rawResult.evidenceSHA256) throw new Error(`case evidence hash mismatch: ${result.id}`);
  const evidence = parseJSON(evidenceBytes, `case evidence ${result.id}`);
  cases.push({
    raw: rawResult,
    certificate: result,
    evidence,
    evidenceHash,
  });
}
if (rawById.size !== 13 || certificateIds.size !== 13 || [...rawById.keys()].some((id) => !certificateIds.has(id))) {
  throw new Error("Go certificate case set does not exactly cover the raw report");
}
const healthy = cases.filter(({ raw: item }) => item.fault === "none");
const faulty = cases.filter(({ raw: item }) => item.fault !== "none");
if (healthy.length !== 3 || faulty.length !== 10) throw new Error("qualification matrix must contain exactly three healthy and ten fault cases");

const viewerData = {
  schema: "gobi.backend-qualification-viewer-data/v1",
  sourceCommit: raw.sourceCommit,
  qualified: certificate.qualified === true,
  rawReport: { schema: raw.schema, sourceCommit: raw.sourceCommit, caseCount: raw.results.length },
  certificate: {
    schema: certificate.schema,
    sourceCommit: certificate.sourceCommit,
    qualified: certificate.qualified === true,
    results: certificate.results,
  },
  cases,
  inputPins: {
    rawReport: { path: relative(root, options.rawPath).split(sep).join("/"), bytes: rawBytes.length, sha256: hash(rawBytes) },
    certificate: { path: relative(root, options.certificatePath).split(sep).join("/"), bytes: certificateBytes.length, sha256: hash(certificateBytes) },
  },
};

await mkdir(options.outputPath, { recursive: true });
for (const name of ["index.html", "demo.css", "app.mjs"]) {
  await writeFile(join(options.outputPath, name), await readFile(join(here, name)), { flag: "wx" });
}
const viewerBytes = Buffer.from(`${JSON.stringify(viewerData, null, 2)}\n`);
await writeFile(join(options.outputPath, "viewer-data.json"), viewerBytes, { flag: "wx" });
const output = {
  schema: "gobi.backend-qualification-demo-build/v1",
  status: "passed",
  output: options.outputPath,
  sourceCommit: raw.sourceCommit,
  qualified: viewerData.qualified,
  caseCount: cases.length,
  healthyCases: healthy.length,
  faultCases: faulty.length,
  evidenceFilesVerified: cases.length,
  viewerData: { bytes: viewerBytes.length, sha256: hash(viewerBytes) },
};
process.stdout.write(`${JSON.stringify(output)}\n`);
