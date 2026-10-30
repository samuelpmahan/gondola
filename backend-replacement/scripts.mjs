// Deterministic interaction schedules for the renderer replacement harness.
// A click is issued through each mounted host, while a swap changes only the
// selected host's renderer and leaves that host's Go runtime alive.

export const BUTTON_PATH = Object.freeze({ add: "1", reset: "2" });

function click(action) {
  return { kind: "click", Path: BUTTON_PATH[action], Event: "click", Value: "", action };
}

function swap(host, backend) {
  return { kind: "swap", host, backend };
}

function unknown(host) {
  return { kind: "unknown-backend", host, backend: "__missing_backend__" };
}

const fixed = [
  {
    name: "replacement-roundtrip",
    actions: [
      click("add"),
      swap("dom", "react"),
      click("add"),
      swap("react", "dom"),
      click("reset"),
      swap("dom", "dom"),
      swap("react", "react"),
      click("add"),
      unknown("dom"),
      click("reset"),
      click("reset"),
    ],
  },
  {
    name: "replacement-at-zero-and-disabled-reset",
    actions: [
      swap("react", "dom"),
      click("reset"),
      swap("react", "react"),
      click("add"),
      swap("dom", "react"),
      click("reset"),
      swap("dom", "dom"),
      click("reset"),
    ],
  },
  {
    name: "interleaved-backends",
    actions: [
      click("add"),
      click("add"),
      swap("dom", "react"),
      click("reset"),
      swap("react", "dom"),
      click("add"),
      swap("dom", "dom"),
      click("reset"),
      swap("react", "react"),
    ],
  },
];

export const fixedScripts = Object.freeze(fixed.map((script) => Object.freeze({
  ...script,
  actions: Object.freeze(script.actions),
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

/** Build reproducible mixed click/swap scripts while guaranteeing real swaps. */
export function seededScripts(seed, { cases = 100, maxActions = 80 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  if (!Number.isInteger(cases) || cases < 0) throw new RangeError("cases must be a non-negative integer");
  if (!Number.isInteger(maxActions) || maxActions < 1) throw new RangeError("maxActions must be a positive integer");

  const random = random32(seed);
  return Array.from({ length: cases }, (_, index) => {
    const length = 1 + Math.floor(random() * maxActions);
    const backendByHost = { dom: "dom", react: "react" };
    const actions = [];

    // Every generated case exercises both starting backends when its action
    // budget allows two steps, and at least one real replacement otherwise.
    const firstHost = random() < 0.5 ? "dom" : "react";
    const secondHost = firstHost === "dom" ? "react" : "dom";
    for (const host of [firstHost, secondHost].slice(0, Math.min(2, length))) {
      const backend = backendByHost[host] === "dom" ? "react" : "dom";
      actions.push(swap(host, backend));
      backendByHost[host] = backend;
    }

    for (let actionIndex = actions.length; actionIndex < length; actionIndex++) {
      const choice = random();
      if (choice < 0.16) {
        const host = random() < 0.5 ? "dom" : "react";
        const backend = backendByHost[host] === "dom" ? "react" : "dom";
        actions.push(swap(host, backend));
        backendByHost[host] = backend;
      } else if (choice < 0.2) {
        actions.push(unknown(random() < 0.5 ? "dom" : "react"));
      } else {
        actions.push(click(random() < 0.5 ? "add" : "reset"));
      }
    }

    return { name: `seed-${seed}-case-${index}`, seed, actions };
  });
}
