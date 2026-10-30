// Deterministic three-session schedules. Every action names its root so the
// runner cannot accidentally route a same-numbered request through a sibling.
export const ROOTS = Object.freeze(["alpha", "beta", "gamma"]);
export const BACKENDS = Object.freeze(["dom", "react", "godom"]);
export const TEST_BACKEND = "throw-on-mount";
export const DEFAULT_SEEDS = Object.freeze([20261030, 20261031]);

export const add = (root) => ({ kind: "add", root });
export const fill = (root, rowID, value) => ({ kind: "fill", root, rowID, value });
export const save = (root, rowID) => ({ kind: "save", root, rowID });
export const click = (root, action, rowID) => ({ kind: "click", root, action, rowID });
export const focus = (root, rowID, selectionStart, selectionEnd, selectionDirection = "none") => ({
  kind: "focus", root, rowID, selectionStart, selectionEnd, selectionDirection,
});
export const replace = (root, from, backend) => ({ kind: "replace", root, from, backend });
export const release = (root, requestID, mode = "success") => ({ kind: "release", root, requestID, mode });
export const unmount = (root) => ({ kind: "unmount", root });
export const mount = (root, backend = "dom") => ({ kind: "mount", root, backend });
export const rendererFailure = (root, backend = TEST_BACKEND) => ({ kind: "renderer-failure", root, backend });

const initialBackends = Object.freeze({ alpha: "dom", beta: "react", gamma: "godom" });
const freezeScript = ({ name, seed = null, initial = initialBackends, actions }) => Object.freeze({
  name,
  seed,
  initial: Object.freeze({ ...initial }),
  actions: Object.freeze(actions.map((action) => Object.freeze({ ...action }))),
});

const heldSavesAndRootReuse = freezeScript({
  name: "identical-row-and-request-ids-held-saves-disposal-late-reply-and-root-reuse",
  actions: [
    add("alpha"), add("beta"), add("gamma"),
    fill("alpha", 1, "same row-local IDs"), fill("beta", 1, "same row-local IDs"), fill("gamma", 1, "same row-local IDs"),
    save("alpha", 1), save("beta", 1), save("gamma", 1),
    unmount("alpha"),
    release("alpha", 1),
    fill("beta", 1, "beta continues after alpha disposal"),
    release("beta", 1),
    fill("gamma", 1, "gamma continues after alpha disposal"),
    release("gamma", 1),
    mount("alpha", "react"),
    add("alpha"), fill("alpha", 1, "fresh root state"), save("alpha", 1), release("alpha", 1),
    unmount("alpha"), mount("alpha", "dom"), unmount("alpha"),
    mount("alpha", "godom"), add("alpha"),
  ],
});

function directedBackendActions() {
  const result = [];
  const rootsBySource = { dom: "alpha", react: "beta", godom: "gamma" };
  for (const source of BACKENDS) {
    const root = rootsBySource[source];
    let current = source;
    for (const target of BACKENDS) {
      if (current !== source) {
        result.push(replace(root, current, source));
        current = source;
      }
      result.push(replace(root, source, target));
      current = target;
    }
  }
  return result;
}

const replacementAndFocus = freezeScript({
  name: "all-directed-renderer-changes-preserve-focus-per-root",
  actions: [
    add("alpha"), add("beta"), add("gamma"),
    fill("alpha", 1, "alpha focus"), fill("beta", 1, "beta focus"), fill("gamma", 1, "gamma focus"),
    focus("alpha", 1, 1, 4, "forward"),
    ...directedBackendActions().filter((action) => action.root === "alpha"),
    focus("beta", 1, 2, 5, "backward"),
    ...directedBackendActions().filter((action) => action.root === "beta"),
    focus("gamma", 1, 0, 3, "forward"),
    ...directedBackendActions().filter((action) => action.root === "gamma"),
    fill("beta", 1, "beta remains interactive"),
    fill("gamma", 1, "gamma remains interactive"),
  ],
});

const failureIsolation = freezeScript({
  name: "renderer-failure-isolation-and-sibling-continuation",
  actions: [
    add("alpha"), add("beta"), add("gamma"),
    fill("alpha", 1, "alpha draft"), fill("beta", 1, "beta draft"), fill("gamma", 1, "gamma draft"),
    save("gamma", 1),
    rendererFailure("gamma"),
    fill("alpha", 1, "alpha survives failure"),
    fill("beta", 1, "beta survives failure"),
    unmount("gamma"), mount("gamma", "dom"),
    add("gamma"), fill("gamma", 1, "fresh gamma session"),
    unmount("gamma"),
  ],
});

export const fixedScripts = Object.freeze([heldSavesAndRootReuse, replacementAndFocus, failureIsolation]);

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

const values = Object.freeze(["", "same", "draft", "café", "🌘<&", "  exact whitespace\n"]);
const choose = (random, entries) => entries[Math.floor(random() * entries.length)];

function validateOptions({ cases, maxActions }) {
  if (!Number.isInteger(cases) || cases < 0) throw new RangeError("cases must be non-negative");
  if (!Number.isInteger(maxActions) || maxActions < 12 || maxActions > 40) {
    throw new RangeError("maxActions must be from 12 through 40");
  }
}

function randomCase(seed, index, random, maxActions) {
  const actions = [...ROOTS.map(add)];
  const rows = Object.fromEntries(ROOTS.map((root) => [root, { count: 1, draft: "" }]));
  const backends = { ...initialBackends };
  const pending = Object.fromEntries(ROOTS.map((root) => [root, []]));
  const nextRequest = Object.fromEntries(ROOTS.map((root) => [root, 0]));
  const length = 12 + Math.floor(random() * (maxActions - 11));

  for (const root of ROOTS) {
    const value = choose(random, values.filter((item) => item !== ""));
    actions.push(fill(root, 1, value), save(root, 1));
    rows[root].draft = value;
    nextRequest[root] = 1;
    pending[root].push(1);
  }

  const actionLimit = Math.min(length, maxActions);
  while (actions.length < actionLimit) {
    const root = choose(random, ROOTS);
    const pick = random();
    if (pick < 0.30) {
      const value = choose(random, values);
      actions.push(fill(root, 1, value));
      rows[root].draft = value;
    } else if (pick < 0.46 && rows[root].draft !== "") {
      actions.push(save(root, 1));
      nextRequest[root] += 1;
      // Saving the same row cancels its previous held request before starting
      // the next ID. Only the current request is releasable by the lab.
      pending[root] = [];
      pending[root].push(nextRequest[root]);
    } else if (pick < 0.62) {
      const value = choose(random, values);
      actions.push(fill(root, 1, value));
      rows[root].draft = value;
      if (actions.length < actionLimit) {
        actions.push(focus(root, 1, 0, Math.min(2, value.replace(/[\r\n]/g, "").length), choose(random, ["none", "forward", "backward"])));
      }
    } else if (pick < 0.82) {
      const backend = choose(random, BACKENDS);
      actions.push(replace(root, backends[root], backend));
      backends[root] = backend;
    } else if (pending[root].length > 0) {
      const requestID = pending[root].shift();
      actions.push(release(root, requestID));
    } else {
      const value = choose(random, values);
      actions.push(fill(root, 1, value));
      rows[root].draft = value;
    }
  }

  for (const root of ROOTS) {
    for (const requestID of pending[root]) {
      if (actions.length >= maxActions) break;
      actions.push(release(root, requestID));
    }
  }
  return freezeScript({ name: `seed-${seed}-case-${index}`, seed, actions });
}

export function seededScripts(seed, { cases = 30, maxActions = 40 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  validateOptions({ cases, maxActions });
  const random = random32(seed);
  return Array.from({ length: cases }, (_, index) => randomCase(seed, index, random, maxActions));
}

export function makeScripts({ seeds = DEFAULT_SEEDS, cases = 30, maxActions = 40 } = {}) {
  if (!Array.isArray(seeds) || seeds.length === 0) throw new RangeError("seeds must be a non-empty array");
  if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) || new Set(seeds).size !== seeds.length) {
    throw new RangeError("seeds must be unique unsigned 32-bit integers");
  }
  validateOptions({ cases, maxActions });
  return [...fixedScripts, ...seeds.flatMap((seed) => seededScripts(seed, { cases, maxActions }))];
}

export function parseSeedList(value) {
  const seeds = String(value).split(",").map((part) => part.trim()).map(Number);
  if (seeds.length === 0 || seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) ||
      new Set(seeds).size !== seeds.length) {
    throw new RangeError("seeds must be comma-separated unique unsigned 32-bit integers");
  }
  return seeds;
}
