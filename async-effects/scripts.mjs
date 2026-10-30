// Deterministic asynchronous save, reply, and renderer replacement schedules.

export const INPUT_PATH = "0";
export const BUTTON_PATH = Object.freeze({ save: "3", reset: "4", cancel: "5" });
export const DEFAULT_SEEDS = Object.freeze([20261030, 20261031]);

export const fill = (value) => ({ kind: "fill", value });
export const type = (value) => ({ kind: "type", value });
export const click = (button) => ({ kind: "click", button, Path: BUTTON_PATH[button] });
export const swap = (host, backend) => ({ kind: "swap", host, backend });
export const staleInput = (host, value) => ({ kind: "stale-input", host, value });
export const reply = (id, { value = "", error = "" } = {}) => ({
  kind: "reply",
  id,
  value,
  error,
});

const fixed = [
  {
    name: "late-success-after-cancel",
    actions: [
      fill("cancelled request"), click("save"), click("cancel"),
      reply(1, { value: "late success" }),
    ],
  },
  {
    name: "reset-pending-request-then-late-error",
    actions: [
      fill("reset request"), click("save"), click("reset"),
      reply(1, { error: "late transport error" }),
      fill("fresh after reset"), click("save"), reply(2, { value: "fresh result" }),
    ],
  },
  {
    name: "duplicate-reply-is-recorded-once-as-applied",
    actions: [
      fill("duplicate"), click("save"), reply(1, { value: "first answer" }),
      reply(1, { value: "duplicate answer" }),
    ],
  },
  {
    name: "out-of-order-successful-replies-after-replacement",
    actions: [
      fill("first draft"), click("save"), fill("second draft"), click("save"),
      reply(2, { value: "second response" }), reply(1, { value: "late first response" }),
    ],
  },
  {
    name: "active-error-preserves-saved-value-and-retries",
    actions: [
      fill("saved first"), click("save"), reply(1, { value: "first saved result" }),
      fill("retry draft"), click("save"), reply(2, { error: "temporary failure" }),
      click("save"), reply(3, { value: "retry succeeded" }),
    ],
  },
  {
    name: "edit-pending-draft-and-swap-before-and-after-reply",
    actions: [
      fill("captured value"), click("save"), fill("unsaved edit during request"),
      swap("dom", "react"), reply(1, { value: "captured server value" }),
      swap("react", "dom"), click("save"), reply(2, { value: "next server value" }),
    ],
  },
  {
    name: "cancel-reset-and-retry-keeps-request-ids-monotonic",
    actions: [
      fill("cancel me"), click("save"), click("cancel"), click("reset"),
      reply(1, { value: "cancelled late result" }), fill("id must advance"),
      click("save"), reply(2, { value: "accepted fresh result" }),
    ],
  },
  {
    name: "swap-pending-request-deliver-old-and-new",
    actions: [
      fill("first across swap"), click("save"), swap("dom", "react"),
      fill("second across swap"), click("save"), swap("react", "dom"),
      reply(1, { value: "retired result" }), reply(2, { value: "current result" }),
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

/** Make bounded reproducible scripts with explicit, already-allocated reply IDs. */
export function seededScripts(seed, { cases = 30, maxActions = 40 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  if (!Number.isInteger(cases) || cases < 0) throw new RangeError("cases must be non-negative");
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 40) {
    throw new RangeError("maxActions must be from 1 through 40");
  }

  const random = random32(seed);
  return Array.from({ length: cases }, (_, index) => {
    const length = maxActions === 1 ? 1 : 2 + Math.floor(random() * (maxActions - 1));
    const firstDraft = choose(random, values);
    const actions = [fill(firstDraft)];
    if (length > 1) actions.push(click("save"));

    const state = {
      Draft: firstDraft,
      Saved: "",
      Saves: 0,
      NextID: length > 1 && firstDraft !== "" ? 1 : 0,
      PendingID: length > 1 && firstDraft !== "" ? 1 : 0,
      Status: length > 1 && firstDraft !== "" ? "pending" : "idle",
    };
    const allocated = state.PendingID ? [state.PendingID] : [];
    const backends = { dom: "dom", react: "react" };
    const recentlySwapped = { dom: false, react: false };

    function apply(action) {
      if (action.kind === "fill") state.Draft = action.value;
      else if (action.kind === "type") state.Draft += action.value;
      else if (action.kind === "click" && action.button === "save" && state.Draft !== "") {
        state.NextID += 1;
        state.PendingID = state.NextID;
        state.Status = "pending";
        allocated.push(state.NextID);
      } else if (action.kind === "click" && action.button === "cancel" && state.PendingID !== 0) {
        state.PendingID = 0;
        state.Status = "cancelled";
      } else if (action.kind === "click" && action.button === "reset" &&
          !(state.Draft === "" && state.Saved === "" && state.Saves === 0 && state.Status === "idle")) {
        const nextID = state.NextID;
        Object.assign(state, { Draft: "", Saved: "", Saves: 0, NextID: nextID, PendingID: 0, Status: "idle" });
      } else if (action.kind === "reply" && action.id === state.PendingID && state.PendingID !== 0) {
        state.PendingID = 0;
        if (action.error) state.Status = `error: ${action.error}`;
        else {
          state.Saved = action.value;
          state.Saves += 1;
          state.Status = "saved";
        }
      } else if (action.kind === "swap") {
        backends[action.host] = action.backend;
        recentlySwapped[action.host] = true;
      }
    }

    while (actions.length < length) {
      const choice = random();
      let action;
      if (choice < 0.16) {
        action = fill(choose(random, values));
      } else if (choice < 0.27) {
        const fragments = ["a", "b", "x", "7", "-", "🙂"];
        let fragment = "";
        const count = 1 + Math.floor(random() * 4);
        for (let character = 0; character < count; character++) fragment += choose(random, fragments);
        action = type(fragment);
      } else if (choice < 0.47) {
        action = click("save");
      } else if (choice < 0.57) {
        action = click("cancel");
      } else if (choice < 0.66) {
        action = click("reset");
      } else if (choice < 0.81 && allocated.length > 0) {
        const id = choose(random, allocated);
        action = random() < 0.18
          ? reply(id, { error: choose(random, ["temporary", "offline", "service unavailable"]) })
          : reply(id, { value: choose(random, values) });
      } else if (choice < 0.94) {
        const host = random() < 0.5 ? "dom" : "react";
        const backend = backends[host] === "dom" ? "react" : "dom";
        action = swap(host, backend);
      } else {
        const host = recentlySwapped.dom ? "dom" : recentlySwapped.react ? "react" : null;
        action = host ? staleInput(host, choose(random, values)) : fill(choose(random, values));
      }
      actions.push(action);
      apply(action);
    }

    return { name: `seed-${seed}-case-${index}`, seed, actions };
  });
}

export function defaultSeededScripts() {
  return DEFAULT_SEEDS.flatMap((seed) => seededScripts(seed));
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
