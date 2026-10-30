// Fixed boundary cases plus reproducible random click sequences for the browser parity run.

export const BUTTON_PATH = Object.freeze({ add: "1", reset: "2" });

function click(action) {
  return {
    Path: BUTTON_PATH[action],
    Event: "click",
    Value: "",
    action,
  };
}

const repeat = (action, count) => Array.from({ length: count }, () => click(action));

export const fixedScripts = Object.freeze([
  { name: "reset-while-zero", actions: [click("reset")] },
  { name: "add-once", actions: [click("add")] },
  { name: "add-then-reset", actions: [click("add"), click("reset")] },
  { name: "reset-at-zero-after-reset", actions: [click("add"), click("reset"), click("reset")] },
  { name: "interleaved", actions: [click("add"), click("add"), click("reset"), click("add"), click("reset")] },
  { name: "rapid-add-burst", actions: [...repeat("add", 32), click("reset")] },
  { name: "rapid-toggle-burst", actions: [
    ...repeat("add", 3),
    click("reset"),
    click("reset"),
    ...repeat("add", 4),
    click("reset"),
  ] },
]);

function random32(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/** Make deterministic scripts with the seed carried on every script for failure reports. */
export function seededScripts(seed, { cases = 100, maxActions = 80 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  if (!Number.isInteger(cases) || cases < 0) throw new RangeError("cases must be a non-negative integer");
  if (!Number.isInteger(maxActions) || maxActions < 1) throw new RangeError("maxActions must be a positive integer");

  const random = random32(seed);
  return Array.from({ length: cases }, (_, index) => {
    const length = 1 + Math.floor(random() * maxActions);
    const actions = Array.from({ length }, () => click(random() < 0.5 ? "add" : "reset"));
    return { name: `seed-${seed}-case-${index}`, seed, actions };
  });
}
