// Deterministic bounded nested-session witnesses for the comparative runner.
export const BACKENDS = Object.freeze(["dom", "react", "godom"]);
export const TEST_BACKEND = "throw-on-mount";
export const DEFAULT_SEEDS = Object.freeze([20261030, 20261031]);
export const DEFAULT_CASES = 30;
export const DEFAULT_MAX_ACTIONS = 40;
export const MAX_GENERATED_SESSIONS = 6;
const MAX_ROWS = 4;

export const root = (name, backend = "dom", expectError = false) => ({
  kind: "root", name, backend, ...(expectError ? { expectError: true } : {}),
});
export const child = (name, parent, backend = "dom", expectError = false) => ({
  kind: "child", name, parent, backend, ...(expectError ? { expectError: true } : {}),
});
export const add = (name) => ({ kind: "add", name });
export const fill = (name, rowID, value) => ({ kind: "fill", name, rowID, value });
export const save = (name, rowID) => ({ kind: "save", name, rowID });
export const focus = (name, rowID, start, end, direction = "none") => ({
  kind: "focus", name, rowID, start, end, direction,
});
export const replace = (name, backend) => ({ kind: "replace", name, backend });
export const dispose = (name) => ({ kind: "dispose", name });
export const release = (name, requestID, value = "reply", error = "") => ({
  kind: "release", name, requestID, value, error,
});
export const staleRelease = (name, requestID, value = "late reply", error = "") => ({
  kind: "stale-release", name, requestID, value, error,
});

function freezeScript({ name, seed = null, actions }) {
  return Object.freeze({
    name,
    seed,
    actions: Object.freeze(actions.map((action) => Object.freeze({ ...action }))),
  });
}

const postorderAndSiblingIsolation = freezeScript({
  name: "nested-postorder-cancel-and-sibling-isolation",
  actions: [
    root("oak", "dom"),
    child("bark", "oak", "react"),
    child("leaf", "bark", "godom"),
    child("twig", "oak", "dom"),
    root("elm", "react"),
    add("leaf"), fill("leaf", 1, "leaf pending"), save("leaf", 1),
    add("elm"), fill("elm", 1, "same local request ID"), save("elm", 1),
    add("twig"), fill("twig", 1, "twig pending"), save("twig", 1),
    add("bark"), fill("bark", 1, "bark pending"), save("bark", 1),
    add("oak"), fill("oak", 1, "root row one"), save("oak", 1),
    add("oak"), fill("oak", 2, "root row two"), save("oak", 2),
    add("oak"),
    add("oak"),
    dispose("oak"),
    staleRelease("leaf", 1),
    release("elm", 1, "sibling root completed"),
    dispose("elm"),
  ],
});

const nestedRendererRetention = freezeScript({
  name: "nested-renderer-changes-preserve-child-dom-and-focus",
  actions: [
    root("oak", "dom"),
    child("branch", "oak", "dom"),
    child("bud", "branch", "godom"),
    root("elm", "react"),
    add("oak"), fill("oak", 1, "parent selection"),
    add("branch"), fill("branch", 1, "child selection"),
    add("bud"), fill("bud", 1, "grandchild input"),
    focus("oak", 1, 2, 8, "forward"), replace("oak", "react"),
    focus("branch", 1, 1, 6, "backward"), replace("branch", "godom"),
    fill("branch", 1, "child still interactive"),
    focus("bud", 1, 0, 5, "forward"), replace("bud", "react"),
    add("elm"), fill("elm", 1, "unaffected sibling"),
    replace("oak", "godom"),
    focus("branch", 1, 0, 4, "forward"),
  ],
});

const disposalAndRecreation = freezeScript({
  name: "dispose-fences-late-replies-and-allows-parent-recreation",
  actions: [
    root("broken", TEST_BACKEND, true),
    child("orphan", "missing", "dom", true),
    root("orchard", "dom"),
    child("fruit", "orchard", "react"),
    child("seed", "fruit", "dom"),
    add("seed"), fill("seed", 1, "held before disposal"), save("seed", 1),
    dispose("orchard"),
    root("orchard", "react"),
    child("fruit", "orchard", "react"),
    child("seed", "fruit", "dom"),
    staleRelease("seed", 1, "must be fenced"),
    add("orchard"), fill("orchard", 1, "fresh parent state"), save("orchard", 1),
    release("orchard", 1, "fresh request accepted"),
    dispose("orchard"),
  ],
});

export const fixedScripts = Object.freeze([
  postorderAndSiblingIsolation,
  nestedRendererRetention,
  disposalAndRecreation,
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

const values = Object.freeze(["", "draft", "same local IDs", "café", "🌘<&", "parent child input"]);
const choose = (random, items) => items[Math.floor(random() * items.length)];

function validateOptions({ cases, maxActions }) {
  if (!Number.isInteger(cases) || cases < 0) throw new RangeError("cases must be a non-negative integer");
  if (!Number.isInteger(maxActions) || maxActions < 0 || maxActions > DEFAULT_MAX_ACTIONS) {
    throw new RangeError(`maxActions must be from 0 through ${DEFAULT_MAX_ACTIONS}`);
  }
}

function targetLength(random, maxActions) {
  if (maxActions <= 12) return maxActions;
  return 12 + Math.floor(random() * (maxActions - 11));
}

function randomCase(seed, index, random, maxActions) {
  const actions = [];
  const sessions = new Map();
  const stale = [];
  let rootIndex = 0;
  let childIndex = 0;

  const addRoot = () => {
    const name = `root-${rootIndex++}`;
    const backend = choose(random, BACKENDS);
    actions.push(root(name, backend));
    sessions.set(name, { parent: null, depth: 1, backend, rows: [], nextRequestID: 0 });
  };
  const addChild = (parentName) => {
    const parent = sessions.get(parentName);
    const name = `child-${childIndex++}`;
    const backend = choose(random, BACKENDS);
    actions.push(child(name, parentName, backend));
    sessions.set(name, { parent: parentName, depth: parent.depth + 1, backend, rows: [], nextRequestID: 0 });
  };

  const limit = targetLength(random, maxActions);
  if (actions.length < limit) addRoot();
  if (actions.length < limit) addRoot();
  if (actions.length < limit) addChild("root-0");
  if (actions.length < limit) addChild("child-0");

  while (actions.length < limit) {
    const candidates = [];
    const liveEntries = [...sessions.entries()];
    if (sessions.size < MAX_GENERATED_SESSIONS) {
      for (const [name, session] of liveEntries) {
        if (session.depth < 6) candidates.push({ kind: "child", name });
      }
      if (liveEntries.filter(([, session]) => session.parent === null).length < MAX_GENERATED_SESSIONS) {
        candidates.push({ kind: "root" });
      }
    }
    for (const [name, session] of liveEntries) {
      if (session.rows.length < MAX_ROWS) candidates.push({ kind: "add", name });
      for (const row of session.rows) {
        candidates.push({ kind: "fill", name, row });
        if (row.draft !== "") candidates.push({ kind: "save", name, row });
        candidates.push({ kind: "focus", name, row });
        if (row.pending !== 0) candidates.push({ kind: "release", name, row });
      }
      for (const backend of BACKENDS) {
        if (backend !== session.backend) candidates.push({ kind: "replace", name, backend });
      }
      candidates.push({ kind: "dispose", name });
    }
    for (const request of stale) candidates.push({ kind: "stale-release", request });
    if (candidates.length === 0) {
      if (sessions.size === 0) addRoot();
      else {
        const [name, session] = [...sessions.entries()][0];
        if (session.rows.length < MAX_ROWS) actions.push(add(name));
        else actions.push(fill(name, session.rows[0].ID, choose(random, values)));
      }
      continue;
    }

    const selected = choose(random, candidates);
    if (selected.kind === "root") {
      addRoot();
    } else if (selected.kind === "child") {
      addChild(selected.name);
    } else if (selected.kind === "add") {
      const session = sessions.get(selected.name);
      const ID = session.rows.length + 1;
      session.rows.push({ ID, draft: "", pending: 0 });
      actions.push(add(selected.name));
    } else if (selected.kind === "fill") {
      const value = choose(random, values);
      selected.row.draft = value;
      actions.push(fill(selected.name, selected.row.ID, value));
    } else if (selected.kind === "save") {
      const session = sessions.get(selected.name);
      session.nextRequestID += 1;
      selected.row.pending = session.nextRequestID;
      actions.push(save(selected.name, selected.row.ID));
    } else if (selected.kind === "focus") {
      const end = Math.min(3, selected.row.draft.length);
      const direction = end === 0 ? "none" : choose(random, ["forward", "backward"]);
      actions.push(focus(selected.name, selected.row.ID, 0, end, direction));
    } else if (selected.kind === "replace") {
      const session = sessions.get(selected.name);
      session.backend = selected.backend;
      actions.push(replace(selected.name, selected.backend));
    } else if (selected.kind === "release") {
      const requestID = selected.row.pending;
      selected.row.pending = 0;
      actions.push(release(selected.name, requestID, "seeded reply", choose(random, ["", "", "seeded failure"])));
    } else if (selected.kind === "dispose") {
      const subtree = new Set([selected.name]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const [name, session] of sessions) {
          if (!subtree.has(name) && subtree.has(session.parent)) {
            subtree.add(name);
            changed = true;
          }
        }
      }
      for (const name of subtree) {
        const session = sessions.get(name);
        for (const row of session.rows) {
          if (row.pending) stale.push({ name, requestID: row.pending });
        }
        sessions.delete(name);
      }
      actions.push(dispose(selected.name));
    } else if (selected.kind === "stale-release") {
      const [request] = stale.splice(stale.indexOf(selected.request), 1);
      actions.push(staleRelease(request.name, request.requestID, "fenced seeded reply"));
    }
  }

  return freezeScript({ name: `seed-${seed}-case-${index}`, seed, actions });
}

export function seededScripts(seed, { cases = DEFAULT_CASES, maxActions = DEFAULT_MAX_ACTIONS } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  validateOptions({ cases, maxActions });
  const random = random32(seed);
  return Array.from({ length: cases }, (_, index) => randomCase(seed, index, random, maxActions));
}

export function makeScripts({ seeds = DEFAULT_SEEDS, cases = DEFAULT_CASES, maxActions = DEFAULT_MAX_ACTIONS } = {}) {
  if (!Array.isArray(seeds) || seeds.length === 0 ||
      seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) ||
      new Set(seeds).size !== seeds.length) {
    throw new RangeError("seeds must be a non-empty array of unique unsigned 32-bit integers");
  }
  validateOptions({ cases, maxActions });
  return [
    ...fixedScripts,
    ...seeds.flatMap((seed) => seededScripts(seed, { cases, maxActions })),
  ];
}

export function parseSeedList(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RangeError("seeds must be comma-separated unique unsigned 32-bit integers");
  }
  const parts = value.split(",").map((part) => part.trim());
  if (parts.some((part) => !/^(?:0|[1-9]\d*)$/.test(part))) {
    throw new RangeError("seeds must be comma-separated unique unsigned 32-bit integers");
  }
  const seeds = parts.map(Number);
  if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) || new Set(seeds).size !== seeds.length) {
    throw new RangeError("seeds must be comma-separated unique unsigned 32-bit integers");
  }
  return seeds;
}
