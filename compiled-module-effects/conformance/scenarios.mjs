const SCENARIO_SCHEMA = "gobi.module-effects-scenario/v1";

function click(target, action, key = undefined, generation = undefined) {
  const event = { kind: "click", target, action: structuredClone(action) };
  if (key !== undefined) event.key = key;
  if (generation !== undefined) event.generation = generation;
  return event;
}

function childClick(key, generation, path) {
  return click("child", { path, event: "click", value: "" }, key, generation);
}

function parentClick(path) {
  return click("parent", { path, event: "click", value: "" });
}

function request(key, generation) {
  return childClick(key, generation, "3/0");
}

function reply(token) {
  return { kind: "transport-reply", token };
}

function literalEvents() {
  return [
    childClick("a", 1, "2/2"), // Reset at zero is disabled in the Go View and actual DOM.
    childClick("a", 1, "2/1"), // Add to a only.
    request("a", 1),
    request("b", 1), // Both sibling requests remain pending.
    childClick("a", 1, "3/1"), // Cancel a while b remains pending.
    request("a", 1), // Request IDs continue after cancellation.
    reply("b:g1:r1"),
    reply("b:g1:r1"), // Duplicate delivery is rejected.
    reply("a:g1:r1"), // A canceled request may still reply late.
    reply("a:g1:r2"),
    request("a", 1),
    { kind: "renderer-swap", to: "react" },
    reply("a:g1:r3"), // Reply lands after a renderer swap.
    request("a", 1),
    request("a", 1), // Repeated request click while pending is disabled.
    parentClick("6/1"), // Removing a unmounts it and declares cancellation.
    parentClick("6/0"), // Same key remounts at generation 2.
    request("a", 2), // Request ID 1 is reused under a new generation.
    reply("a:g1:r4"), // Retained old-generation reply cannot reach a:g2.
    { kind: "stale-callback", key: "a", generation: 1, sourceEvent: 13 },
    reply("a:g2:r1"),
    reply("a:g2:r1"), // Duplicate delivery after successful completion.
    childClick("b", 1, "2/1"), // Sibling state is independently preserved.
    childClick("a", 2, "2/1"),
    childClick("a", 2, "2/2"), // Reset a; b's counter remains unchanged.
    childClick("a", 2, "2/2"), // Reset at zero is disabled again.
    request("a", 2),
    { kind: "renderer-swap", to: "dom" },
    reply("a:g2:r2"),
    request("b", 1),
    reply("b:g1:r2"),
  ];
}

export function literalEffectsScenario() {
  return {
    schema: SCENARIO_SCHEMA,
    name: "module-effects-literal",
    events: literalEvents(),
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDED_OPERATIONS = Object.freeze([
  "request-a",
  "request-b",
  "add-a",
  "reset-a",
  "add-b",
  "reset-b",
]);

export const DEFAULT_SEEDS = Object.freeze([20261104, 20261105, 20261106]);
export const SEEDED_EXTRA_OPERATIONS = 12;

export function generateSeededEffectsScenario(seed, extraOperations = SEEDED_EXTRA_OPERATIONS) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new TypeError("seed must be uint32");
  }
  if (!Number.isSafeInteger(extraOperations) || extraOperations < 1 || extraOperations > 48) {
    throw new TypeError("extraOperations must be an integer from 1 through 48");
  }
  const random = seededRandom(seed);
  const events = literalEvents();
  // The fixed prefix leaves a:g2:r2 and b:g1:r2 complete. Extra request
  // operations complete immediately, so generated scenarios stay bounded and
  // deterministic while continuing to exercise Go-owned request lifetimes.
  const requestIDs = { a: 2, b: 2 };
  const operations = [];
  for (let index = 0; index < extraOperations; index += 1) {
    const operation = SEEDED_OPERATIONS[Math.floor(random() * SEEDED_OPERATIONS.length)];
    operations.push(operation);
    if (operation === "request-a" || operation === "request-b") {
      const key = operation.at(-1);
      requestIDs[key] += 1;
      events.push(request(key, key === "a" ? 2 : 1));
      events.push(reply(`${key}:g${key === "a" ? 2 : 1}:r${requestIDs[key]}`));
      continue;
    }
    const key = operation.at(-1);
    const generation = key === "a" ? 2 : 1;
    const path = operation.startsWith("add-") ? "2/1" : "2/2";
    events.push(childClick(key, generation, path));
  }
  return {
    scenario: {
      schema: SCENARIO_SCHEMA,
      name: `module-effects-seed-${seed}`,
      events,
    },
    metadata: {
      seed,
      eventCount: events.length,
      generatedOperationCount: extraOperations,
      operations,
      generator: "gobi.module-effects-seeded-operations/v1",
    },
  };
}
