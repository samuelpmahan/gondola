// Deterministic keyed collection scenarios shared by the native comparator,
// browser harness, and demo. Actions describe user/browser operations; they do
// not encode the model transitions themselves.

export const DEFAULT_SEEDS = Object.freeze([20261030, 20261031]);
export const HTTP_MODES = Object.freeze([
  "success", "error", "wrong-id", "malformed", "status", "drop", "held",
]);
export const HTTP_RELEASE_MODES = Object.freeze([
  "success", "error", "wrong-id", "malformed", "status", "drop",
]);

export const add = () => ({ kind: "add" });
export const reset = () => ({ kind: "reset" });
export const fill = (rowID, value) => ({ kind: "fill", rowID, value });
export const click = (action, rowID) => rowID === undefined
  ? ({ kind: "click", action })
  : ({ kind: "click", action, rowID });
export const mode = (selectedMode) => ({ kind: "mode", mode: selectedMode });
export const release = (id, responseMode = "success", expectedStatus = 202) => ({
  kind: "release",
  id,
  mode: responseMode,
  expectedStatus,
});
export const swap = (host, backend) => ({ kind: "swap", host, backend });
export const focus = (rowID, selectionStart, selectionEnd, selectionDirection = "none") => ({
  kind: "focus",
  rowID,
  selectionStart,
  selectionEnd,
  selectionDirection,
});
export const rawDispatch = (step) => ({ kind: "raw-dispatch", step: { ...step } });
export const detachedInput = (rowID, value) => ({ kind: "detached-input", rowID, value });

const fixed = [
  {
    name: "four-row-cap-keeps-add-disabled-and-identity-stable",
    actions: [add(), add(), add(), add(), add()],
  },
  {
    name: "keyed-reorder-keeps-logical-focus-and-selection",
    actions: [
      add(), add(), add(),
      fill(1, "first row"), fill(2, "the focused row"), fill(3, "row above focus"),
      focus(2, 4, 10, "forward"),
      swap("dom", "react"),
      click("up", 3),
      swap("dom", "dom"),
    ],
  },
  {
    name: "pending-save-edit-reorder-and-live-completion",
    actions: [
      add(), add(), fill(1, "captured server value"), fill(2, "move me above"),
      mode("held"), click("save", 1),
      fill(1, "edited while request is pending"), focus(1, 5, 14, "backward"),
      click("up", 2), release(1, "success", 202),
    ],
  },
  {
    name: "remove-pending-add-new-id-path-reuse-and-detached-event",
    actions: [
      add(), add(), fill(2, "request owned by row two"),
      mode("held"), click("save", 2), click("remove", 2), add(),
      fill(3, "new row reuses the position"),
      rawDispatch({ Path: "2/1/0", Event: "input", Value: "must be rejected", Key: "row-2-input" }),
      detachedInput(2, "detached input must be inert"),
      release(1, "success", 409),
    ],
  },
  {
    name: "reset-cancels-in-row-order-and-never-reuses-identities",
    actions: [
      click("reset"), add(), add(),
      fill(1, "pending first"), fill(2, "pending second"),
      mode("held"), click("save", 1), mode("held"), click("save", 2),
      reset(), release(1, "success", 409), release(2, "success", 409),
      add(), fill(3, "ID advanced across reset"),
    ],
  },
  {
    name: "repeat-save-cancel-and-late-replies",
    actions: [
      add(), fill(1, "first captured value"),
      mode("held"), click("save", 1),
      fill(1, "second captured value"), mode("held"), click("save", 1),
      click("cancel", 1),
      release(1, "success", 409), release(2, "error", 409),
      mode("success"), click("save", 1),
    ],
  },
  {
    name: "http-error-retry-wrong-id-malformed-status-and-drop",
    actions: [
      add(), fill(1, "retry exact draft"),
      mode("error"), click("save", 1),
      mode("success"), click("save", 1),
      fill(1, "wrong ID"), mode("wrong-id"), click("save", 1),
      fill(1, "malformed body"), mode("malformed"), click("save", 1),
      fill(1, "HTTP status"), mode("status"), click("save", 1),
      fill(1, "dropped response"), mode("drop"), click("save", 1),
    ],
  },
  {
    name: "independent-row-completions-preserve-other-row",
    actions: [
      add(), add(), fill(1, "first draft"), fill(2, "second draft"),
      mode("held"), click("save", 1), mode("held"), click("save", 2),
      focus(1, 3, 6, "forward"),
      release(1, "success", 202), release(2, "error", 202),
    ],
  },
  {
    name: "old-path-old-key-cannot-edit-row-after-up",
    actions: [
      add(), add(), fill(1, "row one"), fill(2, "row two"),
      click("up", 2),
      rawDispatch({ Path: "2/0/0", Event: "input", Value: "cross row", Key: "row-1-input" }),
      focus(2, 1, 4, "forward"),
    ],
  },
  {
    name: "deleting-focused-row-does-not-transfer-logical-focus",
    actions: [
      add(), add(), fill(1, "focused row"), fill(2, "remaining row"),
      focus(1, 2, 6, "backward"), click("remove", 1),
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
  "", "x", "same", "same", "café", "🌘<&", 'a"b', "日本語", "line feed", "  exact whitespace\n",
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

function randomCase(seed, index, random, maxActions) {
  const length = maxActions === 1 ? 1 : Math.min(maxActions, 5 + Math.floor(random() * Math.min(20, maxActions - 1)));
  const actions = [];
  const rows = [];
  let nextRowID = 0;
  let nextRequestID = 0;
  const requests = new Map();
  const backend = { dom: "dom", react: "react" };
  const recentlySwapped = { dom: false, react: false };

  function addRow() {
    nextRowID += 1;
    rows.push({ ID: nextRowID, Draft: "", PendingID: 0 });
    actions.push(add());
  }

  function cancelRequest(row) {
    if (!row.PendingID) return;
    const request = requests.get(row.PendingID);
    if (request && request.status === "pending") request.status = "cancelled";
    row.PendingID = 0;
  }

  while (actions.length < length && rows.length < 2) addRow();
  const operationBudget = Math.max(0, length - actions.length);
  for (let operation = 0; operation < operationBudget && actions.length < length; operation++) {
    const pick = random();
    const row = rows.length ? choose(random, rows) : null;
    if (!row) {
      addRow();
      continue;
    }
    if (pick < 0.20 && actions.length < length) {
      const value = choose(random, values);
      actions.push(fill(row.ID, value));
      row.Draft = value;
    } else if (pick < 0.34 && rows.length < 4) {
      addRow();
    } else if (pick < 0.47 && rows.length > 1) {
      const rowIndex = rows.indexOf(row);
      const action = random() < 0.5 ? "remove" : "up";
      if (action === "remove") {
        cancelRequest(row);
        actions.push(click(action, row.ID));
        rows.splice(rowIndex, 1);
      } else {
        actions.push(click(action, row.ID));
        if (rowIndex > 0) [rows[rowIndex - 1], rows[rowIndex]] = [rows[rowIndex], rows[rowIndex - 1]];
      }
    } else if (pick < 0.60 && row) {
      if (!row.Draft) {
        row.Draft = choose(random, ["v", "request", "🙂"]);
        actions.push(fill(row.ID, row.Draft));
      }
      if (actions.length + 2 <= length) {
        if (row.PendingID) cancelRequest(row);
        actions.push(mode("held"));
        actions.push(click("save", row.ID));
        nextRequestID += 1;
        row.PendingID = nextRequestID;
        requests.set(nextRequestID, { status: "pending", row });
      }
    } else if (pick < 0.69 && row?.PendingID) {
      cancelRequest(row);
      actions.push(click("cancel", row.ID));
    } else if (pick < 0.77 && rows.length > 0) {
      for (const candidate of rows) cancelRequest(candidate);
      actions.push(reset());
      rows.splice(0);
    } else if (pick < 0.86 && rows.length > 0) {
      const start = Math.floor(random() * (row.Draft.length + 1));
      const end = Math.min(row.Draft.length, start + Math.floor(random() * 4));
      actions.push(focus(row.ID, start, end, choose(random, ["none", "forward", "backward"])));
    } else if (pick < 0.94) {
      const host = random() < 0.5 ? "dom" : "react";
      backend[host] = backend[host] === "dom" ? "react" : "dom";
      recentlySwapped[host] = true;
      actions.push(swap(host, backend[host]));
    } else {
      const host = recentlySwapped.dom ? "dom" : recentlySwapped.react ? "react" : null;
      if (host && row) {
        const currentIndex = rows.indexOf(row);
        actions.push(rawDispatch({
          Path: `2/${currentIndex}/0`, Event: "input", Value: "stale identity", Key: "row-999999-input",
        }));
      } else if (row) {
        actions.push(fill(row.ID, choose(random, values)));
        row.Draft = actions.at(-1).value;
      }
    }
  }

  // Resolve any saved held lanes so every generated request has an explicit
  // expected terminal response (accepted 202 or canceled 409).
  for (const [id, request] of requests) {
    if (actions.length >= maxActions) break;
    if (request.status === "pending") {
      request.status = "released";
      request.row.PendingID = 0;
      actions.push(release(id, "success", 202));
    } else if (request.status === "cancelled") {
      request.status = "released";
      actions.push(release(id, "success", 409));
    }
  }

  return { name: `seed-${seed}-case-${index}`, seed, actions };
}

/** Make bounded reproducible keyed collection schedules for one unsigned seed. */
export function seededScripts(seed, { cases = 30, maxActions = 40 } = {}) {
  validateSeed(seed);
  validateOptions({ cases, maxActions });
  const random = random32(seed);
  return Array.from({ length: cases }, (_, index) => randomCase(seed, index, random, maxActions));
}

export function defaultSeededScripts() {
  return DEFAULT_SEEDS.flatMap((seed) => seededScripts(seed));
}

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
  if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)) {
    throw new RangeError("seeds must be comma-separated unsigned 32-bit integers");
  }
  if (new Set(seeds).size !== seeds.length) throw new RangeError("seeds must be unique");
  return seeds;
}

