const SCHEMA = "gobi.compiled-children-scenario/v1";
const PACKAGE_PATH = "github.com/samuelpmahan/gondola/fixtures/compiled/children";

function rngFor(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
  };
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function go(name, arg = "") {
  return { kind: "go-message", message: { name, arg } };
}

function reply(token) {
  return { kind: "effect-reply", token };
}

function swap(from, to) {
  return { kind: "renderer-swap", from, to, target: "root", expect: "accepted" };
}

function childToken(key, generation, requestSeq = 1) {
  return `child:${key}:g${generation}:r${requestSeq}`;
}

/** Generate bounded message schedules only. This is an input generator, not
 * an application model: Go/native, GoScript direct, and the mounted browser
 * each compute their own state and effects from this immutable event stream. */
export function generateSeededChildrenScenario(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new TypeError("seed must be a uint32 safe integer");
  }
  const random = rngFor(seed);
  const keys = shuffled(["k0", "k1", "k2", "k3", "k4", "k5"], random);
  const physicalStartKey = random() < 0.5 ? "oak" : "elm";
  const physicalStartIndex = physicalStartKey === "oak" ? 0 : 1;
  let nextGeneration = 3;
  const generations = new Map();
  const events = [
    {
      kind: "click",
      path: `1/${physicalStartIndex}/1`,
      event: "click",
      message: { name: "counter.add", arg: physicalStartKey },
    },
    go("children.clear"),
    go("child.add", "BadKey"),
    go("child.remove", "missing"),
    go("child.request", "missing"),
    go("counter.add", "missing"),
    go("children.swap", `${keys[0]}:${keys[0]}`),
    go("children.swap", "malformed"),
  ];

  for (const key of keys) {
    events.push(go("child.add", key));
    nextGeneration += 1;
    generations.set(key, nextGeneration);
  }
  events.push(go("child.add", keys[0])); // duplicate add must preserve the existing value and generation.

  const counters = shuffled(keys, random);
  for (const key of counters) events.push(go("counter.add", key));

  for (const key of keys) events.push(go("child.request", key));
  events.push(go("child.request", keys[0])); // duplicate pending request is a deterministic no-op.
  const swapPair = shuffled(keys, random).slice(0, 2);
  events.push(go("children.swap", `${swapPair[0]}:${swapPair[1]}`)); // reorder while every request is pending.
  events.push(swap("dom", "react"));

  const reusedKey = keys[0];
  const oldToken = childToken(reusedKey, generations.get(reusedKey));
  events.push(go("child.remove", reusedKey)); // cancellation retires the old generation.
  events.push(go("child.add", reusedKey));
  nextGeneration += 1;
  generations.set(reusedKey, nextGeneration);
  const newToken = childToken(reusedKey, generations.get(reusedKey));
  events.push(go("child.request", reusedKey));
  events.push(go("complete", oldToken)); // direct stale-generation reducer check.
  events.push(reply(newToken));

  const survivingKeys = shuffled(keys.slice(1), random);
  const earlyCompletions = survivingKeys.slice(0, 2);
  for (const key of earlyCompletions) events.push(reply(childToken(key, generations.get(key))));
  events.push(go("children.clear")); // pending child cancellation must be reverse presentation order.
  events.push(go("children.clear")); // clearing an empty collection is a no-op.

  const alternatingKey = "alt";
  events.push(go("child.add", alternatingKey));
  nextGeneration += 1;
  generations.set(alternatingKey, nextGeneration);
  events.push(go("child.remove", alternatingKey));
  events.push(go("child.add", alternatingKey));
  nextGeneration += 1;
  generations.set(alternatingKey, nextGeneration);
  events.push(go("counter.add", alternatingKey));
  events.push(go("child.remove", alternatingKey));

  events.push(go("parent.request"));
  events.push(go("parent.request")); // duplicate pending parent request.
  events.push(go("child.add", keys[0]));
  nextGeneration += 1;
  generations.set(keys[0], nextGeneration);
  events.push(go("child.add", keys[1]));
  nextGeneration += 1;
  generations.set(keys[1], nextGeneration);
  events.push(go("child.request", keys[0]));
  events.push(go("child.request", keys[1]));
  const childPair = shuffled([keys[0], keys[1]], random);
  events.push(go("children.swap", `${childPair[0]}:${childPair[1]}`));
  events.push(reply("parent:g1:r1"));
  events.push(go("parent.request"));
  events.push(go("parent.remove")); // cancels child work in reverse order, then parent r2.
  events.push(go("complete", childToken(keys[0], generations.get(keys[0]))));
  events.push(go("complete", childToken(keys[1], generations.get(keys[1]))));
  events.push(go("complete", "parent:g1:r2"));
  events.push(go("child.add", "dead")); // child actions remain inert while the parent is retired.
  events.push(go("parent.remount"));
  events.push(go("parent.remount")); // remounting an already-live parent is a no-op.

  return {
    scenario: {
      schema: SCHEMA,
      name: `seeded-keyed-children-${seed}`,
      packagePath: PACKAGE_PATH,
      componentID: PACKAGE_PATH,
      events,
    },
    metadata: {
      seed,
      eventCount: events.length,
      keyOrder: keys,
      physicalStartKey,
      counterOrder: counters,
      pendingSwapPair: swapPair,
      alternatingKey,
      reusedKey,
      oldToken,
      newToken,
      bounds: { maximumChildren: keys.length, events: events.length },
      coverage: [
        "physical-keyed-child-counter-click",
        "growth-beyond-initial-slice-capacity",
        "empty-collection-clear",
        "malformed-key-and-swap-no-ops",
        "unknown-remove-request-counter-no-ops",
        "duplicate-add-and-request-no-ops",
        "alternating-add-remove-reuse",
        "pending-reorder",
        "stale-generation-reducer-completion",
        "child-first-clear-cancellation",
        "parent-remove-and-remount-generation",
      ],
    },
  };
}

export const DEFAULT_SEEDS = Object.freeze([20261031, 20261032, 20261033]);
