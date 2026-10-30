// Deterministic public-API traces shared by the independent model, browser
// fixture, and native composition replay command.

export const DEFAULT_SEEDS = Object.freeze([20261030, 20261031]);
export const DEFAULT_CASES = 30;
export const DEFAULT_MAX_ACTIONS = 40;

const freeze = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = freeze(item);
    return Object.freeze(copy);
  }
  return value;
};

/** Value that a single-line HTML text input can send in an input event. */
export function browserTextInputValue(requested) {
  if (typeof requested !== "string") throw new TypeError("browser text input value must be a primitive string");
  return requested.replace(/[\r\n]/g, "");
}

const call = (method, ...args) => freeze({ method, args });
const step = (Path, Key, Event = "click", Value = "") => ({ Path, Event, Value, Key });
const add = (id) => call("dispatch", id, step("0", "add"));
const edit = (id, rowID, value) =>
  call("dispatch", id, step("2/" + String(rowID - 1) + "/0", "row-" + rowID + "-input", "input",
    browserTextInputValue(value)));
const save = (id, rowID) =>
  call("dispatch", id, step("2/" + String(rowID - 1) + "/5", "row-" + rowID + "-save", "click", String(rowID)));

function script(name, actions, seed = null, inputWitnesses = []) {
  return Object.freeze({
    name,
    seed,
    actions: Object.freeze(actions.map(freeze)),
    inputWitnesses: Object.freeze(inputWitnesses.map(freeze)),
  });
}

const inputsAndPublication = script("inputs-publication-races", [
  call("create"),
  call("createChild", 1),
  call("createChild", 2),
  call("snapshot", 1),
  call("snapshot", 2),
  call("setChildInputs", 1, 2, { Title: "Research branch", ReadOnly: false }),
  call("setChildInputs", 1, 2, { Title: "Research branch", ReadOnly: false }),
  call("setChildInputs", 3, 2, { Title: "wrong parent", ReadOnly: false }),
  add(1),
  call("snapshot", 1),
  add(2),
  call("snapshot", 2),
  edit(2, 1, "draft to save"),
  save(2, 1),
  call("effects", 2),
  call("complete", 2, { ID: 1, Value: "saved at completion", Error: "" }),
  call("dispatch", 2, step("2/0/9", "row-1-publish", "click", "1/2")),
  edit(2, 1, "draft changed after save"),
  call("publish", 2, 1, 1),
  call("publish", 2, 1, 2),
  call("publish", 2, 1, 2),
  call("snapshot", 1),
  call("changes"),
], null, [
  {
    actionIndex: 12,
    requested: "draft \r\nto save",
    effective: "draft to save",
    key: "row-1-input",
  },
  {
    actionIndex: 17,
    requested: "draft changed \nafter save",
    effective: "draft changed after save",
    key: "row-1-input",
  },
]);

const readonlyReply = script("readonly-pending-reply", [
  call("create"),
  call("createChild", 1),
  add(2),
  edit(2, 1, "held request"),
  save(2, 1),
  call("effects", 2),
  call("setChildInputs", 1, 2, { Title: "Locked child", ReadOnly: true }),
  add(2),
  edit(2, 1, "blocked replacement"),
  call("complete", 2, { ID: 1, Value: "completed while read-only", Error: "" }),
  call("publish", 2, 1, 1),
  call("snapshot", 2),
  call("snapshot", 1),
  call("changes"),
]);

const directParentLifecycle = script("grandchild-routing-disposal-and-recreation", [
  call("create"),
  call("createChild", 1),
  call("createChild", 2),
  call("setChildInputs", 1, 2, { Title: "Parent-owned title", ReadOnly: false }),
  call("setChildInputs", 2, 3, { Title: "Grandchild-owned title", ReadOnly: false }),
  add(2),
  edit(2, 1, "child draft"),
  save(2, 1),
  call("effects", 2),
  call("complete", 2, { ID: 1, Value: "child saved", Error: "" }),
  call("publish", 2, 1, 1),
  add(3),
  edit(3, 1, "grandchild draft"),
  save(3, 1),
  call("effects", 3),
  call("complete", 3, { ID: 1, Value: "grandchild saved", Error: "" }),
  call("publish", 3, 1, 1),
  call("snapshot", 1),
  call("snapshot", 2),
  call("dispose", 3),
  call("snapshot", 2),
  call("disposeTree", 1),
  call("create"),
  call("createChild", 4),
  call("snapshot", 4),
  call("snapshot", 5),
]);

export const fixedScripts = Object.freeze([
  inputsAndPublication,
  readonlyReply,
  directParentLifecycle,
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

const pick = (random, values) => values[Math.floor(random() * values.length)];
const draftValues = Object.freeze([
  "", "draft", "café", "🌘<&", "same saved text",
  "line one\nline two", "line left\r\nline right",
]);

function seededCase(seed, index, maxActions) {
  const random = random32((seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const actions = [call("create"), call("createChild", 1), call("createChild", 2)];
  const inputWitnesses = [];
  const sessions = new Map([
    [1, { parent: 0, readOnly: false, rows: [], nextRowID: 0, nextRequestID: 0, pending: new Map() }],
    [2, { parent: 1, readOnly: false, rows: [], nextRowID: 0, nextRequestID: 0, pending: new Map() }],
    [3, { parent: 2, readOnly: false, rows: [], nextRowID: 0, nextRequestID: 0, pending: new Map() }],
  ]);
  actions.push(call("snapshot", 1), call("snapshot", 2), call("snapshot", 3));

  let revision = 0;
  let grandchildRevision = 0;
  const target = () => pick(random, [2, 3]);
  const limit = Math.max(0, maxActions - actions.length - 3);
  for (let index = 0; index < limit; index += 1) {
    const id = target();
    const state = sessions.get(id);
    const row = state.rows.length === 0 ? null : pick(random, state.rows);
    const choice = Math.floor(random() * 8);

    if (choice === 0) {
      const title = pick(random, ["", "child-" + index, "🌘", "café"]);
      const readOnly = random() < 0.25;
      actions.push(call("setChildInputs", 1, 2, { Title: title, ReadOnly: readOnly }));
      revision += 1;
      sessions.get(2).readOnly = readOnly;
    } else if (choice === 1) {
      const title = pick(random, ["leaf-" + index, "🌿", ""]);
      const readOnly = random() < 0.25;
      actions.push(call("setChildInputs", 2, 3, { Title: title, ReadOnly: readOnly }));
      grandchildRevision += 1;
      sessions.get(3).readOnly = readOnly;
    } else if (choice === 2 && state.rows.length < 4) {
      actions.push(add(id));
      if (!state.readOnly) {
        state.nextRowID += 1;
        state.rows.push({ id: state.nextRowID, draft: "", saved: "", saves: 0 });
      }
    } else if (choice === 3 && row) {
      const value = pick(random, draftValues);
      const effective = browserTextInputValue(value);
      const actionIndex = actions.length;
      actions.push(edit(id, row.id, value));
      if (effective !== value) {
        inputWitnesses.push({
          actionIndex,
          requested: value,
          effective,
          key: "row-" + String(row.id) + "-input",
        });
      }
      if (!state.readOnly) row.draft = effective;
    } else if (choice === 4 && row) {
      if (!state.readOnly && row.draft !== "") {
        state.nextRequestID += 1;
        // Replacing a request leaves the older reply callback releasable, but
        // only the newest request for this row can still be accepted.
        state.pending.set(state.nextRequestID, row.id);
        if (!state.pendingByRow) state.pendingByRow = new Map();
        state.pendingByRow.set(row.id, state.nextRequestID);
      }
      actions.push(save(id, row.id));
    } else if (choice === 5 && state.pending.size > 0) {
      const [requestID, rowID] = [...state.pending.entries()][0];
      state.pending.delete(requestID);
      const error = random() < 0.18 ? "seeded error" : "";
      actions.push(call("complete", id, {
        ID: requestID,
        Value: "reply-" + index,
        Error: error,
      }));
      if (state.pendingByRow?.get(rowID) === requestID) {
        state.pendingByRow.delete(rowID);
        const targetRow = state.rows.find((candidate) => candidate.id === rowID);
        if (targetRow && error === "") {
          targetRow.saved = "reply-" + index;
          targetRow.saves += 1;
        }
      }
    } else if (choice === 6 && row) {
      const currentRevision = id === 2 ? revision : grandchildRevision;
      const useStale = random() < 0.5 && currentRevision > 0;
      actions.push(call("publish", id, row.id,
        useStale ? currentRevision - 1 : currentRevision));
    } else {
      actions.push(call("snapshot", id));
    }
  }
  actions.push(call("tree"), call("list"), call("changes"));
  return script("seed-" + seed + "-case-" + index, actions, seed, inputWitnesses);
}

function validateOptions({ cases, maxActions }) {
  if (!Number.isInteger(cases) || cases < 0) throw new RangeError("cases must be a non-negative integer");
  if (!Number.isInteger(maxActions) || maxActions < 9 || maxActions > DEFAULT_MAX_ACTIONS) {
    throw new RangeError("maxActions must be from 9 through " + DEFAULT_MAX_ACTIONS);
  }
}

/** Reproducible bounded application traces. Each script has an explicit seed. */
export function seededScripts(seed, { cases = DEFAULT_CASES, maxActions = DEFAULT_MAX_ACTIONS } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  validateOptions({ cases, maxActions });
  return Object.freeze(Array.from({ length: cases }, (_, index) => seededCase(seed, index, maxActions)));
}

export function makeScripts({
  seeds = DEFAULT_SEEDS,
  cases = DEFAULT_CASES,
  maxActions = DEFAULT_MAX_ACTIONS,
} = {}) {
  if (!Array.isArray(seeds) || seeds.some((seed) =>
    !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)) {
    throw new RangeError("seeds must be an array of unsigned 32-bit integers");
  }
  if (new Set(seeds).size !== seeds.length) throw new RangeError("seeds must be unique");
  validateOptions({ cases, maxActions });
  return Object.freeze([
    ...fixedScripts,
    ...seeds.flatMap((seed) => seededScripts(seed, { cases, maxActions })),
  ]);
}

const clone = (value) => {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    return copy;
  }
  return value;
};

/** Execute one script against the independent model using the native frame shape. */
export function runReferenceScript(reference, selectedScript) {
  if (!reference || typeof reference !== "object" || !Array.isArray(selectedScript?.actions)) {
    throw new TypeError("runReferenceScript requires a reference manager and a script with actions");
  }
  return selectedScript.actions.map((action) => {
    let result;
    try {
      const method = reference[action.method];
      if (typeof method !== "function") throw new TypeError("unknown composition method " + action.method);
      result = method(...action.args);
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error) };
    }

    const tree = reference.tree();
    const sessions = reference.list().map((id) => ({ id, snapshot: reference.snapshot(id) }));
    // Like the native replay command, each frame drains changes after the
    // operation. A standalone changes action already drained them for result.
    const changes = reference.changes();
    return {
      action: clone(action),
      result: clone(result),
      frame: { tree: clone(tree), sessions: clone(sessions), changes: clone(changes) },
    };
  });
}
