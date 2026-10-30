// Deterministic HTTP save, cancellation, retry, and renderer-swap schedules.

export const INPUT_PATH = "0";
export const BUTTON_PATH = Object.freeze({ save: "3", reset: "4", cancel: "5" });
export const DEFAULT_SEEDS = Object.freeze([20261030, 20261031]);
export const HTTP_MODES = Object.freeze(["success", "error", "wrong-id", "malformed", "status", "drop", "held"]);
export const HTTP_RELEASE_MODES = Object.freeze(["success", "error", "wrong-id", "malformed", "status", "drop"]);

export const fill = (value) => ({ kind: "fill", value });
export const type = (value) => ({ kind: "type", value });
export const click = (button) => ({ kind: "click", button, Path: BUTTON_PATH[button] });
export const swap = (host, backend) => ({ kind: "swap", host, backend });
export const staleInput = (host, value) => ({ kind: "stale-input", host, value });
export const mode = (selectedMode) => ({ kind: "mode", mode: selectedMode });
export const release = (id, responseMode = "success", expectedStatus = 202) => ({
  kind: "release",
  id,
  mode: responseMode,
  expectedStatus,
});

const fixed = [
  {
    name: "http-success",
    actions: [fill("HTTP success value"), mode("success"), click("save")],
  },
  {
    name: "held-cancel-release",
    actions: [
      fill("held then cancelled"), mode("held"), click("save"), click("cancel"), release(1, "success", 409),
    ],
  },
  {
    name: "held-release-success",
    actions: [fill("held until explicit release"), mode("held"), click("save"), release(1)],
  },
  {
    name: "held-reset-late-release",
    actions: [
      fill("held across reset"), mode("held"), click("save"), click("reset"), release(1, "success", 409),
      fill("request after reset"), mode("success"), click("save"),
    ],
  },
  {
    name: "held-pending-swap",
    actions: [
      fill("held before swap"), mode("held"), click("save"), swap("dom", "react"),
      fill("replacement after swap"), mode("success"), click("save"), release(1, "success", 409),
      swap("react", "dom"),
    ],
  },
  {
    name: "wrong-id-response",
    actions: [fill("wrong id"), mode("wrong-id"), click("save")],
  },
  {
    name: "malformed-response",
    actions: [fill("malformed body"), mode("malformed"), click("save")],
  },
  {
    name: "http-status-error",
    actions: [fill("HTTP status"), mode("status"), click("save")],
  },
  {
    name: "server-error-retry",
    actions: [
      fill("server rejects first attempt"), mode("error"), click("save"),
      type(" then retry"), mode("success"), click("save"),
    ],
  },
  {
    name: "drop-network-error",
    actions: [fill("connection dropped"), mode("drop"), click("save")],
  },
  {
    name: "alternating-save-cancel-reset",
    actions: [
      fill("first held save"), mode("held"), click("save"), click("cancel"), click("reset"),
      fill("second held save"), mode("held"), click("save"), fill("replacement save"),
      mode("success"), click("save"), release(1, "success", 409), release(2, "success", 409), click("reset"),
      fill("save after reset"), mode("success"), click("save"),
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
  'a"b',
  "日本語",
  "line feed",
  "  exact whitespace\n",
]);

function choose(random, list) {
  return list[Math.floor(random() * list.length)];
}

function validateSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
}

function validateOptions({ cases, maxActions }) {
  if (!Number.isInteger(cases) || cases < 0) throw new RangeError("cases must be non-negative");
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 40) {
    throw new RangeError("maxActions must be from 1 through 40");
  }
}

function responseFor(state, id, responseMode, value) {
  if (state.PendingID !== id) return;
  state.PendingID = 0;
  if (responseMode === "success") {
    state.Saved = value;
    state.Saves += 1;
    state.Status = "saved";
  } else if (responseMode === "error") {
    state.Status = "error: server rejected";
  } else if (responseMode === "status") {
    state.Status = "error: http status 503";
  } else if (responseMode === "drop") {
    state.Status = "error: network error";
  } else {
    state.Status = "error: invalid response";
  }
}

function applyAction(state, action, held, backend, recentlySwapped, selectedMode) {
  if (action.kind === "fill") state.Draft = action.value;
  else if (action.kind === "type") state.Draft += action.value;
  else if (action.kind === "click" && action.button === "save" && state.Draft !== "") {
    const oldID = state.PendingID;
    state.NextID += 1;
    state.PendingID = state.NextID;
    state.Status = "pending";
    if (selectedMode === "held") held.add(state.PendingID);
    else responseFor(state, state.PendingID, selectedMode, state.Draft);
    if (oldID !== 0) held.add(oldID);
  } else if (action.kind === "click" && action.button === "cancel" && state.PendingID !== 0) {
    held.add(state.PendingID);
    state.PendingID = 0;
    state.Status = "cancelled";
  } else if (action.kind === "click" && action.button === "reset" &&
      !(state.Draft === "" && state.Saved === "" && state.Saves === 0 && state.Status === "idle")) {
    const nextID = state.NextID;
    if (state.PendingID !== 0) held.add(state.PendingID);
    Object.assign(state, { Draft: "", Saved: "", Saves: 0, NextID: nextID, PendingID: 0, Status: "idle" });
  } else if (action.kind === "swap") {
    backend[action.host] = action.backend;
    recentlySwapped[action.host] = true;
  } else if (action.kind === "release") {
    held.delete(action.id);
    responseFor(state, action.id, action.mode, state.Draft);
  }
}

/** Make bounded reproducible HTTP schedules for one unsigned 32-bit seed. */
export function seededScripts(seed, { cases = 30, maxActions = 40 } = {}) {
  validateSeed(seed);
  validateOptions({ cases, maxActions });

  const random = random32(seed);
  return Array.from({ length: cases }, (_, index) => {
    const length = maxActions === 1 ? 1 : 2 + Math.floor(random() * (maxActions - 1));
    const firstDraft = choose(random, values);
    const actions = [fill(firstDraft)];
    const state = {
      Draft: firstDraft,
      Saved: "",
      Saves: 0,
      NextID: 0,
      PendingID: 0,
      Status: "idle",
    };
    const held = new Set();
    const backend = { dom: "dom", react: "react" };
    const recentlySwapped = { dom: false, react: false };

    if (length > 2 && firstDraft !== "") {
      const initialMode = choose(random, ["success", "success", "error", "wrong-id", "malformed", "status", "drop"]);
      actions.push(mode(initialMode), click("save"));
      applyAction(state, mode(initialMode), held, backend, recentlySwapped, initialMode);
      applyAction(state, click("save"), held, backend, recentlySwapped, initialMode);
    } else if (length > 1) {
      actions.push(click("save"));
      applyAction(state, click("save"), held, backend, recentlySwapped, "success");
    }

    while (actions.length < length) {
      const choice = random();
      let action;
      let modeForAction = "success";
      if (choice < 0.18) {
        action = fill(choose(random, values));
      } else if (choice < 0.29) {
        const fragments = ["a", "b", "x", "7", "-", "🙂"];
        let fragment = "";
        const count = 1 + Math.floor(random() * 4);
        for (let character = 0; character < count; character++) fragment += choose(random, fragments);
        action = type(fragment);
      } else if (choice < 0.50) {
        if (state.Draft !== "" && actions.length + 1 < length) {
          modeForAction = choose(random, ["success", "success", "error", "wrong-id", "malformed", "status", "drop"]);
          const selected = mode(modeForAction);
          actions.push(selected);
          applyAction(state, selected, held, backend, recentlySwapped, modeForAction);
        }
        action = click("save");
      } else if (choice < 0.61) {
        action = click("cancel");
      } else if (choice < 0.71) {
        action = click("reset");
      } else if (choice < 0.79 && held.size > 0) {
        action = release(choose(random, [...held]));
      } else if (choice < 0.94) {
        const host = random() < 0.5 ? "dom" : "react";
        const nextBackend = backend[host] === "dom" ? "react" : "dom";
        action = swap(host, nextBackend);
      } else {
        const host = recentlySwapped.dom ? "dom" : recentlySwapped.react ? "react" : null;
        action = host ? staleInput(host, choose(random, values)) : fill(choose(random, values));
      }
      actions.push(action);
      applyAction(state, action, held, backend, recentlySwapped, modeForAction);
    }

    // Do not leave generated laboratory responses held after a case ends.
    while (held.size > 0 && actions.length < maxActions) {
      const id = [...held].sort((left, right) => left - right)[0];
      const action = release(id);
      actions.push(action);
      applyAction(state, action, held, backend, recentlySwapped, "success");
    }

    return { name: `seed-${seed}-case-${index}`, seed, actions };
  });
}

export function defaultSeededScripts() {
  return DEFAULT_SEEDS.flatMap((seed) => seededScripts(seed));
}

/** Combine fixed HTTP outcomes with reproducible seeded cases. */
export function makeScripts({ seeds = DEFAULT_SEEDS, cases = 30, maxActions = 40 } = {}) {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    throw new RangeError("seeds must be a non-empty array of unsigned 32-bit integers");
  }
  seeds.forEach(validateSeed);
  if (new Set(seeds).size !== seeds.length) throw new RangeError("seeds must be unique");
  validateOptions({ cases, maxActions });
  return [...fixedScripts, ...seeds.flatMap((seed) => seededScripts(seed, { cases, maxActions }))];
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
