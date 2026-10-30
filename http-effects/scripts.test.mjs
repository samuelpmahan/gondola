import assert from "node:assert/strict";
import test from "node:test";

import {
  BUTTON_PATH,
  DEFAULT_SEEDS,
  fixedScripts,
  makeScripts,
  parseSeedList,
  seededScripts,
} from "./scripts.mjs";

const routeModes = new Set(["success", "error", "wrong-id", "malformed", "status", "drop", "held"]);
const releaseModes = new Set(["success", "error", "wrong-id", "malformed", "status", "drop"]);

test("fixed HTTP schedules cover real response outcomes, hold/release, swaps, and retry", () => {
  const names = fixedScripts.map(({ name }) => name);
  for (const expected of [
    "http-success",
    "held-cancel-release",
    "held-release-success",
    "held-reset-late-release",
    "held-pending-swap",
    "wrong-id-response",
    "malformed-response",
    "http-status-error",
    "server-error-retry",
    "drop-network-error",
    "alternating-save-cancel-reset",
  ]) assert.ok(names.includes(expected), `missing ${expected}`);

  const actions = fixedScripts.flatMap(({ actions: scriptActions }) => scriptActions);
  const modes = new Set(actions.filter(({ kind }) => kind === "mode").map(({ mode }) => mode));
  assert.deepEqual([...modes].sort(), [...routeModes].sort());
  assert.ok(actions.some(({ kind }) => kind === "release"));
  assert.ok(actions.some(({ kind }) => kind === "swap"));
  const released = (name) => fixedScripts.find((script) => script.name === name).actions
    .find((action) => action.kind === "release");
  assert.equal(released("held-release-success").expectedStatus, 202);
  for (const name of ["held-cancel-release", "held-reset-late-release", "held-pending-swap"]) {
    assert.equal(released(name).expectedStatus, 409, `${name} is a rejected late release`);
  }
});

test("fixed and seeded scripts use the documented action wire schema", () => {
  for (const script of [...fixedScripts, ...seededScripts(20261030, { cases: 8, maxActions: 20 })]) {
    assert.equal(typeof script.name, "string");
    assert.ok(Array.isArray(script.actions));
    assert.ok(script.actions.length > 0);
    assert.ok(script.actions.length <= 40);
    for (const action of script.actions) {
      switch (action.kind) {
        case "fill":
        case "type":
          assert.equal(typeof action.value, "string");
          break;
        case "click":
          assert.ok(Object.hasOwn(BUTTON_PATH, action.button));
          assert.equal(action.Path, BUTTON_PATH[action.button]);
          break;
        case "swap":
          assert.ok(["dom", "react"].includes(action.host));
          assert.ok(["dom", "react"].includes(action.backend));
          break;
        case "stale-input":
          assert.ok(["dom", "react"].includes(action.host));
          assert.equal(typeof action.value, "string");
          break;
        case "mode":
          assert.ok(routeModes.has(action.mode));
          break;
        case "release":
          assert.ok(Number.isSafeInteger(action.id) && action.id > 0);
          assert.ok(releaseModes.has(action.mode));
          assert.ok([202, 409].includes(action.expectedStatus));
          break;
        default:
          assert.fail(`unknown action kind ${String(action.kind)} in ${script.name}`);
      }
    }
  }
});

test("makeScripts is reproducible and uses explicit unique seeds", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261030, 20261031]);
  assert.deepEqual(makeScripts(), [
    ...fixedScripts,
    ...seededScripts(DEFAULT_SEEDS[0]),
    ...seededScripts(DEFAULT_SEEDS[1]),
  ]);
  assert.deepEqual(makeScripts({ seeds: [7, 8], cases: 3, maxActions: 12 }),
    makeScripts({ seeds: [7, 8], cases: 3, maxActions: 12 }));
  assert.equal(makeScripts({ seeds: [7], cases: 2, maxActions: 12 }).length,
    fixedScripts.length + 2);
  assert.throws(() => makeScripts({ seeds: [1, 1] }), /unique/);
  assert.throws(() => makeScripts({ seeds: [1], cases: -1 }), /cases/);
  assert.throws(() => makeScripts({ seeds: [1], maxActions: 41 }), /maxActions/);
  assert.deepEqual(parseSeedList("7, 8"), [7, 8]);
  assert.throws(() => parseSeedList("7,7"), /unique/);
  assert.throws(() => parseSeedList("7,"), /comma-separated/);
  for (let maxActions = 1; maxActions <= 40; maxActions++) {
    for (const script of seededScripts(9, { cases: 3, maxActions })) {
      assert.ok(script.actions.length <= maxActions,
        `${script.name} has ${script.actions.length} actions with maxActions=${maxActions}`);
    }
  }
});
