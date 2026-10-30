// Additive three-renderer schedules layered over the unchanged keyed-editor
// model scenarios. Actions keep the existing host/backend schema.
import * as keyedScripts from "../keyed-editor/scripts.mjs";

export const BACKENDS = Object.freeze(["dom", "react", "godom"]);
export const DEFAULT_SEEDS = keyedScripts.DEFAULT_SEEDS;
export const HTTP_MODES = keyedScripts.HTTP_MODES;
export const HTTP_RELEASE_MODES = keyedScripts.HTTP_RELEASE_MODES;

export const add = keyedScripts.add;
export const reset = keyedScripts.reset;
export const fill = keyedScripts.fill;
export const click = keyedScripts.click;
export const mode = keyedScripts.mode;
export const release = keyedScripts.release;
export const swap = keyedScripts.swap;
export const focus = keyedScripts.focus;
export const rawDispatch = keyedScripts.rawDispatch;
export const detachedInput = keyedScripts.detachedInput;

const freezeScript = ({ name, actions }) => Object.freeze({
  name,
  actions: Object.freeze(actions.map((action) => Object.freeze({ ...action }))),
});

const extendedBaseScripts = keyedScripts.fixedScripts.map((script) => {
  if (script.name !== "keyed-reorder-keeps-logical-focus-and-selection") return script;
  const actions = [...script.actions];
  actions.splice(actions.length - 1, 0, swap("dom", "godom"));
  return freezeScript({ ...script, actions });
});

const directedSwapScript = freezeScript({
  name: "all-candidate-actors-cover-directed-backend-swaps",
  actions: [
    swap("dom", "react"), swap("dom", "godom"), swap("dom", "dom"),
    swap("react", "dom"), swap("react", "godom"), swap("react", "react"),
    swap("godom", "dom"), swap("godom", "react"), swap("godom", "godom"),
  ],
});

export const fixedScripts = Object.freeze([...extendedBaseScripts, directedSwapScript]);

function addGodomCoverage(scripts, maxActions) {
  return scripts.map((script, index) => {
    const actions = [...script.actions];
    const coverage = swap("godom", index % 2 === 0 ? "dom" : "react");
    if (actions.length < maxActions) {
      actions.push(coverage);
    } else {
      const replaceIndex = actions.findIndex(({ kind }) => kind === "swap");
      if (replaceIndex >= 0) actions[replaceIndex] = coverage;
    }
    return { ...script, actions };
  });
}

export function seededScripts(seed, options = {}) {
  const maxActions = options.maxActions ?? 40;
  return addGodomCoverage(keyedScripts.seededScripts(seed, options), maxActions);
}

export function defaultSeededScripts() {
  return DEFAULT_SEEDS.flatMap((seed) => seededScripts(seed));
}

export const parseSeedList = keyedScripts.parseSeedList;

/** Make the existing bounded seeded schedules plus the additive fixed renderer coverage. */
export function makeScripts(options = {}) {
  const baseSchedules = keyedScripts.makeScripts(options);
  const seeded = addGodomCoverage(
    baseSchedules.slice(keyedScripts.fixedScripts.length), options.maxActions ?? 40,
  );
  return [...fixedScripts, ...seeded];
}
