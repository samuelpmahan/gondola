// Deterministic edit/save/reset and renderer replacement schedules.

export const INPUT_PATH = "0";
export const BUTTON_PATH = Object.freeze({ save: "3", reset: "4" });

export const fill = (value) => ({ kind: "fill", value });
export const type = (value) => ({ kind: "type", value });
export const click = (button) => ({ kind: "click", button, Path: BUTTON_PATH[button] });
export const swap = (host, backend) => ({ kind: "swap", host, backend });
export const staleInput = (host, value) => ({ kind: "stale-input", host, value });

const fixed = [
  {
    name: "empty-input-disabled-save-and-reset",
    actions: [fill(""), click("save"), click("reset"), fill("x"), click("reset"), click("reset")],
  },
  {
    name: "repeated-saves-reset-and-reset-at-zero",
    actions: [fill("same draft"), click("save"), click("save"), click("reset"), click("reset")],
  },
  {
    name: "alternating-edit-save-reset",
    actions: [
      fill("first"), click("save"), fill("second"), click("save"),
      click("reset"), fill("third"), click("save"), click("reset"),
    ],
  },
  {
    name: "unicode-and-html-escaping",
    actions: [
      fill(`🌍 <&> "quotes" 'apostrophe'`), click("save"),
      fill("日本語🙂e\u0301"), click("save"), fill(""), click("reset"),
    ],
  },
  {
    name: "ordinary-multikeystroke-typing",
    actions: [type("draft"), click("save"), type("-updated"), click("save")],
  },
  {
    name: "typing-after-unsaved-draft-swaps",
    actions: [
      fill("draft"), swap("dom", "react"), type("-dom"),
      swap("react", "dom"), type("-react"), click("save"),
    ],
  },
  {
    name: "swap-with-unsaved-draft-and-stale-detached-input",
    actions: [
      fill("unsaved across swap"),
      swap("dom", "react"),
      staleInput("dom", "stale detached value"),
      swap("dom", "dom"),
      click("save"),
      swap("react", "dom"),
    ],
  },
  {
    name: "both-hosts-swap-with-unsaved-text",
    actions: [
      fill("draft survives both replacements"),
      swap("dom", "react"),
      swap("react", "dom"),
      swap("dom", "dom"),
      swap("react", "react"),
      click("save"),
    ],
  },
];

export const fixedScripts = Object.freeze(fixed.map(({ name, actions }) => Object.freeze({
  name,
  actions: Object.freeze(actions.map((action) => Object.freeze({ ...action }))),
})));

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

const values = Object.freeze([
  "",
  "x",
  "same",
  "same",
  "café",
  "🌘<&",
  "a\"b",
  "日本語",
  "line feed",
]);

/** Make bounded reproducible scripts with guaranteed edits and real swaps. */
export function seededScripts(seed, { cases = 100, maxActions = 80 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  if (!Number.isInteger(cases) || cases < 0) throw new RangeError("cases must be non-negative");
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 80) {
    throw new RangeError("maxActions must be from 1 through 80");
  }

  const random = random32(seed);
  return Array.from({ length: cases }, (_, index) => {
    const length = 1 + Math.floor(random() * maxActions);
    const actions = [fill(values[Math.floor(random() * values.length)])];
    const currentBackend = { dom: "dom", react: "react" };
    const lastSwapped = { dom: false, react: false };

    if (length > 1) {
      const host = random() < 0.5 ? "dom" : "react";
      const backend = currentBackend[host] === "dom" ? "react" : "dom";
      actions.push(swap(host, backend));
      currentBackend[host] = backend;
      lastSwapped[host] = true;
    }

    while (actions.length < length) {
      const choice = random();
      if (choice < 0.23) {
        actions.push(fill(values[Math.floor(random() * values.length)]));
      } else if (choice < 0.36) {
        const fragments = ["a", "b", "x", "7", "-"];
        const count = 1 + Math.floor(random() * 5);
        let fragment = "";
        for (let character = 0; character < count; character++) {
          fragment += fragments[Math.floor(random() * fragments.length)];
        }
        actions.push(type(fragment));
      } else if (choice < 0.58) {
        actions.push(click("save"));
      } else if (choice < 0.72) {
        actions.push(click("reset"));
      } else if (choice < 0.9) {
        const host = random() < 0.5 ? "dom" : "react";
        const backend = currentBackend[host] === "dom" ? "react" : "dom";
        actions.push(swap(host, backend));
        currentBackend[host] = backend;
        lastSwapped[host] = true;
      } else {
        const host = lastSwapped.dom ? "dom" : lastSwapped.react ? "react" : null;
        if (host) actions.push(staleInput(host, values[Math.floor(random() * values.length)]));
        else actions.push(fill(values[Math.floor(random() * values.length)]));
      }
    }

    return { name: `seed-${seed}-case-${index}`, seed, actions };
  });
}

export function parseSeedList(value) {
  const parts = String(value).split(",");
  if (parts.some((part) => part.trim() === "")) {
    throw new RangeError("seeds must be comma-separated unsigned 32-bit integers");
  }
  const seeds = parts.map((part) => Number(part.trim()));
  if (seeds.length === 0 || seeds.some((seed) =>
    !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)) {
    throw new RangeError("seeds must be comma-separated unsigned 32-bit integers");
  }
  if (new Set(seeds).size !== seeds.length) throw new RangeError("seeds must be unique");
  return seeds;
}
