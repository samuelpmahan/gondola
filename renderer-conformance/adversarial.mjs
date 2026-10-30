// Required real-Go browser proofs are named explicitly so missing coverage
// cannot be hidden by a successful ordinary replay.

export const expectedProbeNames = Object.freeze([
  "same-backend-retained-key-reorder-and-async-focus",
  "same-backend-react-retained-key-reorder-and-async-focus",
  "same-backend-godom-retained-key-reorder-and-async-focus",
  "all-six-directed-swaps-replace-node-and-restore-logical-selection",
  "deleted-focused-key-does-not-misfocus-other-row",
  "godom-removed-input-event-makes-zero-go-dispatches",
  "disabled-controls-suppress-native-click-and-preserve-snapshot",
  "manifest-version-and-capability-reject-before-init-mount-or-transport",
  "raw-old-path-key-rejects-atomically",
  "remove-add-path-reuse-keeps-new-row-identity",
  "strict-wasm-bridge-invalid-calls-are-atomic",
]);

const expectedNames = new Set(expectedProbeNames);
const registryOnlyProbe = "manifest-version-and-capability-reject-before-init-mount-or-transport";

/** Require every named probe exactly once, with a truthful real-Go label. */
export function validateProbeSet(probes) {
  if (!Array.isArray(probes)) throw new TypeError("adversarial probes must be an array");
  const names = probes.map((probe) => probe?.name);
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const missing = expectedProbeNames.filter((name) => !counts.has(name));
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([name]) => name);
  const unexpected = [...counts.keys()].filter((name) => !expectedNames.has(name));
  const mislabeled = probes.filter((probe) => probe?.kind !== (probe?.name === registryOnlyProbe ? "registry-contract" : "real-go"))
    .map((probe) => probe?.name ?? "<unnamed>");
  if (missing.length || duplicates.length || unexpected.length || mislabeled.length) {
    const details = [];
    if (missing.length) details.push(`missing required adversarial probes: ${missing.join(", ")}`);
    if (duplicates.length) details.push(`duplicate adversarial probes: ${duplicates.join(", ")}`);
    if (unexpected.length) details.push(`unregistered adversarial probes: ${unexpected.join(", ")}`);
    if (mislabeled.length) details.push(`mislabelled probe kinds: ${mislabeled.join(", ")}`);
    const error = new Error(details.join("; "));
    error.probes = probes;
    throw error;
  }
  const failures = probes.filter((probe) => probe.pass !== true).map((probe) => ({
    name: probe.name,
    kind: probe.kind,
    observations: probe.observations ?? null,
  }));
  return { ok: failures.length === 0, expected: [...expectedProbeNames], failures };
}

/** Execute the browser-side real-WASM probes and retain every failure trace. */
export async function runAdversarial(page) {
  if (!page || typeof page.evaluate !== "function") {
    throw new TypeError("runAdversarial(page) requires a Playwright-compatible page");
  }
  const result = await page.evaluate(async () => {
    const harness = window.__keyedHarness;
    if (!harness || typeof harness.runAdversarial !== "function") {
      return { probes: [], error: "browser fixture must expose runAdversarial()" };
    }
    return harness.runAdversarial();
  });
  const report = {
    ...result,
    moduleExpectedProbeNames: [...expectedProbeNames],
  };
  try {
    const validated = validateProbeSet(report.probes);
    report.ok = validated.ok && report.error == null;
    report.expectedProbeNames = validated.expected;
    report.failures = validated.failures;
  } catch (error) {
    report.ok = false;
    report.validationError = String(error?.message ?? error);
    report.expectedProbeNames = [...expectedProbeNames];
    report.failures = error.probes?.filter((probe) => probe?.pass !== true) ?? [];
  }
  return report;
}
