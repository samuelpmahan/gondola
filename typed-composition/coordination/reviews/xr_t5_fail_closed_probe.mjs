// Bounded offline review probe over the preserved fixed-script shard.
// It mutates only cloned evidence; it does not launch browsers or native replay.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenario } from "../../check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(await readFile(resolve(HERE, "../../build/t5-final-fixed-report.json"), "utf8"));
const scriptShards = [];
for (const entry of report.rawScenarioShards) {
  const bytes = await readFile(entry.path);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const scenario = JSON.parse(bytes);
  if (scenario.control) continue;
  const closedInput = JSON.stringify(scenario.nativeInput) === JSON.stringify({
    actions: scenario.actions.map(({ method, args }) => ({ method, args })),
  });
  const nativeComplete = scenario.nativeFrames?.length === scenario.actions?.length &&
    scenario.nativeFrames.every((frame, index) => JSON.stringify(frame.action) === JSON.stringify(scenario.actions[index]) &&
      Array.isArray(frame.frame?.tree) && Array.isArray(frame.frame?.sessions) && Array.isArray(frame.frame?.changes));
  scriptShards.push({ hashMatches: hash === entry.sha256, closedInput, nativeComplete, scenario });
}
const target = scriptShards.find(({ scenario }) => scenario.name === "inputs-publication-races")?.scenario;
if (!target) throw new Error("fixed publication scenario shard is missing");

const baselineIssues = validateScenario(target).length;
const missingFocus = structuredClone(target);
missingFocus.browserFrames[12].candidate.focusReplacement = null;
const missingFocusIssues = validateScenario(missingFocus).length;

const missingTransport = structuredClone(target);
for (const frame of missingTransport.browserFrames) {
  delete frame.candidate.managerEffects;
  delete frame.reference.managerEffects;
  delete frame.candidate.transportCalls;
  delete frame.reference.transportCalls;
}
const missingTransportIssues = validateScenario(missingTransport).length;

const reorderedTransport = structuredClone(target);
const eventFrame = reorderedTransport.browserFrames.find((frame) =>
  frame.candidate.transportCalls?.length >= 2);
if (eventFrame) {
  eventFrame.candidate.transportCalls.reverse();
  eventFrame.reference.transportCalls.reverse();
}
const reorderedTransportIssues = validateScenario(reorderedTransport).length;

const alteredError = structuredClone(target);
const errorIndex = alteredError.nativeFrames.findIndex((frame) =>
  frame.result && typeof frame.result.error === "string");
if (errorIndex >= 0) alteredError.nativeFrames[errorIndex].result.error = "review-probe changed the error text";
const alteredErrorIssues = validateScenario(alteredError).length;

console.log(JSON.stringify({
  reportStatus: report.status,
  reportSHA256: createHash("sha256").update(await readFile(resolve(HERE, "../../build/t5-final-fixed-report.json"))).digest("hex"),
  fixedScriptShardCount: scriptShards.length,
  allFixedShardsHashedClosedAndNativeComplete: scriptShards.every((entry) =>
    entry.hashMatches && entry.closedInput && entry.nativeComplete),
  baselineIssues,
  missingFocusIssues,
  missingTransportIssues,
  sameWrongTransportOrderIssues: eventFrame ? reorderedTransportIssues : null,
  alteredErrorTextIssues: errorIndex >= 0 ? alteredErrorIssues : null,
  errorAction: errorIndex >= 0 ? alteredError.actions[errorIndex] : null,
}, null, 2));
