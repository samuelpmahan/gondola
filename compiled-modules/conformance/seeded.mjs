const SCENARIO_SCHEMA = "gobi.compiled-modules-scenario/v1";
export const DEFAULT_SEEDS = Object.freeze([20261031, 20261032, 20261033]);
export const SEEDED_EVENT_COUNT = 40;

function action(target, path) {
  return { kind: "click", target, action: { path, event: "click", value: "" } };
}

const OPERATIONS = Object.freeze([
  () => action("parent", "1"), // step.down; may be disabled at the lower bound
  () => action("parent", "2"), // step.up; may be disabled at the upper bound
  () => action("parent", "3"), // lock.toggle
  () => action("parent", "4"), // input.reset
  () => action("child", "2/1"), // counter.add; may be disabled while locked
  () => action("child", "2/2"), // counter.reset; disabled at zero
]);

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

/**
 * Deterministic action-script generator only. It tracks no Go state and uses
 * physical click intents so the native/direct/browser adapters resolve each
 * current Go view independently, including controls that are disabled then.
 */
export function generateSeededModuleScenario(seed, eventCount = SEEDED_EVENT_COUNT) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError("seed must be uint32");
  if (!Number.isSafeInteger(eventCount) || eventCount < 24 || eventCount > 80) {
    throw new TypeError("eventCount must be an integer from 24 through 80");
  }
  const random = seededRandom(seed);
  const events = [
    action("child", "2/1"),
    action("parent", "2"),
    action("child", "2/1"),
    action("parent", "3"),
    action("child", "2/1"),
    action("child", "2/2"),
    action("parent", "4"),
    action("child", "2/1"),
    action("child", "2/2"),
    action("parent", "1"),
    action("parent", "2"),
    action("parent", "3"),
  ];
  while (events.length < eventCount) {
    const index = Math.floor(random() * OPERATIONS.length);
    events.push(OPERATIONS[index]());
  }
  return {
    scenario: {
      schema: SCENARIO_SCHEMA,
      name: `seeded-module-pair-${seed}`,
      events,
    },
    metadata: {
      seed,
      eventCount,
      generator: "gobi.compiled-modules-seeded-actions/v1",
      actionKinds: [...new Set(events.map((event) => event.target))].sort(),
      targetPaths: [...new Set(events.map((event) => `${event.target}:${event.action.path}`))].sort(),
      containsOnlyPhysicalActions: events.every((event) => event.kind === "click" && event.action.event === "click"),
    },
  };
}
