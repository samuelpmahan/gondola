const SCENARIO_SCHEMA = "gobi.keyed-modules-scenario/v1";

const CHILD_ADD = Object.freeze({ path: "2/1", event: "click", value: "" });
const CHILD_RESET = Object.freeze({ path: "2/2", event: "click", value: "" });
const PARENT_STEP_DOWN = Object.freeze({ path: "1", event: "click", value: "" });
const PARENT_STEP_UP = Object.freeze({ path: "2", event: "click", value: "" });
const PARENT_LOCK = Object.freeze({ path: "3", event: "click", value: "" });
const PARENT_INPUT_RESET = Object.freeze({ path: "4", event: "click", value: "" });
const PARENT_MOUNT_A = Object.freeze({ path: "6/0", event: "click", value: "" });
const PARENT_REMOVE_A = Object.freeze({ path: "6/1", event: "click", value: "" });
const PARENT_MOUNT_B = Object.freeze({ path: "6/2", event: "click", value: "" });
const PARENT_REMOVE_B = Object.freeze({ path: "6/3", event: "click", value: "" });
const PARENT_REORDER = Object.freeze({ path: "6/4", event: "click", value: "" });

function click(target, action, key = undefined, generation = undefined) {
  const event = { kind: "click", target, action: structuredClone(action) };
  if (key !== undefined) event.key = key;
  if (generation !== undefined) event.generation = generation;
  return event;
}

function parentClick(action) {
  return click("parent", action);
}

function childClick(key, generation, action) {
  return click("child", action, key, generation);
}

function coreEvents() {
  return [
    childClick("a", 1, CHILD_ADD),
    childClick("b", 1, CHILD_ADD),
    parentClick(PARENT_LOCK),
    childClick("a", 1, CHILD_ADD), // Native View and physical DOM both suppress this locked Add.
    parentClick(PARENT_LOCK),
    childClick("a", 1, CHILD_RESET),
    childClick("a", 1, CHILD_RESET), // Reset at zero must be disabled and produce no dispatch.
    childClick("b", 1, CHILD_ADD),
    parentClick(PARENT_REORDER),
    childClick("a", 1, CHILD_ADD), // Retained callback and publication source for the stale probes.
    parentClick(PARENT_REMOVE_A),
    { kind: "stale-callback", key: "a", generation: 1, sourceEvent: 9 },
    { kind: "publication", key: "a", generation: 1, sourceEvent: 9 },
    parentClick(PARENT_MOUNT_A),
    childClick("a", 2, CHILD_ADD),
    { kind: "stale-callback", key: "a", generation: 1, sourceEvent: 9 },
    { kind: "publication", key: "a", generation: 1, sourceEvent: 9 },
    childClick("b", 1, CHILD_RESET),
  ];
}

export function literalKeyedScenario() {
  return {
    schema: SCENARIO_SCHEMA,
    name: "keyed-modules-literal",
    events: coreEvents(),
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
  () => parentClick(PARENT_STEP_DOWN),
  () => parentClick(PARENT_STEP_UP),
  () => parentClick(PARENT_LOCK),
  () => parentClick(PARENT_INPUT_RESET),
  () => childClick("a", 2, CHILD_ADD),
  () => childClick("a", 2, CHILD_RESET),
  () => childClick("b", 1, CHILD_ADD),
  () => childClick("b", 1, CHILD_RESET),
]);

export const DEFAULT_SEEDS = Object.freeze([20261101, 20261102, 20261103]);
export const SEEDED_EXTRA_EVENTS = 18;

export function generateSeededKeyedScenario(seed, extraEvents = SEEDED_EXTRA_EVENTS) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new TypeError("seed must be uint32");
  }
  if (!Number.isSafeInteger(extraEvents) || extraEvents < 1 || extraEvents > 48) {
    throw new TypeError("extraEvents must be an integer from 1 through 48");
  }
  const random = seededRandom(seed);
  const events = coreEvents();
  for (let index = 0; index < extraEvents; index += 1) {
    events.push(SEEDED_OPERATIONS[Math.floor(random() * SEEDED_OPERATIONS.length)]());
  }
  return {
    scenario: {
      schema: SCENARIO_SCHEMA,
      name: `keyed-modules-seed-${seed}`,
      events,
    },
    metadata: {
      seed,
      eventCount: events.length,
      generator: "gobi.keyed-modules-seeded-actions/v1",
      actionTargets: [...new Set(events.filter((event) => event.kind === "click").map((event) => event.target))].sort(),
      actionPaths: [...new Set(events.filter((event) => event.kind === "click").map((event) => event.action.path))].sort(),
      includesStaleCallbackAndPublication: events.some((event) => event.kind === "stale-callback") &&
        events.some((event) => event.kind === "publication"),
    },
  };
}
