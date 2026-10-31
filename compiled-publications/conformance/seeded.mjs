const SCHEMA = "gobi.compiled-publications-scenario/v1";
const PACKAGE_PATH = "github.com/samuelpmahan/gondola/fixtures/compiled/publications";

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

function click(path, name, arg = "") {
  const action = { path, event: "click", value: "" };
  return { kind: "click", ...action, action, message: { name, arg } };
}

function rendererSwap() {
  return { kind: "renderer-swap", from: "dom", to: "react", target: "root", expect: "accepted" };
}

/**
 * Generate a bounded input transcript only. State, keyed collection, capture
 * snapshots, publication ordering, and delivery decisions are computed by the
 * native and compiled Go application; this generator contains no reducer.
 */
export function generateSeededPublicationsScenario(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new TypeError("seed must be a uint32 safe integer");
  }
  const random = rngFor(seed);
  const keys = shuffled(["k0", "k1", "k2", "k3", "k4", "k5"], random);
  const physicalStartKey = random() < 0.5 ? "oak" : "elm";
  const physicalStartIndex = physicalStartKey === "oak" ? 0 : 1;
  const firstStep = random() < 0.5 ? "2" : "3";
  const laterStep = firstStep === "2" ? "1" : "2";
  const finalStep = laterStep === "3" ? "1" : "3";
  const childGenerations = new Map(keys.map((key, index) => [key, index + 4]));
  const counterOrder = shuffled(keys, random);
  const events = [
    click(`1/${physicalStartIndex}/1`, "counter.add", physicalStartKey),
    go("input.step", firstStep),
    go("input.toggleLock"),
    go("child.capture", physicalStartKey), // Locked input: no publication is appended.
    go("counter.add", physicalStartKey), // Locked input: count is unchanged.
    go("input.toggleLock"),
    go("child.capture", physicalStartKey), // Publication 1.
    go("counter.add", physicalStartKey),
    go("child.capture", physicalStartKey), // Publication 2 captures the later count.
    go("publication.deliver", "2"),
    go("publication.deliver", "1"), // Older publication is rejected by the child watermark.
    go("input.step", laterStep),
    go("child.capture", "elm"), // Publication 3 captures the current revision.
    go("input.step", finalStep),
    go("publication.deliver", "3"), // Revision changed before delivery.
  ];

  for (const key of keys) events.push(go("child.add", key));
  events.push(go("child.add", keys[0])); // Duplicate add is a no-op.
  events.push(go("child.add", "BadKey")); // Invalid key is a no-op.
  for (const key of counterOrder) events.push(go("counter.add", key));
  events.push(go("child.capture", keys[0])); // Publications 4 and 5 share one key.
  events.push(go("child.capture", keys[0]));
  events.push(go("child.capture", keys[1])); // Publication 6.
  events.push(go("child.capture", keys[2])); // Publication 7.
  events.push(go("publication.deliver", "5"));
  events.push(go("publication.deliver", "4"));
  events.push(go("publication.deliver", "7"));
  events.push(go("publication.deliver", "6"));

  events.push(go("parent.request"));
  for (const key of keys) events.push(go("child.request", key));
  events.push(go("children.swap", "oak:elm")); // Reorder while lifecycle requests are pending.
  events.push(rendererSwap());
  events.push(click("1/0/1", "counter.add", "elm")); // The live React renderer dispatches after swap.

  events.push(go("child.remove", "k0"));
  events.push(go("child.add", "k0")); // Fresh generation after key reuse.
  events.push(go("child.request", "k0"));
  const oldK0Generation = childGenerations.get("k0");
  events.push(go("complete", `child:k0:g${oldK0Generation}:r1`)); // Old generation reducer check.
  events.push(reply("child:k0:g10:r1"));
  events.push(reply("parent:g1:r1"));
  events.push(reply(`child:k1:g${childGenerations.get("k1")}:r1`));
  events.push(go("children.clear")); // Remaining children cancel in reverse presentation order.

  events.push(go("parent.request")); // r2 remains pending across remount boundary.
  events.push(go("child.add", "alt"));
  events.push(go("counter.add", "alt"));
  events.push(go("child.capture", "alt")); // Publication 8 belongs to parent generation 1.
  events.push(go("child.request", "alt"));
  events.push(go("parent.remove")); // Cancels alt then parent; publication queue is retained.
  events.push(go("complete", "child:alt:g11:r1"));
  events.push(go("complete", "parent:g1:r2"));
  events.push(go("parent.remount")); // Parent generation 12; input and queue persist.
  events.push(go("child.add", "oak")); // Child generation 13.
  events.push(go("child.capture", "oak")); // Publication 9 belongs to the remounted parent.
  events.push(go("publication.deliver", "8"));
  events.push(go("publication.deliver", "9"));
  events.push(go("publication.deliver", "9")); // Duplicate delivery is a no-op.
  events.push(go("publication.deliver", "01")); // Noncanonical ID is a no-op.
  events.push(go("children.swap", "missing:oak"));

  return {
    scenario: {
      schema: SCHEMA,
      name: `seeded-typed-keyed-publications-${seed}`,
      packagePath: PACKAGE_PATH,
      componentID: PACKAGE_PATH,
      events,
    },
    metadata: {
      seed,
      eventCount: events.length,
      initialClickKey: physicalStartKey,
      addOrder: keys,
      counterOrder,
      pendingSwapPair: ["oak", "elm"],
      reusedKey: "k0",
      oldGenerationToken: `child:k0:g${oldK0Generation}:r1`,
      newGenerationToken: "child:k0:g10:r1",
      publicationIDs: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      liveKeyBound: 8,
      mountedBrowser: seed === 20261031,
      coverage: [
        "physical-counter-click",
        "input-step-and-lock",
        "locked-capture-and-counter-no-ops",
        "captured-value-snapshot-after-counter-edit",
        "out-of-order-and-duplicate-publication-delivery",
        "stale-input-revision-rejection",
        "slice-growth-and-keyed-reorder-while-pending",
        "compatible-renderer-swap-and-live-callback",
        "remove-reuse-fresh-generation",
        "reverse-order-child-clear-cancellation",
        "parent-removal-remount-with-retained-publication-queue",
        "stale-parent-and-child-generation-rejection",
        "malformed-key-swap-and-publication-id-no-ops",
      ],
    },
  };
}

export const DEFAULT_SEEDS = Object.freeze([20261031, 20261032, 20261033]);
